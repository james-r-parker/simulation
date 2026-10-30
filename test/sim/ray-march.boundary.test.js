import { describe, expect, it } from 'vitest';
import { castRays } from '../../js/sim/ray-march.js';
import { addAgent, addFood, rebuild, senseWorld } from './helpers/sense-world.js';
import { RAY_CHANNELS } from '../../js/sim/brain-layout.js';

const CH = { prox: 0, food: 1, threat: 2, prey: 3, other: 4, kin: 5, wall: 6, obstacle: 7, smoke: 8 };
const VISION = 300;

/**
 * @param {ReturnType<typeof senseWorld>} w
 * @param {number} slot
 * @param {number} ray
 * @returns {number[]} the `RAY_CHANNELS` values of a ray
 */
function rayValues(w, slot, ray) {
    const base = slot * w.layout.rawInputCount + ray * RAY_CHANNELS;
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

describe('castRays obstacles at the range edge', () => {
    it('sees an obstacle whose surface is exactly at the vision range, and none just beyond', () => {
        const at = senseWorld();
        const me = addAgent(at, 500, 500, 20);
        obstacle(at, 0, 500 + VISION + 40, 500, 40);
        obstacle(at, 1, 5000, 5000, 10);
        cast(at, me);
        expect(rayValues(at, me, 0)).toEqual([0, 0, 0, 0, 0, 0, 0, 1, 0]);
        const beyond = senseWorld();
        const you = addAgent(beyond, 500, 500, 20);
        obstacle(beyond, 0, 500 + VISION + 41, 500, 40);
        obstacle(beyond, 1, 5000, 5000, 10);
        cast(beyond, you);
        expect(rayValues(beyond, you, 0)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    });

    it('sees the nearer of two listed obstacles and an obstacle the agent stands inside', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        obstacle(w, 0, 700, 500, 50);
        obstacle(w, 1, 600, 500, 30);
        cast(w, me);
        expect(rayValues(w, me, 0)[0]).toBeCloseTo(1 - 70 / VISION, 6);
        const inside = senseWorld();
        const you = addAgent(inside, 500, 500, 20);
        obstacle(inside, 0, 510, 500, 100);
        obstacle(inside, 1, 5000, 5000, 10);
        cast(inside, you);
        expect(rayValues(inside, you, 0)).toEqual([1, 0, 0, 0, 0, 0, 0, 1, 0]);
    });
});

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
        expect(r[CH.other] + r[CH.threat]).toBeGreaterThan(0);
        expect(r[CH.wall]).toBe(0);
    });

    it('breaks equal agent distances by the lower slot, whichever is smaller', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        const first = addAgent(w, 600, 500, 40);
        w.spec[first] = 1;
        w.angle[first] = Math.PI;
        addAgent(w, 570, 500, 10);
        cast(w, me);
        const r = rayValues(w, me, 0);
        expect(r[CH.threat]).toBeCloseTo(r[CH.prox], 12);
        expect(r.slice(1).filter((v) => v !== 0)).toHaveLength(1);
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
        const after = me * w.layout.rawInputCount + w.config.rayCount * RAY_CHANNELS;
        expect(w.inputs[after]).toBe(9);
        expect(w.inputs[after - 1]).toBe(0);
    });
});

describe('castRays size classes at the ratio', () => {
    it.each([
        ['exactly ratio times larger cannot bite me', 40, 1, 0, CH.other],
        ['just over ratio times larger can bite me', 41, 1, 0, CH.threat],
        ['exactly 1 / ratio smaller is not prey', 10, 0, 1, CH.other],
        ['just under 1 / ratio smaller is prey', 9, 0, 1, CH.prey],
    ])('classes an agent %s', (_name, otherSize, otherSpec, mySpec, channel) => {
        const w = senseWorld({ huntSizeRatio: 2 });
        const me = addAgent(w, 500, 500, 20);
        const other = addAgent(w, 650, 500, otherSize);
        w.spec[me] = mySpec;
        w.spec[other] = otherSpec;
        w.angle[other] = Math.PI;
        cast(w, me);
        const r = rayValues(w, me, 0);
        expect(r.findIndex((v, i) => i > 0 && v !== 0)).toBe(channel);
    });
});
