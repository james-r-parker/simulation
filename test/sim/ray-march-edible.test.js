// eat-choice G3 (docs/designs/eat-choice.md): a ray sees only the food its caster can eat, and passes through the rest.
import { castRays } from '../../js/sim/ray-march.js';
import { FOOD_KIND } from '../../js/sim/carcass.js';
import { RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { addAgent, addFood, rebuild, senseWorld } from './helpers/sense-world.js';
import { describe, expect, it } from 'vitest';

const FORAGER = 0;
const PREDATOR = 1;
const CH_FOOD = 1;
const CH_PREY = 3;

/**
 * Casts one caster at (500, 500) facing +x at a food item 100 ahead, and returns its forward ray.
 * @param {{ spec: number, kind: number, behind?: boolean, over?: Record<string, any> }} c the case; `behind` puts a
 *   small forager 100 beyond the food
 * @returns {number[]} the forward ray's channels
 */
function forwardRay({ spec, kind, behind = false, over = {} }) {
    const specialisations = { predator: { plantFoodValue: 0 }, ...over.specialisations };
    const w = senseWorld({ huntSizeRatio: 1.01, ...over, specialisations });
    const me = addAgent(w, 500, 500, 20);
    w.spec[me] = spec;
    const f = addFood(w, 600, 500, 10);
    w.foodKind[f] = kind;
    if (behind) {
        addAgent(w, 700, 500, 10);
    }
    castRays(w, rebuild(w), me);
    const base = me * w.layout.rawInputCount;
    return Array.from(w.inputs.subarray(base, base + RAY_CHANNELS));
}

describe('castRays: a ray sees only edible food (eat-choice G3)', () => {
    it("shows no food on a predator's ray at a plant", () => {
        const ray = forwardRay({ spec: PREDATOR, kind: FOOD_KIND.PLANT });
        expect(ray[CH_FOOD]).toBe(0);
    });

    it("passes a predator's ray through a plant to the prey behind it", () => {
        const ray = forwardRay({ spec: PREDATOR, kind: FOOD_KIND.PLANT, behind: true });
        expect(ray[CH_FOOD]).toBe(0);
        expect(ray[CH_PREY]).toBeGreaterThan(0);
        expect(ray[0]).toBeCloseTo(1 - 190 / senseWorld().visionBySpec[PREDATOR], 6);
    });

    it("shows food on a predator's ray at a carcass, in front of the prey", () => {
        const ray = forwardRay({ spec: PREDATOR, kind: FOOD_KIND.MEAT, behind: true });
        expect(ray[CH_FOOD]).toBe(1);
        expect(ray[CH_PREY]).toBe(0);
    });

    it("shows food on a forager's ray at a plant and at a carcass", () => {
        expect(forwardRay({ spec: FORAGER, kind: FOOD_KIND.PLANT })[CH_FOOD]).toBe(1);
        expect(forwardRay({ spec: FORAGER, kind: FOOD_KIND.MEAT })[CH_FOOD]).toBe(1);
    });

    it('hides meat from a forager whose meatFoodValue is 0', () => {
        const over = { specialisations: { forager: { meatFoodValue: 0 } } };
        expect(forwardRay({ spec: FORAGER, kind: FOOD_KIND.MEAT, over })[CH_FOOD]).toBe(0);
        expect(forwardRay({ spec: FORAGER, kind: FOOD_KIND.PLANT, over })[CH_FOOD]).toBe(1);
    });
});
