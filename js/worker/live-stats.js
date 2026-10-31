// Live stats and ticker items for the HUD: the Stats table from the observer, the world and the policy's archive, and
// the ticker items from each tick's events, the lineage counts and the policy's log records. Reads; never steps.

import { coverage, occupiedCount } from '../evo/archive.js';
import { generationStats } from './generation.js';
import { BORN_CAUSE, DEATH_CAUSE, EVENT_STRIDE, EVENT_TYPE } from '../sim/events.js';
import { specParams } from '../sim/spec-params.js';
import { callsPerKiloTick, createCallWindow, largestSpec, noteCalls, predatorCount } from './world-numbers.js';
import { createLineageBoard, rebuildCounts, topLineages, updateBoard } from './lineage-board.js';

/** Items held for the next `tickerEvents`; the oldest are dropped past this. */
export const PENDING_CAP = 32;

/** A predator's kill number that announces a streak. */
export const HUNT_STREAK_KILLS = 5;

/** An agent at this share of `maxAgeTicks` is an elder. */
export const ELDER_SHARE = 0.9;

/** `PopulationFloor` is announced only after this tick (before it the initial settling is expected). */
export const FLOOR_AFTER_TICK = 10000;

const SPEC_COUNT = 5;
const SEASONS = 4;
const BORN_CAUSES = 5;
const DEATH_CAUSES = 5;

/**
 * @typedef {object} TickerItem
 * @property {number} tick the tick it happened
 * @property {string} kind `new-leader`, `extinct`, `hunt-streak`, `pack-kill`, `elder`, `elite` or `floor`
 * @property {string} text a plain-text line
 * @property {number} [genomeId] the agent concerned
 * @property {number} [lineageId] the lineage concerned
 * @property {number} [x] where, in world units
 * @property {number} [y] where
 */

/**
 * @typedef {object} LiveStats
 * @property {import('./lineage-board.js').LineageBoard} board lineage standings
 * @property {TickerItem[]} pending items waiting for `tickerEvents`
 * @property {Float64Array} lastBirths birth totals at the last stats message, by cause
 * @property {Float64Array} lastDeaths death totals at the last stats message, by cause
 * @property {{caught: number, escaped: number, huntKills: number, packKills: number} | null} lastCombat combat
 *   totals at the last stats message, null until the observer has them
 * @property {import('./world-numbers.js').CallWindow} calls alarm and hunt calls in the last 1000 ticks
 * @property {number} lastElderScan the tick of the last elder scan
 * @property {{spec: number, cell: number, tick: number} | null} newestReplacement the latest `ArchiveReplaced`
 */

/** @returns {LiveStats} state for a fresh run */
export function createLiveStats() {
    return {
        board: createLineageBoard(),
        pending: [],
        lastBirths: new Float64Array(BORN_CAUSES),
        lastDeaths: new Float64Array(DEATH_CAUSES),
        lastCombat: null,
        calls: createCallWindow(),
        lastElderScan: 0,
        newestReplacement: null,
    };
}

/**
 * @param {LiveStats} live the state
 * @param {TickerItem} item the item to queue
 * @returns {void}
 */
function push(live, item) {
    if (live.pending.length === PENDING_CAP) {
        live.pending.shift();
    }
    live.pending.push(item);
}

/**
 * Queues the ticker items a tick's events yield: `pack-kill`, `hunt-streak` and `floor`. Call it after the observer has
 * applied the tick, so `observer.kills` counts this tick's kills and `slotOf` holds the killers still alive.
 * @param {LiveStats} live the state
 * @param {Record<string, any>} world the world just stepped
 * @param {Record<string, any>} observer the observer, after `observe`
 * @returns {void}
 */
export function noteTick(live, world, observer) {
    noteCalls(live.calls, world);
    const d = world.events.data;
    for (let i = 0; i < world.events.count; i++) {
        const o = i * EVENT_STRIDE;
        if (d[o] === EVENT_TYPE.AGENT_DIED && d[o + 4] === DEATH_CAUSE.EATEN && d[o + 5] !== 0) {
            noteKill(live, { world, observer }, o);
        } else if (d[o] === EVENT_TYPE.POPULATION_FLOOR && d[o + 1] > FLOOR_AFTER_TICK) {
            push(live, { tick: d[o + 1], kind: 'floor', text: `population floor: ${d[o + 2]} agents added` });
        }
    }
}

/**
 * @param {LiveStats} live the state
 * @param {{world: Record<string, any>, observer: Record<string, any>}} source the world and the observer
 * @param {number} o the offset of an `AgentDied` record of cause `eaten` with a killer
 * @returns {void}
 */
function noteKill(live, { world, observer }, o) {
    const d = world.events.data;
    const killer = d[o + 5];
    const tick = d[o + 1];
    if (d[o + 11] !== 0) {
        push(live, { tick, kind: 'pack-kill', text: 'pack kill', genomeId: killer, lineageId: d[o + 7] });
    }
    const slot = observer.slotOf.get(killer);
    if (
        slot !== undefined &&
        observer.kills[slot] === HUNT_STREAK_KILLS &&
        specParams(world.config, observer.spec[slot]).canHunt
    ) {
        const at = { x: world.x[slot], y: world.y[slot] };
        push(live, {
            tick,
            kind: 'hunt-streak',
            text: `hunter ${killer} has ${HUNT_STREAK_KILLS} kills`,
            genomeId: killer,
            ...at,
        });
    }
}

/**
 * Queues an `elite` item for an `ArchiveReplaced` record and remembers it as the newest replacement.
 * @param {LiveStats} live the state
 * @param {Record<string, any>} record a log record
 * @param {number} tick the tick it arrived in
 * @returns {void}
 */
export function noteLogRecord(live, record, tick) {
    if (record.event === 'ArchiveReplaced') {
        live.newestReplacement = { spec: record.spec, cell: record.cell, tick };
        push(live, {
            tick,
            kind: 'elite',
            text: `new elite in cell ${record.cell} (type ${record.spec})`,
            genomeId: record.newId,
        });
    }
}

/**
 * Queues an `elder` item for each agent that crossed `ELDER_SHARE` of `maxAgeTicks` since the last scan.
 * @param {LiveStats} live the state
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
function scanElders(live, world) {
    const threshold = Math.floor(ELDER_SHARE * world.config.maxAgeTicks);
    const since = world.tick - live.lastElderScan;
    live.lastElderScan = world.tick;
    const { alive, ageTicks } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        const over = ageTicks[slot] - threshold;
        if (alive[slot] === 1 && over >= 0 && over < since) {
            const text = `${world.genomeId[slot]} is an elder`;
            push(live, {
                tick: world.tick,
                kind: 'elder',
                text,
                genomeId: world.genomeId[slot],
                lineageId: world.lineageId[slot],
                x: world.x[slot],
                y: world.y[slot],
            });
        }
    }
}

/**
 * Drains the items queued since the last call.
 * @param {LiveStats} live the state
 * @returns {TickerItem[]} the items, oldest first; empty when there are none
 */
export function tickerEvents(live) {
    return live.pending.splice(0, live.pending.length);
}

/**
 * @param {Float64Array} totals cumulative totals
 * @param {Float64Array} last the totals at the last message; updated to `totals`
 * @returns {number[]} the change in each since the last message
 */
function deltas(totals, last) {
    const out = Array.from(totals, (value, i) => value - last[i]);
    last.set(totals);
    return out;
}

/**
 * The seam for the combat counters. `observer.combat` arrives with the predator-prey combat observer (predator-prey.md
 * Phase 2): cumulative `caughtEpisodes`, `escapedEpisodes`, `huntKills` and `packKills`. Until then it is absent and so is `combat`.
 * @param {LiveStats} live the state
 * @param {Record<string, any>} observer the observer
 * @returns {{caught: number, escaped: number, huntKills: number, packKills: number} | null} the change since the last
 *   message, or null when the observer has no combat counters
 */
function combatDelta(live, observer) {
    const c = observer.combat;
    if (c === undefined || c === null) {
        return null;
    }
    const last = live.lastCombat ?? { caught: 0, escaped: 0, huntKills: 0, packKills: 0 };
    const out = {
        caught: c.caughtEpisodes - last.caught,
        escaped: c.escapedEpisodes - last.escaped,
        huntKills: c.huntKills - last.huntKills,
        packKills: c.packKills - last.packKills,
    };
    live.lastCombat = {
        caught: c.caughtEpisodes,
        escaped: c.escapedEpisodes,
        huntKills: c.huntKills,
        packKills: c.packKills,
    };
    return out;
}

/**
 * @param {Record<string, any>} policy the policy
 * @param {LiveStats} live the state
 * @returns {Record<string, any> | null} the archive summary, or null for a policy without an archive
 */
function archiveStats(policy, live) {
    if (policy.archive === undefined) {
        return null;
    }
    const occupied = Array.from({ length: SPEC_COUNT }, (_, spec) => occupiedCount(policy.archive, spec));
    return { coverage: coverage(policy.archive), occupiedCount: occupied, newestReplacement: live.newestReplacement };
}

/**
 * @param {Record<string, any>} world the world
 * @returns {number[]} alive agents by specialisation
 */
function countBySpec(world) {
    const counts = new Array(SPEC_COUNT).fill(0);
    for (let slot = 0; slot < world.alive.length; slot++) {
        counts[world.spec[slot]] += world.alive[slot];
    }
    return counts;
}

/**
 * @param {ArrayLike<number>} values numbers
 * @returns {number} their sum
 */
function sum(values) {
    let total = 0;
    for (let i = 0; i < values.length; i++) {
        total += values[i];
    }
    return total;
}

/**
 * @param {Record<string, any>} observer the observer
 * @returns {number | null} `(mate + split) / all` births after burn-in, null before any
 */
function bornShare(observer) {
    const b = observer.birthsAfterBurnIn;
    const all = sum(b);
    return all === 0 ? null : (b[BORN_CAUSE.MATE] + b[BORN_CAUSE.SPLIT]) / all;
}

/**
 * Builds the Stats table for a stats message and resets the "since the last message" counters. Also rebuilds the
 * lineage counts and queues the `new-leader`, `extinct` and `elder` items.
 * @param {LiveStats} live the state
 * @param {{world: Record<string, any>, observer: Record<string, any>, policy: Record<string, any>,
 *   generations: import('./generation.js').Generations}} source the run
 * @param {{ticksPerSecond: number, requestedTicksPerSecond: number, droppedTicks: number, workerMsPerTick: number,
 *   seed: number, configHash: string}} run the pace and identity the host measured
 * @returns {Record<string, any>} the stats object of the `stats` message
 */
export function collectStats(live, { world, observer, policy, generations }, run) {
    const tick = world.tick;
    rebuildCounts(live.board, world);
    const top = topLineages(live.board, Math.max(world.population, 1));
    const { leader, extinct } = updateBoard(live.board, top, tick);
    if (leader !== 0) {
        push(live, { tick, kind: 'new-leader', text: `lineage ${leader} takes the lead`, lineageId: leader });
    }
    for (const id of extinct) {
        push(live, { tick, kind: 'extinct', text: `lineage ${id} has died out`, lineageId: id });
    }
    scanElders(live, world);
    const births = deltas(observer.births, live.lastBirths);
    const deaths = deltas(observer.deathsByCause, live.lastDeaths);
    const phase = world.season[1] * SEASONS;
    const generation = generationStats(generations, world);
    const bySpec = countBySpec(world);
    return {
        tick,
        ticksPerSecond: run.ticksPerSecond,
        requestedTicksPerSecond: run.requestedTicksPerSecond,
        droppedTicks: run.droppedTicks,
        season: world.season[0],
        seasonProgress: phase - Math.floor(phase),
        population: world.population,
        bySpec,
        predators: predatorCount(world.config, bySpec),
        callsPerKiloTick: callsPerKiloTick(live.calls, tick),
        largestSpec: largestSpec(bySpec),
        bornShare: bornShare(observer),
        births: sum(births),
        birthsByCause: births,
        deaths: sum(deaths),
        deathsByCause: deaths,
        combat: combatDelta(live, observer),
        lineages: { count: live.board.counts.size, top },
        archive: archiveStats(policy, live),
        generationMax: generation.max,
        generationMedian: generation.median,
        seed: run.seed,
        configHash: run.configHash,
        policy: policy.name,
        workerMsPerTick: run.workerMsPerTick,
    };
}
