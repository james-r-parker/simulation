// Style: how an agent carries out its specialisation, in 0 to 1 (natural-selection.md T1b; `descriptorV7` of T10e reads
// the same `styleOf`).
//
// - A `canHunt` agent: the mean length of its chase chains over `STYLE_CHAIN_CAP`. A chain is a run of deliberate
//   bites on one prey, each within `packWindow` ticks of the last (the chain `noteChase` already follows); its length
//   is the ticks from its first bite to its latest, capped at `STYLE_CHAIN_CAP`. `chaseTicks` is only a running total,
//   so the chains are counted here: `chains`, the capped length of the finished ones (`done`) and the open one
//   (`current`).
// - Any other agent: the share of its life ticks spent under `RING_SPEED` of `maxVelocity` inside a refuge ring while a
//   "can bite me" ray hit at proximity `THREAT_PROXIMITY` or more is in view (the threatened test of
//   `eval.refuge_use_under_threat`).
//
// `eval.style_separation`: within one specialisation, the largest difference between the lineage means of the style at
// death, over lineages with `MIN_STYLE_DEATHS` deaths or more after burn-in. The style is already over the cap.
// Per-slot arrays only; a Map entry the first time a lineage and specialisation pair dies.

import { SPEC_RADIX } from './hunter-table.js';
import { none, ok } from './metrics-stats.js';
import { THREAT_PROXIMITY } from './observer-intent-state.js';
import { createKeyed, rowOf } from './scene-keyed.js';
import { inRefuge } from './scene-terrain.js';

/** A chain longer than this many ticks counts as this long. */
export const STYLE_CHAIN_CAP = 60;

/** A non-hunter sits still when its speed is under this share of `maxVelocity`. */
export const RING_SPEED = 0.1;

/** Fewest deaths a lineage needs for the separation. */
export const MIN_STYLE_DEATHS = 20;

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} an empty style state
 */
export function createStyle(config) {
    const n = config.maxAgents;
    return {
        chains: new Uint32Array(n),
        done: new Float64Array(n),
        current: new Float64Array(n),
        ringTicks: new Uint32Array(n),
        deaths: createKeyed(['sum', 'n']),
    };
}

/**
 * @param {Record<string, any>} style the style state
 * @param {number} slot the slot of a born or dead agent
 * @returns {void}
 */
export function resetStyleSlot(style, slot) {
    style.chains[slot] = 0;
    style.done[slot] = 0;
    style.current[slot] = 0;
    style.ringTicks[slot] = 0;
}

/**
 * Notes a deliberate bite of a hunter: it extends the open chain (`gap` ticks since the last bite) or starts a new one.
 * @param {Record<string, any>} style the style state
 * @param {number} biter the biter's slot
 * @param {{continues: boolean, gap: number}} bite whether the bite continues the chain, and the ticks since the last
 * @returns {void}
 */
export function noteStyleBite(style, biter, { continues, gap }) {
    if (continues) {
        style.current[biter] += gap;
        return;
    }
    style.done[biter] += Math.min(style.current[biter], STYLE_CHAIN_CAP);
    style.current[biter] = 0;
    style.chains[biter] += 1;
}

/**
 * Counts, for every alive non-hunter, a tick spent still inside a refuge ring under threat.
 * @param {Record<string, any>} observer the observer, with its intent state current for this tick
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function tickStyle(observer, world) {
    const { alive, spec, vx, vy } = world;
    const { hunterSpec, threatProx } = observer.intent;
    const limit = RING_SPEED * world.config.maxVelocity;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] !== 1 || hunterSpec[spec[slot]] === 1 || threatProx[slot] < THREAT_PROXIMITY) {
            continue;
        }
        if (
            vx[slot] * vx[slot] + vy[slot] * vy[slot] < limit * limit &&
            inRefuge(observer.scenes.terrain, world, slot)
        ) {
            observer.scenes.style.ringTicks[slot] += 1;
        }
    }
}

/**
 * @param {Record<string, any>} observer the observer
 * @param {number} slot a tracked slot, alive or about to be reset
 * @returns {number} the agent's style, 0 to 1
 */
export function styleOf(observer, slot) {
    const style = observer.scenes.style;
    if (observer.intent.hunterSpec[observer.spec[slot]] === 1) {
        const chains = style.chains[slot];
        const total = style.done[slot] + Math.min(style.current[slot], STYLE_CHAIN_CAP);
        return chains === 0 ? 0 : total / chains / STYLE_CHAIN_CAP;
    }
    const life = observer.intent.aliveTicks[slot];
    return life === 0 ? 0 : style.ringTicks[slot] / life;
}

/**
 * Adds a death after burn-in to its lineage and specialisation. Call before the slot is reset.
 * @param {Record<string, any>} observer the observer
 * @param {number} slot the dying agent's slot
 * @returns {void}
 */
export function noteStyleDeath(observer, slot) {
    const table = observer.scenes.style.deaths;
    const row = rowOf(table, observer.lineageId[slot] * SPEC_RADIX + observer.spec[slot]);
    table.log.sum[row] += styleOf(observer, slot);
    table.log.n[row] += 1;
}

/**
 * @param {Record<string, any>} style the style state
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} `eval.style_separation`
 */
export function styleMetrics(style) {
    const { rows, index, log } = style.deaths;
    const low = new Float64Array(SPEC_RADIX).fill(Infinity);
    const high = new Float64Array(SPEC_RADIX).fill(-Infinity);
    for (const [key, row] of index) {
        if (row < rows && log.n[row] >= MIN_STYLE_DEATHS) {
            const spec = key % SPEC_RADIX;
            const mean = log.sum[row] / log.n[row];
            low[spec] = Math.min(low[spec], mean);
            high[spec] = Math.max(high[spec], mean);
        }
    }
    let best = -1;
    for (let spec = 0; spec < SPEC_RADIX; spec++) {
        best = Math.max(best, high[spec] - low[spec]);
    }
    const reason = `no lineage with ${MIN_STYLE_DEATHS} deaths after burn-in`;
    return { 'eval.style_separation': best >= 0 && Number.isFinite(best) ? ok(best) : none(reason) };
}
