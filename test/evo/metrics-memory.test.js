import { describe, expect, it } from 'vitest';
import {
    FLOOR_GENE,
    MEMORY_DIRECTIONS,
    SNAPSHOT_LEAD,
    memoryMetrics,
    sampleMemory,
    snapshotHidden,
} from '../../js/evo/metrics-memory.js';
import { detSigmoid } from '../../js/sim/det-math.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

const H = 4;

/**
 * @param {number} agents agents to add, each in its own lineage unless `lineageOf` says otherwise
 * @param {(i: number) => number} [lineageOf] the lineage id of agent i
 * @returns {{world: any, observer: any, slots: number[]}} a world at tick 10000 with the agents tracked and sampled
 */
function setup(agents, lineageOf = (i) => i + 1) {
    const { world, observer } = observed({ brainHidden: H, maxAgents: 48 }, { checkpointTicks: 1000 });
    world.tick = 10000;
    const slots = [];
    for (let i = 0; i < agents; i++) {
        const slot = addBlob(world);
        world.lineageId[slot] = lineageOf(i);
        observer.lineageId[slot] = lineageOf(i);
        observer.genomeId[slot] = world.genomeId[slot];
        slots.push(slot);
    }
    observer.sampled = Int32Array.from(slots);
    return { world, observer, slots };
}

/**
 * @param {any} world the world
 * @param {number} slot the slot
 * @param {number[]} genes the slot's leak genes
 * @param {number} leakMin the floor
 * @returns {void}
 */
function setLeak(world, slot, genes, leakMin = 0.05) {
    const { layout } = world;
    genes.forEach((g, j) => {
        world.weights[slot * layout.weightCount + layout.leakStart + j] = g;
        world.leakRate[slot * H + j] = leakMin + (1 - leakMin) * detSigmoid(g);
    });
}

describe('the leak metrics', () => {
    it('reads the mean leak, the slow share and the floor share from the sampled agents', () => {
        const { world, observer, slots } = setup(2);
        const genes = [
            [-6, -4, 0, 3],
            [-3.9, 6, 6, -10],
        ];
        genes.forEach((g, i) => setLeak(world, slots[i], g));
        sampleMemory(observer.memory, observer, world);
        const all = genes.flat();
        const rates = all.map((g) => Math.fround(0.05 + 0.95 * detSigmoid(g)));
        const m = memoryMetrics(observer);
        expect(m['eval.leak_rate_mean'].value).toBeCloseTo(rates.reduce((a, b) => a + b) / 8, 6);
        expect(m['eval.leak_slow_share'].value).toBe(rates.filter((a) => a <= 0.1).length / 8);
        expect(m['eval.leak_at_floor_share'].value).toBe(all.filter((g) => detSigmoid(g) <= 0.02).length / 8);
    });

    it('puts the floor gene where sigmoid is 0.02', () => {
        expect(detSigmoid(FLOOR_GENE)).toBeCloseTo(0.02, 12);
    });

    it('is null with no sampled agent', () => {
        const { observer } = setup(0);
        expect(memoryMetrics(observer)['eval.leak_rate_mean']).toEqual({
            value: null,
            reason: 'no sampled agent after burn-in',
        });
    });

    it('is a watch metric', () => {
        expect(Object.values(MEMORY_DIRECTIONS).every((d) => d === 'watch')).toBe(true);
        expect(Object.keys(MEMORY_DIRECTIONS)).toHaveLength(5);
    });
});

describe('eval.leak_lineage_spread', () => {
    /** @returns {{world: any, observer: any}} three lineages of two agents, one leak level per lineage */
    function checkpointWith() {
        const { world, observer, slots } = setup(6, (i) => 1 + Math.floor(i / 2));
        slots.forEach((slot, i) => setLeak(world, slot, Array(H).fill([-6, 0, 6][Math.floor(i / 2)])));
        return { world, observer };
    }

    it('is the standard deviation of the lineage means, averaged over qualifying checkpoints', () => {
        const { world, observer } = checkpointWith();
        for (let c = 0; c < 5; c++) {
            sampleMemory(observer.memory, observer, world);
        }
        const means = [-6, 0, 6].map((g) => Math.fround(0.05 + 0.95 * detSigmoid(g)));
        const mean = means.reduce((a, b) => a + b) / 3;
        const sd = Math.sqrt(means.reduce((a, b) => a + (b - mean) ** 2, 0) / 3);
        expect(memoryMetrics(observer)['eval.leak_lineage_spread'].value).toBeCloseTo(sd, 6);
    });

    it('is null below 5 qualifying checkpoints and with lineages of one agent', () => {
        const { world, observer } = checkpointWith();
        for (let c = 0; c < 4; c++) {
            sampleMemory(observer.memory, observer, world);
        }
        expect(memoryMetrics(observer)['eval.leak_lineage_spread'].value).toBeNull();
        const single = setup(6);
        single.slots.forEach((slot) => setLeak(single.world, slot, [0, 0, 0, 0]));
        for (let c = 0; c < 5; c++) {
            sampleMemory(single.observer.memory, single.observer, single.world);
        }
        expect(memoryMetrics(single.observer)['eval.leak_lineage_spread'].value).toBeNull();
    });
});

describe('eval.hidden_persistence', () => {
    /**
     * @param {number} count agents
     * @returns {{world: any, observer: any, slots: number[], rows: number[][]}} agents with a snapshot taken 16 ticks
     *   before the checkpoint, then given new hidden rows
     */
    function withSnapshot(count) {
        const { world, observer, slots } = setup(count);
        const rows = slots.map((_, i) => [1, i % 3 === 0 ? 0 : -1, 0.5, i]);
        slots.forEach((slot, i) => world.hidden.set(rows[i], slot * H));
        world.tick = 10000 - SNAPSHOT_LEAD;
        snapshotHidden(observer.memory, observer, world);
        world.tick = 10000;
        slots.forEach((slot, i) => world.hidden.set([0.5, 1, i % 2, 1], slot * H));
        return { world, observer, slots, rows };
    }

    it('is the mean cosine between the row now and the row 16 ticks earlier', () => {
        const { world, observer, slots, rows } = withSnapshot(40);
        for (let c = 0; c < 1; c++) {
            sampleMemory(observer.memory, observer, world);
        }
        const cos = slots.map((_, i) => {
            const now = [0.5, 1, i % 2, 1];
            const dot = now.reduce((s, v, j) => s + v * rows[i][j], 0);
            return dot / Math.hypot(...now) / Math.hypot(...rows[i]);
        });
        expect(memoryMetrics(observer)['eval.hidden_persistence'].value).toBeCloseTo(
            cos.reduce((a, b) => a + b) / cos.length,
            5,
        );
    });

    it('skips a slot that holds a different agent than at the snapshot', () => {
        const { world, observer, slots } = withSnapshot(40);
        slots.forEach((slot) => {
            observer.genomeId[slot] += 1000;
        });
        sampleMemory(observer.memory, observer, world);
        expect(memoryMetrics(observer)['eval.hidden_persistence'].value).toBeNull();
    });

    it('is null below 30 pairs, and without a checkpoint interval no snapshot is taken', () => {
        const { world, observer } = withSnapshot(8);
        sampleMemory(observer.memory, observer, world);
        expect(memoryMetrics(observer)['eval.hidden_persistence'].reason).toMatch(/30 agent pairs/);
        const bare = observed({ brainHidden: H });
        bare.world.tick = 10000 - SNAPSHOT_LEAD;
        snapshotHidden(bare.observer.memory, bare.observer, bare.world);
        expect(bare.observer.memory.snapshotTick).toBe(-1);
    });
});
