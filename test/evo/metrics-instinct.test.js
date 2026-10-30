import { describe, expect, it } from 'vitest';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import {
    createInstinctPools,
    instinctCells,
    instinctMetrics,
    priorDistance,
    sampleInstinct,
} from '../../js/evo/metrics-instinct.js';

const CONFIG = createConfig({ instinctWeight: 1 });
const LAYOUT = brainLayout(CONFIG);
const PREDATOR = CONFIG.specialisations.predator.index;
const FORAGER = CONFIG.specialisations.forager.index;

/**
 * A hand-built world of two agents, a predator and a forager, each with its instinct cells at the prior plus `offset`.
 * @param {Record<string, any>} pools the drift pools
 * @param {{offset: number, tick: number}} at how far every cell sits from the prior, and the world's tick
 * @returns {{world: Record<string, any>, observer: Record<string, any>}} the world and an observer that sampled both
 */
function handWorld(pools, { offset, tick }) {
    const n = LAYOUT.weightCount;
    const weights = new Float32Array(2 * n).fill(0.5);
    [pools.hunter, pools.other].forEach(({ cells, prior }, slot) => {
        cells.forEach((/** @type {number} */ cell, /** @type {number} */ c) => {
            weights[slot * n + cell] = prior[c] + (c % 2 === 0 ? offset : -offset);
        });
    });
    const world = { config: CONFIG, layout: LAYOUT, tick, spec: Uint8Array.of(PREDATOR, FORAGER), weights };
    return { world, observer: { sampled: Int32Array.of(0, 1), instinct: pools } };
}

describe('instinctCells', () => {
    it('lists the cells applyInstinct writes, with their prior on a zero row', () => {
        const hunter = instinctCells(LAYOUT, { weight: 1, canHunt: true });
        const other = instinctCells(LAYOUT, { weight: 1, canHunt: false });
        expect(hunter.cells).toHaveLength(8); // thrust, turn and bite on prey; thrust and turn on food; three biases
        expect(other.cells).toHaveLength(7); // thrust and turn on food and on threat; three biases
        expect([...hunter.prior].sort()).toEqual([-2, -2, -2, 1, 1, 1, 1, 2]);
        expect([...other.prior].sort()).toEqual([-1, -2, -2, -2, 1, 1, 1]);
    });
});

describe('eval.instinct_drift', () => {
    it("is each checkpoint's distance from the prior over the founders', averaged after burn-in", () => {
        const pools = createInstinctPools(CONFIG);
        for (const [offset, tick] of [
            [0.1, 1000],
            [0.5, BURN_IN_TICKS - 1000],
            [0.2, BURN_IN_TICKS],
            [0.4, BURN_IN_TICKS + 1000],
        ]) {
            const { world, observer } = handWorld(pools, { offset, tick });
            sampleInstinct(pools, observer, world);
        }
        expect(pools.founders).toBeCloseTo(0.1, 6);
        expect(instinctMetrics({ instinct: pools })['eval.instinct_drift'].value).toBeCloseTo(3, 5);
    });

    it('reads each genome against the prior of its own specialisation', () => {
        const pools = createInstinctPools(CONFIG);
        const { world, observer } = handWorld(pools, { offset: 0, tick: 1000 });
        expect(priorDistance(pools, world, observer.sampled)).toBeCloseTo(0, 6);
        world.spec.reverse();
        expect(priorDistance(pools, world, observer.sampled)).toBeGreaterThan(0.1);
    });

    it('is null without a prior, and without a sample after burn-in', () => {
        const off = createInstinctPools(createConfig({ instinctWeight: 0 }));
        const offWorld = handWorld(off, { offset: 0.1, tick: BURN_IN_TICKS });
        sampleInstinct(off, offWorld.observer, offWorld.world);
        expect(instinctMetrics({ instinct: off })['eval.instinct_drift'].value).toBeNull();
        const early = createInstinctPools(CONFIG);
        const { world, observer } = handWorld(early, { offset: 0.1, tick: 1000 });
        sampleInstinct(early, observer, world);
        const metric = instinctMetrics({ instinct: early })['eval.instinct_drift'];
        expect(metric.value).toBeNull();
        expect(metric.reason).toBeTypeOf('string');
    });
});
