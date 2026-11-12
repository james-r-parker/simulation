// The hunter plant linger share (eat-choice.md, Phase 5, T22): against hand-built worlds.

import { describe, expect, it } from 'vitest';
import { FOOD_KIND } from '../../js/sim/carcass.js';
import { CLOSING_SPEED } from '../../js/sim/merit-state.js';
import { buildFoodCellIndex, createFoodCellIndex } from '../../js/evo/food-cell-index.js';
import { createLingerScene, lingerMetrics, tallyLinger } from '../../js/evo/scene-linger.js';
import { directionOf, intendedOf, namesOf } from './helpers/metric-registry.js';

const MAX_VELOCITY = 8;
const SLOW = CLOSING_SPEED * MAX_VELOCITY;
const SIZE = 5;
const RADIUS = 2;

/**
 * @typedef {object} Hunter one hand-built hunter, and the food item placed beside it
 * @property {number} speed its speed
 * @property {number} [gap] the distance from its centre to its food (default 1)
 * @property {number} [kind] its food's kind (default plant)
 * @property {boolean} [foodAlive] whether the food is alive (default true)
 */

/**
 * @param {Hunter[]} hunters the hunters, one food item each
 * @returns {Record<string, any>} a hand-built world
 */
function world(hunters) {
    const n = hunters.length;
    const w = {
        config: { maxVelocity: MAX_VELOCITY, worldWidth: 100 * n + 1000, worldHeight: 1000, maxFood: n },
        spec: new Uint8Array(n).fill(1),
        size: new Float32Array(n).fill(SIZE),
        x: new Float32Array(n),
        y: new Float32Array(n),
        vx: new Float32Array(n),
        vy: new Float32Array(n),
        plantFoodBySpec: Float64Array.from([1, 0]), // the hunter's specialisation takes no plant: it lingers all the same
        meatFoodBySpec: Float64Array.from([0, 1]),
        foodAlive: new Uint8Array(n),
        foodKind: new Uint8Array(n),
        foodX: new Float32Array(n),
        foodY: new Float32Array(n),
        foodRadius: new Float32Array(n).fill(RADIUS),
    };
    hunters.forEach((h, i) => {
        w.x[i] = 100 * i;
        w.vy[i] = h.speed;
        w.foodAlive[i] = h.foodAlive === false ? 0 : 1;
        w.foodKind[i] = h.kind ?? FOOD_KIND.PLANT;
        w.foodX[i] = 100 * i + (h.gap ?? 1);
    });
    return w;
}

/** @param {Record<string, any>} scene @param {Record<string, any>} w a world, tallied as one sample */
function sample(scene, w) {
    const index = createFoodCellIndex(w.config);
    buildFoodCellIndex(index, w);
    for (let slot = 0; slot < w.spec.length; slot++) {
        tallyLinger(scene, w, { index, slot });
    }
}

/** @param {Record<string, any>} scene @returns {number | null} the metric's value */
const read = (scene) => /** @type {any} */ (lingerMetrics(scene))['eval.hunter_plant_linger_share'].value;

describe('the hunter plant linger share', () => {
    const hunters = [
        { speed: SLOW / 2 }, // on plant, slow: lingers
        { speed: SLOW }, // at the closing speed: not below it
        { speed: SLOW * 5 }, // on plant, fast
        { speed: 0, kind: FOOD_KIND.MEAT }, // on meat: a carcass meal, not grass
        { speed: 0, foodAlive: false }, // the grass is gone
        { speed: 0, gap: SIZE + RADIUS }, // touching exactly is not contact
        { speed: 0, gap: 50 }, // standing in the open
        { speed: 0 }, // on plant, still: lingers
    ];

    it('is the share of hunter samples on plant food while moving below the closing speed', () => {
        const scene = createLingerScene();
        sample(scene, world(hunters));
        expect([scene.hunters, scene.lingering]).toEqual([8, 2]);
        expect(read(scene)).toBe(0.25);
    });

    it('pools the samples', () => {
        const scene = createLingerScene();
        sample(scene, world(hunters));
        sample(scene, world([{ speed: 0 }, { speed: 0, gap: 50 }]));
        expect(read(scene)).toBeCloseTo(3 / 10, 12);
    });

    it('is null with a reason when no hunter was sampled', () => {
        const metric = lingerMetrics(createLingerScene())['eval.hunter_plant_linger_share'];
        expect(metric?.value).toBeNull();
        expect(metric?.reason).toBe('no hunter at a sample after burn-in');
    });
});

describe('the registry', () => {
    it('lists the detector with its direction', () => {
        expect(namesOf('js/evo/scene-linger.js')).toEqual(['eval.hunter_plant_linger_share']);
        expect(directionOf('eval.hunter_plant_linger_share')).toBe('watch');
        expect(intendedOf('eval.hunter_plant_linger_share')).toBe('lower');
    });
});
