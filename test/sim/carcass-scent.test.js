import { describe, expect, it } from 'vitest';
import { RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { FOOD_KIND, scentCarcasses } from '../../js/sim/carcass.js';
import { createConfig } from '../../js/sim/config.js';
import { updatePheromones } from '../../js/sim/pheromones.js';
import { writeScentInputs } from '../../js/sim/scent-inputs.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';
import { addAgent, addFood, senseWorld } from './helpers/sense-world.js';

/**
 * @param {any} w the world
 * @param {number} slot the agent
 * @returns {number} the hunt scent input here (body input 21)
 */
function huntHere(w, slot) {
    writeScentInputs(w, slot);
    return w.inputs[slot * w.layout.rawInputCount + w.config.rayCount * RAY_CHANNELS + 21];
}

/**
 * @param {boolean} carcassScent the switch
 * @param {number} kind the food kind of the item
 * @returns {{w: any, me: number}} an agent 60 away from a food item, after a few ticks of scent
 */
function run(carcassScent, kind) {
    const w = senseWorld({ carcassScent, pheromoneCellSize: 100 });
    const me = addAgent(w, 500, 500, 20);
    const food = addFood(w, 560, 500, 10);
    w.foodKind[food] = kind;
    for (let t = 0; t < 5; t++) {
        scentCarcasses(w);
        updatePheromones(w);
    }
    return { w, me };
}

describe('carcassScent', () => {
    it('is off by default and leaves the hunt field empty', () => {
        expect(createConfig({ ...SIMPLE_WORLD }).carcassScent).toBe(false);
        const { w, me } = run(false, FOOD_KIND.MEAT);
        expect(huntHere(w, me)).toBe(0);
        expect(w.hunt.every((/** @type {number} */ v) => v === 0)).toBe(true);
    });

    it('raises the hunt scent input near a carcass when on', () => {
        const { w, me } = run(true, FOOD_KIND.MEAT);
        expect(huntHere(w, me)).toBeGreaterThan(0);
    });

    it('leaves the hunt scent alone near plant food when on', () => {
        const { w, me } = run(true, FOOD_KIND.PLANT);
        expect(huntHere(w, me)).toBe(0);
        expect(w.hunt.every((/** @type {number} */ v) => v === 0)).toBe(true);
    });

    it('fades after the carcass is gone', () => {
        const { w } = run(true, FOOD_KIND.MEAT);
        w.foodAlive.fill(0);
        const total = () => w.hunt.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0);
        const before = total();
        for (let t = 0; t < 20; t++) {
            scentCarcasses(w);
            updatePheromones(w);
        }
        expect(total()).toBeLessThan(before);
    });

    it('writes only the hunt field', () => {
        const { w } = run(true, FOOD_KIND.MEAT);
        const quiet = (/** @type {Float32Array} */ g) => g.every((v) => v === 0);
        expect(quiet(w.danger) && quiet(w.attack)).toBe(true);
    });
});
