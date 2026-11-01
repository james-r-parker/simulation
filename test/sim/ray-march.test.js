import { castRays } from '../../js/sim/ray-march.js';
import { detCos, detSin } from '../../js/sim/det-math.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';
import { addAgent, addCloud, addFood, rebuild, senseWorld } from './helpers/sense-world.js';
import { RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { describe, expect, it } from 'vitest';

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

describe('castRays classes', () => {
    it('reports a herd body in the obstacle channel', () => {
        const w = senseWorld({ herdCount: 1, herdSize: 1 });
        const me = addAgent(w, 500, 500, 20);
        w.herdAlive[0] = 1;
        w.herdX[0] = 650;
        w.herdY[0] = 500;
        cast(w, me);
        const ray = rayValues(w, me, 0);
        expect(ray[CH.obstacle]).toBe(1);
        expect(ray.slice(1).filter((value) => value !== 0)).toHaveLength(1);
    });

    it('sees food', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        addFood(w, 600, 500, 20);
        cast(w, me);
        const r = rayValues(w, me, 0);
        expect(r[CH.prox]).toBeCloseTo(1 - 80 / VISION, 6);
        expect(r.slice(1)).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    });

    it.each([
        ['an agent that can bite me', { me: 0, other: 1, otherSize: 40 }, CH.threat],
        ['an agent I can bite', { me: 1, other: 0, otherSize: 10 }, CH.prey],
        ['a bigger agent that cannot hunt', { me: 0, other: 0, otherSize: 40 }, CH.other],
        ['a smaller agent when I cannot hunt', { me: 0, other: 0, otherSize: 10 }, CH.other],
        ['a similar-size hunter', { me: 1, other: 1, otherSize: 20.1 }, CH.other],
        ['a hunter of equal size', { me: 1, other: 1, otherSize: 20 }, CH.other],
    ])('classifies %s', (_name, { me: meSpec, other, otherSize }, channel) => {
        // the classes above state the pre-T15d ratio (1.01) they assume; the default is now 0.8
        const w = senseWorld({ huntSizeRatio: 1.01 });
        const me = addAgent(w, 500, 500, 20);
        const them = addAgent(w, 600, 500, otherSize);
        w.spec[me] = meSpec;
        w.spec[them] = other;
        w.angle[them] = Math.PI;
        cast(w, me);
        const r = rayValues(w, me, 0);
        const proximity = 1 - (100 - otherSize) / w.visionBySpec[meSpec];
        expect(r[CH.prox]).toBeCloseTo(proximity, 6);
        expect(r[channel]).toBeCloseTo(proximity, 6);
        expect(r.slice(1).filter((v) => v !== 0)).toHaveLength(1);
    });

    it('classes an equal-size hunter as a threat at the T15d ratio of 0.8, since each can bite the other', () => {
        const w = senseWorld({ huntSizeRatio: 0.8 });
        const me = addAgent(w, 500, 500, 20);
        const them = addAgent(w, 600, 500, 20);
        w.spec[me] = 1;
        w.spec[them] = 1;
        w.angle[them] = Math.PI;
        cast(w, me);
        const r = rayValues(w, me, 0);
        expect(r[CH.threat]).toBeCloseTo(1 - 80 / w.visionBySpec[1], 6);
        expect(r[CH.prey]).toBe(0);
    });

    it('calls a hunter a threat from any angle, its jaws facing away or not', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        const them = addAgent(w, 600, 500, 40);
        w.spec[them] = 1;
        w.angle[them] = 0;
        cast(w, me);
        expect(rayValues(w, me, 0)[CH.threat]).toBeGreaterThan(0);
        w.angle[them] = Math.PI;
        cast(w, me);
        expect(rayValues(w, me, 0)[CH.threat]).toBeGreaterThan(0);
    });

    it('lets kin override size', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        const child = addAgent(w, 600, 500, 40);
        w.spec[child] = 1;
        w.angle[child] = Math.PI;
        w.parentA[child] = w.genomeId[me];
        cast(w, me);
        expect(rayValues(w, me, 0)[CH.kin]).toBeGreaterThan(0);
        expect(rayValues(w, me, 0)[CH.threat]).toBe(0);
    });

    it('sees a cousin as non-kin', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        const cousin = addAgent(w, 600, 500, 20);
        w.parentA[me] = 7;
        w.parentA[cousin] = 8;
        cast(w, me);
        expect(rayValues(w, me, 0)[CH.other]).toBeGreaterThan(0);
        expect(rayValues(w, me, 0)[CH.kin]).toBe(0);
    });

    it('sees a wall', () => {
        const w = senseWorld();
        const me = addAgent(w, 900, 500, 20);
        cast(w, me);
        const r = rayValues(w, me, 0);
        expect(r[CH.prox]).toBeCloseTo(1 - 100 / VISION, 6);
        expect(r[CH.wall]).toBe(1);
    });

    it('sees a wall along each axis and ignores one beyond vision', () => {
        const w = senseWorld();
        const me = addAgent(w, 100, 500, 20);
        cast(w, me);
        expect(rayValues(w, me, 2)[CH.prox]).toBeCloseTo(1 - 100 / VISION, 6);
        expect(rayValues(w, me, 1)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    });

    it('sees an obstacle', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        w.obsX[0] = 650;
        w.obsY[0] = 500;
        w.obsRadius[0] = 50;
        cast(w, me);
        const r = rayValues(w, me, 0);
        expect(r[CH.prox]).toBeCloseTo(1 - 100 / VISION, 6);
        expect(r[CH.obstacle]).toBe(1);
    });

    it('writes all zeros for no hit', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        w.inputs.fill(9);
        cast(w, me);
        for (let k = 0; k < 4; k++) {
            expect(rayValues(w, me, k)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
        }
    });

    it('gives distance 0 when the origin is inside a circle', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        addFood(w, 505, 500, 30);
        cast(w, me);
        expect(rayValues(w, me, 0).slice(0, 2)).toEqual([1, 1]);
    });

    it('hits a big agent centred in a neighbouring cell', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        const big = addAgent(w, 500 + 128 * 2, 500, 120);
        w.spec[big] = 1;
        w.angle[big] = Math.PI;
        cast(w, me);
        expect(rayValues(w, me, 0)[CH.threat]).toBeGreaterThan(0);
    });

    it('takes the food over an agent at the same distance, and the agent over an obstacle', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        addAgent(w, 600, 500, 20);
        addFood(w, 600, 500, 20);
        w.obsX[0] = 600;
        w.obsY[0] = 500;
        w.obsRadius[0] = 20;
        cast(w, me);
        expect(rayValues(w, me, 0)[CH.food]).toBe(1);
        w.foodAlive[0] = 0;
        cast(w, me);
        expect(rayValues(w, me, 0)[CH.other]).toBeGreaterThan(0);
    });

    it('breaks equal agent distances by the lower slot', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        const first = addAgent(w, 600, 500, 40);
        addAgent(w, 600, 500, 40);
        w.spec[first] = 1;
        w.angle[first] = Math.PI;
        w.size[2] = 10;
        w.x[2] = 590;
        cast(w, me);
        expect(rayValues(w, me, 0)[CH.threat]).toBeGreaterThan(0);
    });

    it('turns the rays with the heading', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        w.angle[me] = Math.PI / 2;
        addFood(w, 500, 600, 20);
        cast(w, me);
        expect(rayValues(w, me, 0)[CH.food]).toBe(1);
    });
});

describe('castRays smoke', () => {
    it('stops at a cloud, writing proximity and the smoke flag on channel 8', () => {
        const w = senseWorld();
        const me = addAgent(w, 200, 500, 20);
        addCloud(w, 400, 500);
        cast(w, me);
        const r = rayValues(w, me, 0);
        expect(r[CH.prox]).toBeCloseTo(1 - (400 - w.config.smokeRadius - 200) / VISION, 6);
        expect(r[CH.smoke]).toBe(1);
        expect(r.slice(1, 8)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    });

    it('sees nothing behind a cloud', () => {
        const w = senseWorld();
        const me = addAgent(w, 200, 500, 20);
        addCloud(w, 300, 500);
        addFood(w, 400, 500, 20);
        cast(w, me);
        expect(rayValues(w, me, 0)[CH.food]).toBe(0);
        expect(rayValues(w, me, 0)[CH.smoke]).toBe(1);
    });

    it('still sees an agent in front of a cloud', () => {
        const w = senseWorld();
        const me = addAgent(w, 200, 500, 20);
        addCloud(w, 400, 500);
        addAgent(w, 280, 500, 20);
        cast(w, me);
        expect(rayValues(w, me, 0)[CH.smoke]).toBe(0);
        expect(rayValues(w, me, 0)[CH.other]).toBeGreaterThan(0);
    });

    it('hits a cloud at distance 0 when the ray starts inside it', () => {
        const w = senseWorld();
        const me = addAgent(w, 400, 500, 20);
        addCloud(w, 420, 500);
        cast(w, me);
        for (let k = 0; k < 4; k++) {
            const r = rayValues(w, me, k);
            expect([r[CH.prox], r[CH.smoke]]).toEqual([1, 1]);
        }
    });

    it('leaves the rays beside a cloud unchanged', () => {
        const w = senseWorld();
        const me = addAgent(w, 200, 500, 20);
        addFood(w, 200, 600, 20);
        cast(w, me);
        const before = [0, 1, 2, 3].map((k) => rayValues(w, me, k));
        addCloud(w, 500, 500);
        cast(w, me);
        expect(rayValues(w, me, 0)[CH.smoke]).toBe(1);
        for (const k of [1, 2, 3]) {
            expect(rayValues(w, me, k)).toEqual(before[k]);
        }
    });

    it('ignores a cloud beyond the vision range', () => {
        const w = senseWorld();
        const me = addAgent(w, 100, 500, 20);
        addCloud(w, 100 + VISION + w.config.smokeRadius + 10, 500);
        cast(w, me);
        expect(rayValues(w, me, 0)).toEqual(new Array(9).fill(0));
    });

    it('ranks smoke after the wall at an equal distance', () => {
        const w = senseWorld({ smokeRadius: 100 });
        const me = addAgent(w, 700, 500, 20);
        addCloud(w, 1100, 500);
        cast(w, me);
        const r = rayValues(w, me, 0);
        expect([r[CH.wall], r[CH.smoke]]).toEqual([1, 0]);
    });

    it('writes no smoke flag without clouds', () => {
        const w = senseWorld();
        const me = addAgent(w, 200, 500, 20);
        cast(w, me);
        for (let k = 0; k < 4; k++) {
            expect(rayValues(w, me, k)[CH.smoke]).toBe(0);
        }
    });
});

/**
 * Reference caster: tests every circle, obstacle and wall with the ray-circle formula.
 * @param {ReturnType<typeof senseWorld>} w
 * @param {number} me
 * @param {number} k
 * @returns {{t: number, kind: number, idx: number}}
 */
function brute(w, me, k) {
    const cH = detCos(w.angle[me]);
    const sH = detSin(w.angle[me]);
    const dx = cH * w.rayCos[k] - sH * w.raySin[k];
    const dy = sH * w.rayCos[k] + cH * w.raySin[k];
    const range = w.visionBySpec[w.spec[me]];
    let best = { t: Infinity, kind: 3, idx: 0 };
    /** @param {number} cx @param {number} cy @param {number} r @param {number} kind @param {number} idx */
    const test = (cx, cy, r, kind, idx) => {
        const ox = w.x[me] - cx;
        const oy = w.y[me] - cy;
        const b = dx * ox + dy * oy;
        const c = ox * ox + oy * oy - r * r;
        if (b * b - c < 0) {
            return;
        }
        let t = -b - Math.sqrt(b * b - c);
        if (t < 0) {
            t = c <= 0 ? 0 : -1;
        }
        const better = t < best.t || (t === best.t && (kind < best.kind || (kind === best.kind && idx < best.idx)));
        if (t >= 0 && t <= range && better) {
            best = { t, kind, idx };
        }
    };
    for (let i = 0; i < w.obsX.length; i++) {
        test(w.obsX[i], w.obsY[i], w.obsRadius[i], 2, i);
    }
    const W = w.config.worldWidth;
    const tx = dx < 0 ? -w.x[me] / dx : dx > 0 ? (W - w.x[me]) / dx : Infinity;
    const ty = dy < 0 ? -w.y[me] / dy : dy > 0 ? (W - w.y[me]) / dy : Infinity;
    if (Math.min(tx, ty) <= range && Math.min(tx, ty) < best.t) {
        best = { t: Math.min(tx, ty), kind: 3, idx: 0 };
    }
    for (let f = 0; f < w.foodAlive.length; f++) {
        if (w.foodAlive[f]) {
            test(w.foodX[f], w.foodY[f], w.foodRadius[f], 0, f);
        }
    }
    for (let a = 0; a < w.alive.length; a++) {
        if (w.alive[a] && a !== me) {
            test(w.x[a], w.y[a], w.size[a], 1, a);
        }
    }
    for (let c = 0; c < w.cloudCount; c++) {
        test(w.cloudX[c], w.cloudY[c], w.config.smokeRadius, 4, c);
    }
    return best;
}

/**
 * Reference class of an agent hit: written from the bite rule in the plan, not shared with the code under test.
 * @param {ReturnType<typeof senseWorld>} w
 * @param {number} me
 * @param {number} other
 * @returns {number} the channel
 */
function bruteAgentClass(w, me, other) {
    /** @type {(a: number, b: number) => boolean} */
    const kin = (a, b) =>
        w.parentA[a] === w.genomeId[b] ||
        w.parentB[a] === w.genomeId[b] ||
        w.parentA[b] === w.genomeId[a] ||
        w.parentB[b] === w.genomeId[a];
    /** @type {(a: number, b: number) => boolean} */
    const bites = (a, b) => {
        const hunts = Object.values(w.config.specialisations).find((e) => e.index === w.spec[a]).canHunt;
        return hunts && w.size[a] > w.config.huntSizeRatio * w.size[b];
    };
    if (kin(me, other)) {
        return CH.kin;
    }
    if (bites(other, me)) {
        return CH.threat;
    }
    return bites(me, other) ? CH.prey : CH.other;
}

describe('castRays against a brute-force caster', () => {
    it.each(Array.from({ length: 30 }, (_, i) => i + 1))('matches on seeded world %i', (seed) => {
        const rng = createRng(seed);
        const w = senseWorld({ rayCount: 8, maxAgents: 12, maxFood: 40, smokeRadius: 60 });
        const place = () => 20 + nextFloat(rng) * (1000 - 2 * 20);
        for (let i = 0; i < 12; i++) {
            const a = addAgent(w, place(), place(), 10 + nextFloat(rng) * 40);
            w.angle[a] = (nextFloat(rng) - 0.5) * 6;
            w.spec[a] = Math.floor(nextFloat(rng) * 4);
        }
        w.parentA[3] = w.genomeId[2];
        w.parentA[7] = w.genomeId[1];
        for (let i = 0; i < 40; i++) {
            addFood(w, place(), place(), 5 + nextFloat(rng) * 25);
        }
        for (let i = 0; i < 2; i++) {
            w.obsX[i] = place();
            w.obsY[i] = place();
            w.obsRadius[i] = 20 + nextFloat(rng) * 80;
        }
        for (let i = 0; i < 3; i++) {
            addCloud(w, place(), place());
        }
        const hash = rebuild(w);
        for (let me = 0; me < 12; me++) {
            castRays(w, hash, me);
            for (let k = 0; k < 8; k++) {
                const ref = brute(w, me, k);
                const got = rayValues(w, me, k);
                const range = w.visionBySpec[w.spec[me]];
                const expected = ref.t === Infinity ? 0 : 1 - ref.t / range;
                expect(got[0]).toBeCloseTo(expected, 5);
                const kinds = [[1], [2, 3, 4, 5], [7], [6], [8]][ref.kind];
                const hot = got.slice(1).flatMap((v, n) => (v !== 0 ? [n + 1] : []));
                expect(hot.length).toBe(ref.t === Infinity ? 0 : 1);
                expect(hot.every((c) => kinds.includes(c))).toBe(true);
                if (ref.kind === 1) {
                    expect(hot[0]).toBe(bruteAgentClass(w, me, ref.idx));
                    expect(got[hot[0]]).toBeCloseTo(got[0], 12);
                }
            }
        }
    });
});
