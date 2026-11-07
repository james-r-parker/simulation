// The director's world moments (renderer-event-effects Phase 4): an outbreak (three or more infections close together),
// a stampede, a hunter's first kill, a trampling, a burst of floor entrants, and the turn of a season. They join the
// candidates `findMoments` ranks.

import { CLIENT_KIND } from '../renderer/client-kinds.js';
import { largestCluster } from './cluster.js';
import { MOMENT_KIND } from './scoring.js';

/** An outbreak: infections within this radius and window. */
export const OUTBREAK_RADIUS = 1000;
export const OUTBREAK_WINDOW_S = 5;
/** A floor arrival: floor births within this radius and window. */
export const ARRIVAL_RADIUS = 2000;
export const ARRIVAL_WINDOW_S = 4;
/** How long after a season turns the turn is a moment, in seconds. */
export const SEASON_TURN_S = 6;

/**
 * @param {number} n infections in the cluster
 * @returns {number} `50 + 5n` capped at 75, 0 below 3
 */
export function scoreOutbreak(n) {
    return n < 3 ? 0 : Math.min(75, 50 + 5 * n);
}

/**
 * @param {number} n floor births in the cluster
 * @returns {number} `40 + 5n` capped at 60, 0 below 4
 */
export function scoreFloorArrival(n) {
    return n < 4 ? 0 : Math.min(60, 40 + 5 * n);
}

/**
 * @param {{kind: number, tick: number, x: number, y: number, c: number}} effect an effect record
 * @param {{ageS: number, kinds: Record<string, number>, trampled: number}} ctx its age and the layout codes
 * @returns {{kind: string, score: number} | null} a stampede, first-kill or trample moment, else null
 */
export function scoreWorldEffect(effect, { ageS, kinds, trampled }) {
    if (ageS < 0) {
        return null;
    }
    if (effect.kind === kinds.STAMPEDE && ageS < 5) {
        return { kind: MOMENT_KIND.STAMPEDE, score: 60 * (1 - ageS / 5) };
    }
    if (effect.kind === kinds.FIRST_KILL && ageS < 6) {
        return { kind: MOMENT_KIND.FIRST_KILL, score: 85 * (1 - ageS / 6) };
    }
    const cause = (effect.c >>> 8) & 0xff;
    if (effect.kind === kinds.DIED && cause === trampled && ageS < 4) {
        return { kind: MOMENT_KIND.TRAMPLE, score: 70 * (1 - ageS / 4) };
    }
    return null;
}

/**
 * @param {string} kind the moment kind
 * @param {readonly {x: number, y: number}[]} points the effects in the window
 * @param {{radius: number, score: (n: number) => number}} rule the cluster radius and scoring
 * @returns {import('./moments.js').MomentCandidate[]} zero or one candidate
 */
function cluster(kind, points, { radius, score }) {
    const c = largestCluster(points, radius);
    const s = score(c.count);
    return s > 0 ? [{ kind, score: s, x: c.x, y: c.y, count: c.count }] : [];
}

/**
 * @param {import('./moments.js').RawEffectRecord} effect an effect record
 * @param {number} ageS its age in seconds
 * @param {{born: number, floor: number}} codes the `BORN` kind and the floor birth cause
 * @returns {'infection' | 'arrival' | null} the cluster window it belongs in, if any
 */
function windowOf(effect, ageS, { born, floor }) {
    if (ageS < 0) {
        return null;
    }
    if (effect.kind === CLIENT_KIND.INFECTED && ageS <= OUTBREAK_WINDOW_S) {
        return 'infection';
    }
    return effect.kind === born && effect.d === floor && ageS <= ARRIVAL_WINDOW_S ? 'arrival' : null;
}

/**
 * @param {readonly import('./moments.js').RawEffectRecord[]} effects recent effect records
 * @param {{tick: number, ticksPerSecond: number, layout: Record<string, any>, info: Record<string, any>}} ctx timing,
 *   layout codes and world info (`seasonLength`, world size)
 * @returns {import('./moments.js').MomentCandidate[]} the world moment candidates
 */
export function findWorldMoments(effects, { tick, ticksPerSecond, layout, info }) {
    const kinds = layout.effectKinds;
    const trampled = layout.deathCauses?.TRAMPLED ?? -1;
    const floor = layout.bornCauses?.FLOOR ?? -1;
    const out = /** @type {import('./moments.js').MomentCandidate[]} */ ([]);
    const infections = /** @type {{x: number, y: number}[]} */ ([]);
    const arrivals = /** @type {{x: number, y: number}[]} */ ([]);
    for (const effect of effects) {
        const ageS = (tick - effect.tick) / ticksPerSecond;
        const list = windowOf(effect, ageS, { born: kinds.BORN, floor });
        if (list === 'infection') {
            infections.push(effect);
        } else if (list === 'arrival') {
            arrivals.push(effect);
        }
        const single = scoreWorldEffect(effect, { ageS, kinds, trampled });
        if (single !== null) {
            out.push({ ...single, x: effect.x, y: effect.y });
        }
    }
    out.push(...cluster(MOMENT_KIND.OUTBREAK, infections, { radius: OUTBREAK_RADIUS, score: scoreOutbreak }));
    out.push(...cluster(MOMENT_KIND.FLOOR_ARRIVAL, arrivals, { radius: ARRIVAL_RADIUS, score: scoreFloorArrival }));
    out.push(...seasonTurn(tick, ticksPerSecond, info));
    return out;
}

/**
 * @param {number} tick the tick
 * @param {number} ticksPerSecond the tick rate
 * @param {Record<string, any>} info `ready.info`
 * @returns {import('./moments.js').MomentCandidate[]} a season-turn moment at the world centre in the first
 *   `SEASON_TURN_S` of a season (after the first), else none
 */
function seasonTurn(tick, ticksPerSecond, info) {
    const length = info.seasonLength ?? 0;
    if (!(length > 0) || tick < length) {
        return [];
    }
    const ageS = (tick % length) / ticksPerSecond;
    if (ageS >= SEASON_TURN_S) {
        return [];
    }
    const season = Math.floor(tick / length) % 4;
    return [
        {
            kind: MOMENT_KIND.SEASON_TURN,
            score: 55 * (1 - ageS / SEASON_TURN_S),
            x: info.worldWidth / 2,
            y: info.worldHeight / 2,
            count: season,
        },
    ];
}
