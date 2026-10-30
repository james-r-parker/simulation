import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { CLAMP_LEVEL, WEIGHT_DIRECTIONS, sampleWeights, weightMetrics } from '../../js/evo/metrics-weights.js';
import { MIN_EVENTS } from '../../js/evo/rare-saturation.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

const H = 3;

/**
 * @param {number} agents agents, all sampled
 * @returns {{world: any, observer: any, slots: number[]}} a world past burn-in
 */
function setup(agents) {
    const { world, observer } = observed({ brainHidden: H, maxAgents: 8 });
    world.tick = BURN_IN_TICKS;
    const slots = Array.from({ length: agents }, () => addBlob(world));
    observer.sampled = Int32Array.from(slots);
    return { world, observer, slots };
}

describe('eval.weight_drift_silent', () => {
    it('is the mean absolute wIn weight on rare inputs over the mean on the others, per checkpoint', () => {
        const { world, observer, slots } = setup(2);
        const { layout } = world;
        observer.activity.rare[1] = 1;
        observer.activity.rare[4] = 1;
        observer.activity.rareCount = 2;
        for (const slot of slots) {
            const base = slot * layout.weightCount + layout.wIn;
            world.weights.fill(0.5, base, base + layout.inputCount * H);
            world.weights.fill(-2, base + H, base + 2 * H);
            world.weights.fill(1.5, base + 4 * H, base + 5 * H);
        }
        sampleWeights(observer.weightPools, observer, world);
        const rare = (2 + 1.5) / 2;
        expect(weightMetrics(observer)['eval.weight_drift_silent'].value).toBeCloseTo(rare / 0.5, 6);
    });

    it('is null with no rare input, and with every input rare', () => {
        const { world, observer } = setup(1);
        sampleWeights(observer.weightPools, observer, world);
        expect(weightMetrics(observer)['eval.weight_drift_silent'].value).toBeNull();
        observer.activity.rare.fill(1);
        observer.activity.rareCount = world.layout.inputCount;
        sampleWeights(observer.weightPools, observer, world);
        expect(weightMetrics(observer)['eval.weight_drift_silent'].value).toBeNull();
    });
});

describe('eval.weight_clamp_share', () => {
    it('counts wIn, wRec and wOut weights at 3.9 or more, over those blocks only', () => {
        const { world, observer, slots } = setup(1);
        const { layout } = world;
        const base = slots[0] * layout.weightCount;
        world.weights[base + layout.wIn] = 4;
        world.weights[base + layout.wRec + 2] = -CLAMP_LEVEL;
        world.weights[base + layout.wOut + 5] = 3.95;
        world.weights[base + layout.bHidden] = 4; // a bias: not counted
        world.weights[base + layout.leakStart] = 4; // a leak gene: not counted
        world.weights[base + layout.wIn + 1] = 3.8; // under the level
        sampleWeights(observer.weightPools, observer, world);
        const blocks = layout.bHidden - layout.wIn + (layout.bOut - layout.wOut);
        expect(weightMetrics(observer)['eval.weight_clamp_share'].value).toBe(3 / blocks);
    });
});

describe('eval.sigma_mean, eval.input_active_share and the saturation jump', () => {
    it('averages sigma over the alive agents, and is null without a sigma array', () => {
        const { world, observer, slots } = setup(2);
        expect(weightMetrics(observer)['eval.sigma_mean'].reason).toBe('the policy has no sigma array');
        observer.sigma = new Float32Array(8);
        observer.sigma[slots[0]] = 0.1;
        observer.sigma[slots[1]] = 0.3;
        sampleWeights(observer.weightPools, observer, world);
        expect(weightMetrics(observer)['eval.sigma_mean'].value).toBeCloseTo(0.2, 6);
    });

    it('reports the mean active share, null until a sample is taken', () => {
        const { observer } = setup(1);
        expect(weightMetrics(observer)['eval.input_active_share'].value).toBeNull();
        observer.activity.samples = 4;
        observer.activity.active[0] = 4;
        expect(weightMetrics(observer)['eval.input_active_share'].value).toBe(1 / observer.activity.inputCount);
    });

    it('reports the mean jump over at least 100 first firings', () => {
        const { observer } = setup(1);
        observer.saturation.events = MIN_EVENTS - 1;
        expect(weightMetrics(observer)['eval.rare_input_saturation_jump'].value).toBeNull();
        observer.saturation.events = MIN_EVENTS;
        observer.saturation.jumpSum = 25;
        expect(weightMetrics(observer)['eval.rare_input_saturation_jump'].value).toBe(0.25);
    });

    it('is watch throughout', () => {
        expect(Object.keys(WEIGHT_DIRECTIONS)).toHaveLength(5);
        expect(Object.values(WEIGHT_DIRECTIONS).every((d) => d === 'watch')).toBe(true);
    });
});
