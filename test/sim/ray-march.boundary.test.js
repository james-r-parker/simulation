import { describe, expect, it } from 'vitest';
import { castRays } from '../../js/sim/ray-march.js';
import { addAgent, addFood, rebuild, senseWorld } from './helpers/sense-world.js';
import { RAY_CHANNELS } from '../../js/sim/brain-layout.js';

const CH = { prox: 0, food: 1, bigger: 2, smaller: 3, similar: 4, kin: 5, wall: 6, obstacle: 7, smoke: 8 };
const VISION = 300;

/**
 * @param {ReturnType<typeof senseWorld>} w
 * @param {number} slot
 * @param {number} ray
 * @returns {number[]} the `RAY_CHANNELS` values of a ray
 */
function rayValues(w, slot, ray) {
    const base = slot * w.layout.inputCount + ray * RAY_CHANNELS;
    return Array.from(w.inputs.subarray(base, base + RAY_CHANNELS));
}

/**
 * @param {ReturnType<typeof senseWorld>} w
 * @param {number} slot
 */
function cast(w, slot) {
    castRays(w, rebuild(w), slot);
}

/**
 * @param {ReturnType<typeof senseWorld>} w
 * @param {number} i obstacle index
 * @param {number} x centre x
 * @param {number} y centre y
 * @param {number} r radius
 */
function obstacle(w, i, x, y, r) {
    w.obsX[i] = x;
    w.obsY[i] = y;
    w.obsRadius[i] = r;
}

describe('castRays range boundary', () => {
    it('sees a hit at exactly the vision range with proximity 0', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        addFood(w, 500 + VISION + 20, 500, 20);
        cast(w, me);
        expect(rayValues(w, me, 0)).toEqual([0, 1, 0, 0, 0, 0, 0, 0, 0]);
    });

    it('ignores a hit just beyond the vision range', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        addFood(w, 500 + VISION + 21, 500, 20);
        cast(w, me);
        expect(rayValues(w, me, 0)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    });

    it('reaches a hit at exactly the range that lies in the next hash cell', () => {
        const w = senseWorld();
        const me = addAgent(w, 468, 500, 20);
        addFood(w, 768 + 20, 500, 20);
        cast(w, me);
        expect(rayValues(w, me, 0)).toEqual([0, 1, 0, 0, 0, 0, 0, 0, 0]);
    });
});

describe('castRays tie-breaking', () => {
    it('takes an obstacle over a wall at the same distance', () => {
        const w = senseWorld();
        const me = addAgent(w, 900, 500, 20);
        obstacle(w, 1, 1050, 500, 50);
        cast(w, me);
        const r = rayValues(w, me, 0);
        expect(r[CH.prox]).toBeCloseTo(1 - 100 / VISION, 6);
        expect(r[CH.obstacle]).toBe(1);
        expect(r[CH.wall]).toBe(0);
    });

    it('takes an agent over a wall at the same distance', () => {
        const w = senseWorld();
        const me = addAgent(w, 900, 500, 20);
        addAgent(w, 1050, 500, 50);
        cast(w, me);
        const r = rayValues(w, me, 0);
        expect(r[CH.similar] + r[CH.bigger]).toBe(1);
        expect(r[CH.wall]).toBe(0);
    });

    it('breaks equal agent distances by the lower slot, whichever is smaller', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        addAgent(w, 600, 500, 40);
        addAgent(w, 570, 500, 10);
        cast(w, me);
        expect(rayValues(w, me, 0).slice(1)).toEqual([0, 1, 0, 0, 0, 0, 0, 0]);
    });
});

describe('castRays geometry edges', () => {
    it('hits a circle the ray only grazes', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        addFood(w, 600, 520, 20);
        cast(w, me);
        const r = rayValues(w, me, 0);
        expect(r[CH.prox]).toBeCloseTo(1 - 100 / VISION, 6);
        expect(r[CH.food]).toBe(1);
    });

    it('counts a circle the origin sits exactly on, with the ray heading away, as a hit at 0', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        addFood(w, 480, 500, 20);
        cast(w, me);
        expect(rayValues(w, me, 0)).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 0]);
    });

    it('finds the wall along an axis the ray does not move on when the origin is on that edge', () => {
        const w = senseWorld();
        const me = addAgent(w, 1000, 800, 20);
        w.rayCos[1] = 0;
        w.raySin[1] = 1;
        cast(w, me);
        const r = rayValues(w, me, 1);
        expect(r[CH.prox]).toBeCloseTo(1 - 200 / VISION, 6);
        expect(r[CH.wall]).toBe(1);
    });

    it('does not write past the ray values of the inputs row', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        w.inputs.fill(9);
        cast(w, me);
        const after = me * w.layout.inputCount + w.config.rayCount * RAY_CHANNELS;
        expect(w.inputs[after]).toBe(9);
        expect(w.inputs[after - 1]).toBe(0);
    });
});

describe('castRays size classes at the ratio', () => {
    it.each([
        ['exactly ratio times larger is similar', 40, CH.similar],
        ['just over ratio times larger is bigger', 41, CH.bigger],
        ['exactly 1 / ratio smaller is similar', 10, CH.similar],
        ['just under 1 / ratio smaller is smaller', 9, CH.smaller],
    ])('classes an agent %s', (_name, otherSize, channel) => {
        const w = senseWorld({ huntSizeRatio: 2 });
        const me = addAgent(w, 500, 500, 20);
        addAgent(w, 650, 500, otherSize);
        cast(w, me);
        const r = rayValues(w, me, 0);
        expect(r.indexOf(1, 1)).toBe(channel);
    });
});
