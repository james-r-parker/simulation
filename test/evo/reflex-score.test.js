import { describe, expect, it } from 'vitest';
import { forwardAll } from '../../js/sim/brain.js';
import { OUTPUT_COUNT, OUTPUT_INDEX, brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { caseNamed } from '../../js/evo/reflex-cases.js';
import { createReflexWorld, evalReflex, loadGenome } from '../../js/evo/reflex-eval.js';
import {
    MAX_BAR,
    REFERENCE_MIN,
    REFLEX_RANDOM_BRAINS,
    caseNamesFor,
    constantBrains,
    evalCase,
    isValid,
    referenceFor,
    reflexRandomBrains,
    reflexRow,
} from '../../js/evo/reflex-score.js';
import { buildCaseTable } from '../../js/evo/reflex-table.js';

const layout = brainLayout(createConfig({}));
const flee = caseNamed('flee-threat');

describe('reflexRandomBrains', () => {
    it('gives 64 random brains from the stream of the case, seed and index', () => {
        const brains = reflexRandomBrains(flee, { seed: 3 });
        expect(brains).toHaveLength(REFLEX_RANDOM_BRAINS);
        expect(REFLEX_RANDOM_BRAINS).toBe(64);
        expect(brains[0].weights).toHaveLength(layout.weightCount);
        expect(brains[0].weights).not.toEqual(brains[1].weights);
        expect(reflexRandomBrains(flee, { seed: 3 })[5].weights).toEqual(brains[5].weights);
        expect(reflexRandomBrains(flee, { seed: 4 })[5].weights).not.toEqual(brains[5].weights);
        expect(reflexRandomBrains(caseNamed('approach-food'), { seed: 3 })[5].weights).not.toEqual(brains[5].weights);
    });
});

describe('constantBrains', () => {
    /**
     * @param {Float32Array | null} weights a brain row
     * @returns {Float32Array} its outputs on an all-zero input row
     */
    function outputsOf(weights) {
        const world = createReflexWorld({}, 1, 0);
        loadGenome(world, 0, /** @type {Float32Array} */ (weights));
        forwardAll(world);
        return world.outputs.slice(0, OUTPUT_COUNT);
    }

    it('are four brains whose outputs are fixed: zero, thrust, thrust and turn, bite', () => {
        const [zero, thrust, left, bite] = constantBrains().map((b) => outputsOf(b.weights));
        const o = OUTPUT_INDEX;
        expect([...zero].every((v) => v === 0)).toBe(true);
        expect(thrust[o.THRUST]).toBeGreaterThan(0.999);
        expect(thrust[o.TURN]).toBe(0);
        expect(left[o.THRUST]).toBeGreaterThan(0.999);
        expect(left[o.TURN]).toBeGreaterThan(0.999);
        expect(bite[o.BITE]).toBeGreaterThan(0.999);
        expect(bite[o.THRUST]).toBe(0);
    });

    it('give the same outputs whatever the input row', () => {
        const world = createReflexWorld({}, 1, 0);
        const [, thrust] = constantBrains();
        loadGenome(world, 0, /** @type {Float32Array} */ (thrust.weights));
        world.inputs.fill(0.7);
        forwardAll(world);
        expect(world.outputs[OUTPUT_INDEX.THRUST]).toBeGreaterThan(0.999);
        expect(world.outputs[OUTPUT_INDEX.TURN]).toBe(0);
    });
});

describe('referenceFor', () => {
    it('is the hue-aware controller for pick-safe-food and the memoryless one for the rest', () => {
        expect(referenceFor(caseNamed('pick-safe-food')).name).toBe('hue-aware');
        expect(referenceFor(flee).name).toBe('memoryless');
    });
});

describe('isValid', () => {
    it('needs the reference at 0.9 and the random mean and constant bar at 0.5 at most', () => {
        expect([REFERENCE_MIN, MAX_BAR]).toEqual([0.9, 0.5]);
        expect(isValid({ random: 0.5, constant: 0.5, reference: 0.9 })).toBe(true);
        expect(isValid({ random: 0.5, constant: 0.5, reference: 0.89 })).toBe(false);
        expect(isValid({ random: 0.51, constant: 0, reference: 1 })).toBe(false);
        expect(isValid({ random: 0, constant: 0.51, reference: 1 })).toBe(false);
    });
});

describe('evalCase', () => {
    it('scores subjects as evalReflex does alone and adds the three bars on the same table', () => {
        const subject = reflexRandomBrains(flee, { seed: 99 })[0];
        const { name, scores, bars } = evalCase(flee, [subject], { trials: 4 });
        const alone = evalReflex([subject], [buildCaseTable(flee, { trials: 4 })])[0]['flee-threat'];
        expect(name).toBe('flee-threat');
        expect(scores).toEqual([alone]);
        expect(bars.reference).toBe(1);
        expect(bars.random).toBeGreaterThanOrEqual(0);
        expect(bars.constant).toBeLessThanOrEqual(MAX_BAR);
        expect(bars.valid).toBe(true);
    });
});

describe('reflexRow', () => {
    const bars = {
        a: { random: 0.25, constant: 0, reference: 1, valid: true },
        b: { random: 0.5, constant: 0, reference: 1, valid: true },
    };

    it('is the mean pass share, edge and first-row share over the genome cases', () => {
        const row = reflexRow(
            {
                a: { passes: 12, trials: 16, passShare: 0.75, fast: 0.5, kinds: {} },
                b: { passes: 8, trials: 16, passShare: 0.5, fast: 0.25, kinds: {} },
            },
            bars,
        );
        expect(row?.score).toBeCloseTo(0.625, 12);
        expect(row?.edge).toBeCloseTo(0.25, 12);
        expect(row?.fast).toBeCloseTo(0.375, 12);
        expect(row?.cases.a).toEqual({ passShare: 0.75, edge: 0.5, fast: 0.5, kinds: {} });
        expect(row?.cases.b.edge).toBeCloseTo(0, 12);
    });

    it('is null for a specialisation with no case', () => {
        expect(reflexRow({}, bars)).toBeNull();
    });
});

describe('caseNamesFor', () => {
    it('names the cases a specialisation faces', () => {
        expect(caseNamesFor(0)).toEqual(['flee-threat', 'approach-food', 'pick-safe-food', 'avoid-obstacle']);
        expect(caseNamesFor(1)).toEqual(['approach-prey', 'bite-discrimination']);
        expect(caseNamesFor(3)).toEqual([]);
    });
});
