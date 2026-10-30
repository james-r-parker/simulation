// The leak and hidden-state metrics (brain-capacity-and-memory.md, Metrics): how slow the hidden units are, whether the
// floor binds, whether lineages differ in their leak, and how much of a hidden row survives 16 ticks. They read the
// checkpoint's sampled agents (`observer.sampled`, the slots `diversity` drew) and make no draw of their own. All `watch`.

import { stddev, ok, none, share } from './metrics-stats.js';

/** A unit with `a` at most this is slow: a half-life of at least 6.6 ticks. */
export const SLOW_LEAK = 0.1;

/** `sigmoid(gene)` at most this means the `leakMin` floor is binding. */
export const FLOOR_SIGMOID = 0.02;

/** The leak gene whose sigmoid is `FLOOR_SIGMOID`: `ln(0.02 / 0.98)`. */
export const FLOOR_GENE = -3.8918202981106265;

/** Ticks between the hidden-state snapshot and the checkpoint it is compared with. */
export const SNAPSHOT_LEAD = 16;

/** A lineage counts at a checkpoint with at least this many sampled agents. */
export const MIN_LINEAGE_AGENTS = 2;

/** A checkpoint yields a spread with at least this many such lineages. */
export const MIN_LINEAGES = 3;

/** The spread needs at least this many such checkpoints. */
export const MIN_SPREAD_CHECKPOINTS = 5;

/** The persistence needs at least this many agent pairs. */
export const MIN_PAIRS = 30;

/** Most agents one checkpoint samples (`DIVERSITY_SAMPLE`). */
const MAX_SAMPLE = 64;

/** The direction of each metric here, as the Metrics table names them. */
export const MEMORY_DIRECTIONS = Object.freeze({
    'eval.leak_rate_mean': 'watch',
    'eval.leak_slow_share': 'watch',
    'eval.leak_at_floor_share': 'watch',
    'eval.leak_lineage_spread': 'watch',
    'eval.hidden_persistence': 'watch',
});

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @param {{checkpointTicks?: number}} [options] the ticks between the run's checkpoints; without it the 16-tick
 *   snapshot is never taken and `eval.hidden_persistence` is `null`
 * @returns {Record<string, any>} the pools, all zero; the buffers are sized once
 */
export function createMemoryPools(config, options = {}) {
    const hidden = config.brainHidden;
    return {
        checkpointTicks: options.checkpointTicks ?? 0,
        leakSum: 0,
        leakUnits: 0,
        slowUnits: 0,
        floorUnits: 0,
        spreadSum: 0,
        spreadCheckpoints: 0,
        persistSum: 0,
        persistPairs: 0,
        snapshot: new Float32Array(config.maxAgents * hidden),
        snapshotId: new Uint32Array(config.maxAgents),
        snapshotTick: -1,
        agentMean: new Float64Array(MAX_SAMPLE),
        groupLineage: new Float64Array(MAX_SAMPLE),
        groupSum: new Float64Array(MAX_SAMPLE),
        groupCount: new Uint16Array(MAX_SAMPLE),
        groupMean: new Float64Array(MAX_SAMPLE),
    };
}

/**
 * Takes the hidden-state snapshot when the next checkpoint is `SNAPSHOT_LEAD` ticks away. Call after every step.
 * @param {Record<string, any>} pools the memory pools
 * @param {{genomeId: Uint32Array}} observer the observer (its tracked genome ids stamp the snapshot)
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function snapshotHidden(pools, observer, world) {
    const every = pools.checkpointTicks;
    if (every <= SNAPSHOT_LEAD || (world.tick + SNAPSHOT_LEAD) % every !== 0) {
        return;
    }
    pools.snapshot.set(world.hidden.subarray(0, pools.snapshot.length));
    pools.snapshotId.set(observer.genomeId);
    pools.snapshotTick = world.tick;
}

/**
 * Adds one sampled agent's hidden units to the leak totals.
 * @param {Record<string, any>} pools the memory pools
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent's slot
 * @returns {number} the mean `leakRate` over its hidden units
 */
function addLeak(pools, world, slot) {
    const { layout, weights, leakRate } = world;
    const H = layout.hidden;
    const genes = slot * layout.weightCount + layout.leakStart;
    let sum = 0;
    for (let j = 0; j < H; j++) {
        const a = leakRate[slot * H + j];
        sum += a;
        pools.slowUnits += a <= SLOW_LEAK ? 1 : 0;
        pools.floorUnits += weights[genes + j] <= FLOOR_GENE ? 1 : 0;
    }
    pools.leakSum += sum;
    pools.leakUnits += H;
    return sum / H;
}

/**
 * Adds the checkpoint's spread of lineage mean leak rates when at least `MIN_LINEAGES` lineages have
 * `MIN_LINEAGE_AGENTS` sampled agents.
 * @param {Record<string, any>} pools the memory pools
 * @param {Record<string, any>} observer the observer (`lineageId`)
 * @param {Int32Array} slots the sampled slots
 * @returns {void}
 */
function addSpread(pools, observer, slots) {
    const { agentMean, groupLineage, groupSum, groupCount, groupMean } = pools;
    let groups = 0;
    for (let i = 0; i < slots.length; i++) {
        const lineage = observer.lineageId[slots[i]];
        let g = 0;
        while (g < groups && groupLineage[g] !== lineage) {
            g++;
        }
        if (g === groups) {
            groupLineage[g] = lineage;
            groupSum[g] = 0;
            groupCount[g] = 0;
            groups++;
        }
        groupSum[g] += agentMean[i];
        groupCount[g] += 1;
    }
    let kept = 0;
    for (let g = 0; g < groups; g++) {
        if (groupCount[g] >= MIN_LINEAGE_AGENTS) {
            groupMean[kept++] = groupSum[g] / groupCount[g];
        }
    }
    if (kept >= MIN_LINEAGES) {
        pools.spreadSum += stddev(groupMean.subarray(0, kept));
        pools.spreadCheckpoints += 1;
    }
}

/**
 * Adds the cosine between a sampled agent's hidden row and its snapshot row, when it is the same agent.
 * @param {Record<string, any>} pools the memory pools
 * @param {Record<string, any>} world the world
 * @param {{slot: number, genomeId: number}} agent the sampled agent
 * @returns {void}
 */
function addPersistence(pools, world, agent) {
    if (pools.snapshotId[agent.slot] !== agent.genomeId) {
        return;
    }
    const H = world.layout.hidden;
    let dot = 0;
    let a = 0;
    let b = 0;
    for (let j = 0; j < H; j++) {
        const now = world.hidden[agent.slot * H + j];
        const then = pools.snapshot[agent.slot * H + j];
        dot += now * then;
        a += now * now;
        b += then * then;
    }
    if (a > 0 && b > 0) {
        pools.persistSum += dot / Math.sqrt(a * b);
        pools.persistPairs += 1;
    }
}

/**
 * Samples the leak and hidden-state figures of the checkpoint's sampled agents. Call once per checkpoint at or after
 * burn-in, after `diversity` has set `observer.sampled`; it draws nothing.
 * @param {Record<string, any>} pools the memory pools
 * @param {Record<string, any>} observer the observer (`sampled`, `genomeId`, `lineageId`)
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleMemory(pools, observer, world) {
    const slots = observer.sampled;
    const paired = pools.snapshotTick === world.tick - SNAPSHOT_LEAD;
    for (let i = 0; i < slots.length; i++) {
        pools.agentMean[i] = addLeak(pools, world, slots[i]);
        if (paired) {
            addPersistence(pools, world, { slot: slots[i], genomeId: observer.genomeId[slots[i]] });
        }
    }
    addSpread(pools, observer, slots);
}

/**
 * @param {Record<string, any>} observer the observer, checkpointed
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the five metrics
 */
export function memoryMetrics(observer) {
    const p = observer.memory;
    const no = 'no sampled agent after burn-in';
    const spread =
        p.spreadCheckpoints >= MIN_SPREAD_CHECKPOINTS
            ? ok(p.spreadSum / p.spreadCheckpoints)
            : none(`fewer than ${MIN_SPREAD_CHECKPOINTS} checkpoints with ${MIN_LINEAGES} qualifying lineages`);
    const persistence =
        p.persistPairs >= MIN_PAIRS ? ok(p.persistSum / p.persistPairs) : none(`fewer than ${MIN_PAIRS} agent pairs`);
    return {
        'eval.leak_rate_mean': share(p.leakSum, p.leakUnits, no),
        'eval.leak_slow_share': share(p.slowUnits, p.leakUnits, no),
        'eval.leak_at_floor_share': share(p.floorUnits, p.leakUnits, no),
        'eval.leak_lineage_spread': spread,
        'eval.hidden_persistence': persistence,
    };
}
