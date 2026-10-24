// Moment detection for the Phase 4 director (`docs/designs/worker-and-renderer.md`): `findMoments` scans the newest
// snapshot (with a 1.5 s earlier snapshot for chase gap-closing), the recent effects and the recent ticker items,
// applies the 30 s repeat penalty and returns candidates sorted by score descending.

import { AGENT_FIELD, AGENT_STRIDE, HEADER_WORDS } from '../interpolate.js';
import {
    applyRepeatPenalty,
    CHASE_GAP_RATIO,
    CHASE_MAX_DISTANCE,
    MOMENT_KIND,
    scoreAlarmChorus,
    scoreBirthCluster,
    scoreChase,
    scoreEffect,
    scoreTickerItem,
} from './scoring.js';

/** Default `hunting` flag bit (bit 16) when `ready.layout.flags.HUNTING` is not yet populated. */
const DEFAULT_HUNTING_FLAG = 1 << 16;
/** Cluster radius for `alarm-chorus` (3 calls in 3 s). */
export const ALARM_CLUSTER_RADIUS = 800;
/** Cluster window for `alarm-chorus` in simulated seconds. */
export const ALARM_WINDOW_S = 3;
/** Cluster radius for `birth-cluster` (6 births in 4 s). */
export const BIRTH_CLUSTER_RADIUS = 600;
/** Cluster window for `birth-cluster` in simulated seconds. */
export const BIRTH_WINDOW_S = 4;

/**
 * @typedef {object} AgentRecord
 * @property {number} genomeId
 * @property {number} lineageId
 * @property {number} spec
 * @property {number} x
 * @property {number} y
 * @property {number} angle
 * @property {number} size
 * @property {number} speed
 * @property {number} flags
 */

/**
 * @typedef {object} MomentCandidate
 * @property {string} kind one of `MOMENT_KIND`
 * @property {number} score candidate score (after repeat penalty)
 * @property {number} x focus x in world units
 * @property {number} y focus y in world units
 * @property {number} [hunterId] chase hunter genomeId
 * @property {number} [preyId] chase prey genomeId
 * @property {string} [hunterSpec] chase hunter specialisation name
 * @property {string} [preySpec] chase prey specialisation name
 * @property {number} [victimId] escape victim genomeId
 * @property {number} [biterId] escape/kill biter genomeId
 * @property {number} [count] cluster size for `alarm-chorus` and `birth-cluster`
 * @property {number} [lineageId] lineage id for `family-lead`, `extinct` and `last-stand`
 * @property {string} [tickerKind] original ticker item kind for `first`
 */

/**
 * Wraps an angle delta into `[-PI, PI]`.
 * @param {number} a angle in radians
 * @param {number} b angle in radians
 * @returns {number} shortest signed difference `a - b` in radians
 */
function angleDiff(a, b) {
    return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

/**
 * Reads alive agents from a raw worker snapshot (`{ u32, f32 }`) or an array of `AgentRecord`s.
 * @param {{u32?: Uint32Array, f32?: Float32Array} | readonly AgentRecord[] | null | undefined} source snapshot or list
 * @returns {AgentRecord[]} extracted agent records
 */
export function readSnapshotAgents(source) {
    if (!source) {
        return [];
    }
    if (Array.isArray(source)) {
        return source;
    }
    const { u32, f32 } = /** @type {{u32: Uint32Array, f32: Float32Array}} */ (source);
    const count = u32[1];
    const out = /** @type {AgentRecord[]} */ (new Array(count));
    for (let i = 0; i < count; i++) {
        const o = HEADER_WORDS + i * AGENT_STRIDE;
        out[i] = {
            x: f32[o + AGENT_FIELD.X],
            y: f32[o + AGENT_FIELD.Y],
            angle: f32[o + AGENT_FIELD.ANGLE],
            size: f32[o + AGENT_FIELD.SIZE],
            spec: u32[o + AGENT_FIELD.SPEC],
            lineageId: u32[o + AGENT_FIELD.LINEAGE],
            genomeId: u32[o + AGENT_FIELD.GENOME],
            speed: f32[o + AGENT_FIELD.SPEED],
            flags: u32[o + AGENT_FIELD.FLAGS],
        };
    }
    return out;
}

/**
 * Tests whether `(hunter, prey)` forms a gap-closing chase and returns its candidate or null.
 * @param {{hunter: AgentRecord, prey: AgentRecord, prevHunter: AgentRecord, prevPrey: AgentRecord}} pair agent pair
 * @param {{biteArc: number, maxVelocity: number, hunterSpec: string, preySpec: string}} meta world rules and spec names
 * @returns {MomentCandidate | null} chase moment or null
 */
function evaluateChasePair({ hunter, prey, prevHunter, prevPrey }, { biteArc, maxVelocity, hunterSpec, preySpec }) {
    const dx = prey.x - hunter.x;
    const dy = prey.y - hunter.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0 || distance > CHASE_MAX_DISTANCE) {
        return null;
    }
    const earlierDistance = Math.hypot(prevPrey.x - prevHunter.x, prevPrey.y - prevHunter.y);
    if (distance > earlierDistance * CHASE_GAP_RATIO + 1e-6) {
        return null;
    }
    const bearing = Math.atan2(dy, dx);
    if (
        Math.abs(angleDiff(bearing, hunter.angle)) > biteArc ||
        Math.abs(angleDiff(prey.angle, bearing)) > Math.PI / 2
    ) {
        return null;
    }
    return {
        kind: MOMENT_KIND.CHASE,
        score: scoreChase({ distance, hunterSpeed: hunter.speed, preySpeed: prey.speed, maxVelocity }),
        x: (hunter.x + prey.x) / 2,
        y: (hunter.y + prey.y) / 2,
        hunterId: hunter.genomeId,
        preyId: prey.genomeId,
        hunterSpec,
        preySpec,
    };
}

/**
 * Matches one active hunter against all smaller non-hunters in the current and earlier snapshots.
 * @param {{hunter: AgentRecord, prevHunter: AgentRecord}} hunterPair current and earlier hunter record
 * @param {readonly AgentRecord[]} agents current snapshot agents
 * @param {Map<number, AgentRecord>} earlierByGenome earlier snapshot agents by genomeId
 * @param {{canHuntBySpec: Map<number, boolean>, nameBySpec: Map<number, string>,
 *   biteArc: number, maxVelocity: number}} rules spec tables and world rules
 * @returns {MomentCandidate[]} chase candidates for this hunter
 */
function matchHunterPreys({ hunter, prevHunter }, agents, earlierByGenome, rules) {
    const { canHuntBySpec, nameBySpec, biteArc, maxVelocity } = rules;
    const hunterSpec = String(nameBySpec.get(hunter.spec));
    const out = /** @type {MomentCandidate[]} */ ([]);
    for (const prey of agents) {
        const prevPrey = earlierByGenome.get(prey.genomeId);
        if (canHuntBySpec.get(prey.spec) || prey.size >= hunter.size || prevPrey === undefined) {
            continue;
        }
        const candidate = evaluateChasePair(
            { hunter, prey, prevHunter, prevPrey },
            { biteArc, maxVelocity, hunterSpec, preySpec: String(nameBySpec.get(prey.spec)) },
        );
        if (candidate !== null) {
            out.push(candidate);
        }
    }
    return out;
}

/**
 * Finds all gap-closing `chase` candidates between hunting predators and smaller non-hunters.
 * @param {readonly AgentRecord[]} agents current snapshot agents
 * @param {Map<number, AgentRecord>} earlierByGenome agents from ~1.5 s earlier keyed by genomeId
 * @param {{info: Record<string, any>, huntingFlag: number}} ctx `ready.info` and the `hunting` flag mask
 * @returns {MomentCandidate[]} chase candidates
 */
function findChaseMoments(agents, earlierByGenome, { info, huntingFlag }) {
    const specs = /** @type {{index: number, name: string, canHunt: boolean}[]} */ (info.specs);
    const rules = {
        canHuntBySpec: new Map(specs.map((s) => [s.index, Boolean(s.canHunt)])),
        nameBySpec: new Map(specs.map((s) => [s.index, s.name])),
        biteArc: info.biteArc,
        maxVelocity: info.maxVelocity,
    };
    const out = /** @type {MomentCandidate[]} */ ([]);
    for (const hunter of agents) {
        const prevHunter = earlierByGenome.get(hunter.genomeId);
        if (rules.canHuntBySpec.get(hunter.spec) && (hunter.flags & huntingFlag) !== 0 && prevHunter !== undefined) {
            out.push(...matchHunterPreys({ hunter, prevHunter }, agents, earlierByGenome, rules));
        }
    }
    return out;
}

/**
 * Finds the largest spatial cluster of effects within `radius` of a centre effect and returns its centroid and count.
 * @param {readonly {x: number, y: number}[]} points effects in the time window
 * @param {number} radius cluster radius in world units
 * @returns {{count: number, x: number, y: number}} largest cluster summary (`count: 0` when empty)
 */
function largestCluster(points, radius) {
    let best = /** @type {{x: number, y: number}[]} */ ([]);
    for (const center of points) {
        const neighbors = points.filter((p) => Math.hypot(p.x - center.x, p.y - center.y) <= radius);
        if (neighbors.length > best.length) {
            best = neighbors;
        }
    }
    if (best.length === 0) {
        return { count: 0, x: 0, y: 0 };
    }
    const sumX = best.reduce((acc, p) => acc + p.x, 0);
    const sumY = best.reduce((acc, p) => acc + p.y, 0);
    return { count: best.length, x: sumX / best.length, y: sumY / best.length };
}

/**
 * Scores one effect and resolves its focus (tracking the live victim for `escape` / `smoke-escape`).
 * @param {import('../renderer/effects-player.js').Effect} effect the effect record
 * @param {{ageS: number, kinds: Record<string, number>, eatenCause: number,
 *   currentByGenome: Map<number, AgentRecord>}} ctx scoring context
 * @returns {MomentCandidate | null} candidate or null
 */
function candidateFromEffect(effect, { ageS, kinds, eatenCause, currentByGenome }) {
    const scored = scoreEffect(effect, { ageS, kinds, eatenCause });
    if (scored === null) {
        return null;
    }
    const isEscape = scored.kind === MOMENT_KIND.ESCAPE || scored.kind === MOMENT_KIND.SMOKE_ESCAPE;
    const victim = isEscape ? currentByGenome.get(effect.a) : undefined;
    return {
        kind: scored.kind,
        score: scored.score,
        x: victim ? victim.x : effect.x,
        y: victim ? victim.y : effect.y,
        victimId: effect.a,
        biterId: effect.b,
    };
}

/**
 * Builds a cluster candidate when `scoreFn(cluster.count)` is positive.
 * @param {string} kind moment kind
 * @param {readonly {x: number, y: number}[]} points effects in window
 * @param {number} radius cluster radius
 * @param {(count: number) => number} scoreFn cluster scoring function
 * @returns {MomentCandidate[]} zero or one cluster candidate
 */
function clusterMoment(kind, points, radius, scoreFn) {
    const cluster = largestCluster(points, radius);
    const score = scoreFn(cluster.count);
    return score > 0 ? [{ kind, score, x: cluster.x, y: cluster.y, count: cluster.count }] : [];
}

/**
 * Collects single-effect (`pack-kill`, `kill`, `escape`, `smoke-escape`, `smoke-screen`) and clustered-effect
 * (`alarm-chorus`, `birth-cluster`) moments.
 * @param {readonly import('../renderer/effects-player.js').Effect[]} effects recent effect records
 * @param {{tick: number, ticksPerSecond: number, layout: Record<string, any>,
 *   currentByGenome: Map<number, AgentRecord>}} ctx timing, layout and alive agent lookup
 * @returns {MomentCandidate[]} effect-derived moment candidates
 */
function findEffectMoments(effects, { tick, ticksPerSecond, layout, currentByGenome }) {
    const kinds = layout.effectKinds;
    const eatenCause = layout.deathCauses.EATEN;
    const out = /** @type {MomentCandidate[]} */ ([]);
    const alarms = /** @type {{x: number, y: number}[]} */ ([]);
    const births = /** @type {{x: number, y: number}[]} */ ([]);

    for (const effect of effects) {
        const ageS = (tick - effect.tick) / ticksPerSecond;
        if (ageS < 0) {
            continue;
        }
        if (effect.kind === kinds.ALARM && ageS <= ALARM_WINDOW_S) {
            alarms.push(effect);
        } else if (effect.kind === kinds.BORN && ageS <= BIRTH_WINDOW_S) {
            births.push(effect);
        }
        const single = candidateFromEffect(effect, { ageS, kinds, eatenCause, currentByGenome });
        if (single !== null) {
            out.push(single);
        }
    }

    out.push(...clusterMoment(MOMENT_KIND.ALARM_CHORUS, alarms, ALARM_CLUSTER_RADIUS, scoreAlarmChorus));
    out.push(...clusterMoment(MOMENT_KIND.BIRTH_CLUSTER, births, BIRTH_CLUSTER_RADIUS, scoreBirthCluster));
    return out;
}

/**
 * Computes the centroid of alive agents belonging to `lineageId`, or null when none are alive.
 * @param {readonly AgentRecord[]} agents alive agents
 * @param {number | undefined} lineageId target lineage
 * @returns {{x: number, y: number} | null} lineage centroid or null
 */
function lineageCentroid(agents, lineageId) {
    const members = agents.filter((a) => a.lineageId === lineageId);
    if (members.length === 0) {
        return null;
    }
    const sumX = members.reduce((acc, a) => acc + a.x, 0);
    const sumY = members.reduce((acc, a) => acc + a.y, 0);
    return { x: sumX / members.length, y: sumY / members.length };
}

/**
 * Resolves the focus point of a ticker item: lineage centroid for `family-lead`, else the item's `{x, y}` or world centre.
 * @param {{lineageId?: number, x?: number, y?: number}} item ticker item
 * @param {string} kind scored moment kind
 * @param {readonly AgentRecord[]} agents alive agents
 * @param {{x: number, y: number}} center world centre fallback
 * @returns {{x: number, y: number}} focus coordinates
 */
function tickerFocus(item, kind, agents, center) {
    if (kind === MOMENT_KIND.FAMILY_LEAD) {
        const centroid = lineageCentroid(agents, item.lineageId);
        if (centroid !== null) {
            return centroid;
        }
    }
    if (typeof item.x === 'number' && typeof item.y === 'number') {
        return { x: item.x, y: item.y };
    }
    return center;
}

/**
 * Collects ticker-derived moments (`family-lead`, `extinct`, `last-stand`, `first`) within the last 10 s.
 * @param {readonly {tick: number, kind: string, lineageId?: number, x?: number, y?: number}[]} ticker recent ticker items
 * @param {{tick: number, ticksPerSecond: number, agents: readonly AgentRecord[], info: Record<string, any>}} ctx world state
 * @returns {MomentCandidate[]} ticker-derived moment candidates
 */
function findTickerMoments(ticker, { tick, ticksPerSecond, agents, info }) {
    const center = { x: info.worldWidth / 2, y: info.worldHeight / 2 };
    const out = /** @type {MomentCandidate[]} */ ([]);
    for (const item of ticker) {
        const ageS = (tick - item.tick) / ticksPerSecond;
        const scored = scoreTickerItem(item, ageS);
        if (scored === null) {
            continue;
        }
        const focus = tickerFocus(item, scored.kind, agents, center);
        out.push({
            kind: scored.kind,
            score: scored.score,
            x: focus.x,
            y: focus.y,
            lineageId: item.lineageId,
            tickerKind: item.kind,
        });
    }
    return out;
}

/**
 * Scores candidate moments from the newest snapshot, an earlier snapshot (~1.5 s ago), recent effects and ticker items.
 * @param {{snapshot: {u32?: Uint32Array, f32?: Float32Array} | readonly AgentRecord[] | null,
 *   earlierSnapshot?: {u32?: Uint32Array, f32?: Float32Array} | readonly AgentRecord[] | null,
 *   effects?: readonly import('../renderer/effects-player.js').Effect[],
 *   ticker?: readonly {tick: number, kind: string, lineageId?: number, x?: number, y?: number}[],
 *   info: Record<string, any>, layout: Record<string, any>, tick: number,
 *   lastShownS?: Readonly<Record<string, number>>}} input world snapshots, effects, ticker and timing
 * @returns {MomentCandidate[]} candidates sorted by score descending
 */
export function findMoments({
    snapshot,
    earlierSnapshot = null,
    effects = [],
    ticker = [],
    info,
    layout,
    tick,
    lastShownS,
}) {
    const ticksPerSecond = info.ticksPerSecond ?? 60;
    const nowS = tick / ticksPerSecond;
    const agents = readSnapshotAgents(snapshot);
    const earlierAgents = readSnapshotAgents(earlierSnapshot);
    const currentByGenome = new Map(agents.map((a) => [a.genomeId, a]));
    const earlierByGenome = new Map(earlierAgents.map((a) => [a.genomeId, a]));
    const huntingFlag = layout.flags?.HUNTING ?? DEFAULT_HUNTING_FLAG;

    const candidates = [
        ...findChaseMoments(agents, earlierByGenome, { info, huntingFlag }),
        ...findEffectMoments(effects, { tick, ticksPerSecond, layout, currentByGenome }),
        ...findTickerMoments(ticker, { tick, ticksPerSecond, agents, info }),
    ];

    for (const candidate of candidates) {
        candidate.score = applyRepeatPenalty(candidate.score, candidate.kind, lastShownS, nowS);
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates;
}
