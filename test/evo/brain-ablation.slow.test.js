import { describe, expect, it } from 'vitest';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { ablateUnit, compareTrials } from '../../js/evo/brain-ablation.js';
import { DRILLS } from '../../js/evo/drill-scenarios.js';

const FOOD_AHEAD = /** @type {any} */ (DRILLS.find((drill) => drill.name === 'food-ahead'));
const CONFIG = createConfig();
const LAYOUT = brainLayout(CONFIG);

describe('brain ablation trials', () => {
    it('leaves every trial unchanged when the unit has no outgoing weights', () => {
        const subject = { name: 'no-path', id: 1, spec: 0, weights: new Float32Array(LAYOUT.weightCount), act: null };
        const intact = ablateUnit({ subject, drill: FOOD_AHEAD, unit: null, seed: 41, trials: 8 });
        const ablated = ablateUnit({ subject, drill: FOOD_AHEAD, unit: 0, seed: 41, trials: 8 });

        expect(compareTrials(intact, ablated)).toMatchObject({
            beforeWinShare: 0,
            afterWinShare: 0,
            change: 0,
            mcnemarP: 1,
        });
    });

    it('drops the food-ahead win share to the stationary subject when its only thrust path is silenced', () => {
        const weights = new Float32Array(LAYOUT.weightCount);
        weights[LAYOUT.wIn] = 5;
        weights[LAYOUT.wOut] = 5;
        weights[LAYOUT.wOut + 4] = 5;
        const active = { name: 'one-path', id: 2, spec: 0, weights, act: null };
        const stationary = {
            name: 'stationary',
            id: 3,
            spec: 0,
            weights: new Float32Array(LAYOUT.weightCount),
            act: null,
        };
        const baseline = ablateUnit({ subject: stationary, drill: FOOD_AHEAD, unit: null, seed: 17, trials: 8 });
        const intact = ablateUnit({ subject: active, drill: FOOD_AHEAD, unit: null, seed: 17, trials: 8 });
        const silenced = ablateUnit({ subject: active, drill: FOOD_AHEAD, unit: 0, seed: 17, trials: 8 });
        const againstStationary = compareTrials(baseline, silenced);

        expect(intact.some(({ won }) => won)).toBe(true);
        expect(againstStationary.afterWinShare).toBe(againstStationary.beforeWinShare);
        expect(compareTrials(intact, silenced).change).toBeLessThan(0);
    });
});
