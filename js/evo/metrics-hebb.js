// Hebbian drift (brain-capacity-and-memory.md, Metrics): how far a life's plastic hidden-to-output block `fastOut` has
// moved from its genome block `wOut`, and how much of it sits on the clamp. Read at the checkpoint on the sampled agents
// aged at least `MIN_AGE_TICKS`; `fastOut` is only ever read here, never by the archive or a policy. Both `watch`.

import { HEBB_CLAMP } from '../sim/hebbian.js';
import { none, ok, share } from './metrics-stats.js';

/** A sampled agent must be at least this old (ticks) to count. */
export const MIN_AGE_TICKS = 600;

/** The direction of each metric here. */
export const HEBB_DIRECTIONS = Object.freeze({
    'eval.hebb_drift': 'watch',
    'eval.hebb_drift_clamped_share': 'watch',
});

/**
 * @returns {{driftSum: number, agents: number, clamped: number, entries: number}} empty pools
 */
export function createHebbPools() {
    return { driftSum: 0, agents: 0, clamped: 0, entries: 0 };
}

/**
 * Adds one agent's drift (`|fastOut - wOut| / |wOut|`) and its clamped entries.
 * @param {Record<string, any>} pools the Hebbian pools
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent's slot
 * @returns {void}
 */
function addAgent(pools, world, slot) {
    const { layout, weights, fastOut } = world;
    const size = layout.hidden * layout.geneOutputs;
    const genome = slot * layout.weightCount + layout.wOut;
    let delta = 0;
    let norm = 0;
    for (let i = 0; i < size; i++) {
        const f = fastOut[slot * size + i];
        const w = weights[genome + i];
        delta += (f - w) * (f - w);
        norm += w * w;
        pools.clamped += Math.abs(f) >= HEBB_CLAMP ? 1 : 0;
    }
    pools.entries += size;
    if (norm > 0) {
        pools.driftSum += Math.sqrt(delta / norm);
        pools.agents += 1;
    }
}

/**
 * Samples the drift of the checkpoint's sampled agents aged at least `MIN_AGE_TICKS`. Call once per checkpoint at or
 * after burn-in; it does nothing when `hebbianRate` is 0.
 * @param {Record<string, any>} pools the Hebbian pools
 * @param {Record<string, any>} observer the observer (`sampled`, `ageTicks`)
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleHebb(pools, observer, world) {
    if (world.config.hebbianRate <= 0) {
        return;
    }
    const slots = observer.sampled;
    for (let i = 0; i < slots.length; i++) {
        if (observer.ageTicks[slots[i]] >= MIN_AGE_TICKS) {
            addAgent(pools, world, slots[i]);
        }
    }
}

/**
 * @param {Record<string, any>} observer the observer
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the two metrics
 */
export function hebbMetrics(observer) {
    const p = observer.hebb;
    if (observer.config.hebbianRate <= 0) {
        const off = none('hebbianRate is 0');
        return { 'eval.hebb_drift': off, 'eval.hebb_drift_clamped_share': off };
    }
    const no = `no sampled agent aged ${MIN_AGE_TICKS} ticks`;
    return {
        'eval.hebb_drift': p.agents > 0 ? ok(p.driftSum / p.agents) : none(no),
        'eval.hebb_drift_clamped_share': share(p.clamped, p.entries, no),
    };
}
