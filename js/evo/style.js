// Style: how an agent carries out its specialisation, in 0 to 1 (natural-selection.md T1b; `descriptorV7` of T10e reads
// the same `styleOf`).
//
// - A `canHunt` agent: the mean length of its chase chains over `STYLE_CHAIN_CAP`. A chain is a run of deliberate
//   bites on one prey, each within `packWindow` ticks of the last (the chain `noteChase` already follows); its length
//   is the ticks from its first bite to its latest, capped at `STYLE_CHAIN_CAP`. The chains are counted here: `chains`, the capped length of the finished ones (`done`) and the open one
//   (`current`).
// - Any other agent: the share of its life ticks spent under `RING_SPEED` of `maxVelocity` inside a refuge ring while a
//   "can bite me" ray hit at proximity `THREAT_PROXIMITY` or more is in view (the threatened test of
//   `eval.refuge_use_under_threat`).
//
// `eval.style_separation`: within one specialisation, the largest difference between the lineage means of the style at
// death, over lineages with `MIN_STYLE_DEATHS` deaths or more after burn-in. The style is already over the cap.
// `eval.style_lineage_share`: within one specialisation, the share of the variance of style at death that lies between
// those lineages (the between-lineage sum of squares over the total), averaged over the specialisations with two lineages
// and some spread. Per-slot arrays only; a Map entry the first time a lineage and specialisation pair dies.

import { SPEC_RADIX } from './hunter-table.js';
import { none, ok } from './metrics-stats.js';
import { THREAT_PROXIMITY } from './observer-intent-state.js';
import { createKeyed, rowOf } from './scene-keyed.js';
import { inRefuge } from './scene-terrain.js';
import { EVENT, EVENT_STRIDE, EVENT_TICK } from '../sim/events.js';
import { BURN_IN_TICKS } from './burn-in.js';

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
        atDeath: new Float64Array(config.eventCapacity),
        deaths: createKeyed(['sum', 'n', 'sq']),
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
 * Remembers the style a dying agent had, under the index of its `AgentDied` event: the scenes reset the slot's style
 * before `applyEvents` logs the death, and the descriptor reads the logged value. An agent the observer does not track
 * under this genome (born and died in one tick) has style 0. Call before the slot is reset.
 * @param {Record<string, any>} observer the observer
 * @param {number} index the event's index in the tick's ring
 * @param {{slot: number, genomeId: number}} death the dying agent
 * @returns {void}
 */
export function noteStyleAtDeath(observer, index, { slot, genomeId }) {
    observer.scenes.style.atDeath[index] = observer.genomeId[slot] === genomeId ? styleOf(observer, slot) : 0;
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
    const style = styleOf(observer, slot);
    table.log.sum[row] += style;
    table.log.sq[row] += style * style;
    table.log.n[row] += 1;
}

/**
 * @param {Record<string, any>} deaths the style state's table of deaths by lineage and specialisation
 * @returns {number} the mean over specialisations of the share of the variance of style at death that is between
 *   lineages (lineages with `MIN_STYLE_DEATHS` deaths), or -1 when no specialisation has two such lineages and a spread
 */
function lineageShare({ rows, index, log }) {
    const n = new Float64Array(SPEC_RADIX);
    const sum = new Float64Array(SPEC_RADIX);
    const squares = new Float64Array(SPEC_RADIX);
    const between = new Float64Array(SPEC_RADIX);
    const lineages = new Float64Array(SPEC_RADIX);
    for (const [key, row] of index) {
        if (row < rows && log.n[row] >= MIN_STYLE_DEATHS) {
            const spec = key % SPEC_RADIX;
            n[spec] += log.n[row];
            sum[spec] += log.sum[row];
            squares[spec] += log.sq[row];
            between[spec] += (log.sum[row] * log.sum[row]) / log.n[row];
            lineages[spec] += 1;
        }
    }
    let total = 0;
    let specs = 0;
    for (let spec = 0; spec < SPEC_RADIX; spec++) {
        const spread = squares[spec] - (sum[spec] * sum[spec]) / n[spec];
        if (lineages[spec] >= 2 && spread > 1e-12) {
            total += Math.min(1, Math.max(0, (between[spec] - (sum[spec] * sum[spec]) / n[spec]) / spread));
            specs += 1;
        }
    }
    return specs > 0 ? total / specs : -1;
}

/**
 * @param {Record<string, any>} style the style state
 * @returns {import('./metrics-stats.js').MetricRecord} `eval.style_separation` and `eval.style_lineage_share`
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
    const share = lineageShare(style.deaths);
    return {
        'eval.style_separation': best >= 0 && Number.isFinite(best) ? ok(best) : none(reason),
        'eval.style_lineage_share':
            share >= 0
                ? ok(share)
                : none(`no specialisation with two lineages of ${MIN_STYLE_DEATHS} deaths and a spread of style`),
    };
}

/** @type {import('./observer-detectors.js').Detector} */
export const styleDetector = {
    name: 'style',
    modules: ['js/evo/style.js'],
    lean: true,
    create: (config) => createStyle(config),
    on: {
        AGENT_DIED: (scene, world, o, observer) => {
            const d = world.events.data;
            const slot = d[o + EVENT.AGENT_DIED.SLOT];
            const genomeId = d[o + EVENT.AGENT_DIED.GENOME_ID];
            noteStyleAtDeath(observer, o / EVENT_STRIDE, { slot, genomeId });
            if (observer.genomeId[slot] === genomeId && d[o + EVENT_TICK] >= BURN_IN_TICKS) {
                noteStyleDeath(observer, slot);
            }
        },
    },
    onSlotFree: resetStyleSlot,
    onTick: (scene, world, observer) => tickStyle(observer, world),
    metrics: (scene) => styleMetrics(scene),
};
