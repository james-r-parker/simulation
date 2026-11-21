import { describe, expect, it } from 'vitest';
import {
    BODY_SENSE_VALUES,
    CH_KIN,
    CH_OTHER,
    CH_PREY,
    CH_THREAT,
    POOLED_CHANNELS,
    POOLED_STRIDE,
    POOLED_VALUES,
    RAY_CHANNELS,
    inputOffsets,
} from '../../js/sim/brain-layout.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';
import { detCos, detSin } from '../../js/sim/det-math.js';
import { poolRays, rayTables } from '../../js/sim/ray-pool.js';
import { senseAll } from '../../js/sim/sensors.js';
import { addAgent, addFood, rebuild, senseWorld } from './helpers/sense-world.js';

/** The agent channels whose view share is pooled, in pooled order. */
const SHARED = [CH_THREAT, CH_PREY, CH_OTHER, CH_KIN];

/**
 * @param {ReturnType<typeof senseWorld>} w the world
 * @param {number} slot the slot
 * @param {number | undefined} k a ray, or undefined for no hit
 * @returns {number[]} the ray's size, speed and closing lanes, or three zeros
 */
function bodyOf(w, slot, k) {
    const at = slot * w.config.rayCount + (k ?? 0);
    return k === undefined ? [0, 0, 0] : [w.raySize[at], w.raySpeed[at], w.rayClosing[at]];
}

/**
 * The naive per-channel reference: scan every ray for the channel, keep the largest proximity (the first ray on a tie).
 * The body sense is the size, speed and closing of the two prey hits and the threat hit kept, then the share of rays
 * whose class is threat, prey, other and kin.
 * @param {ReturnType<typeof senseWorld>} w the world
 * @param {number} slot the slot
 * @returns {number[]} the 69 pooled values then the body block
 */
function reference(w, slot) {
    const { rayCount } = w.config;
    const raw = slot * w.layout.rawInputCount;
    const proximity = (/** @type {number} */ k) => w.inputs[raw + k * RAY_CHANNELS];
    const out = [];
    const hues = [0, 0];
    /** @type {Record<number, number[]>} */
    const kept = {};
    for (let c = 1; c <= POOLED_CHANNELS.length; c++) {
        const hits = [];
        for (let k = 0; k < rayCount; k++) {
            if (w.inputs[raw + k * RAY_CHANNELS + c] > 0 && proximity(k) > 0) {
                hits.push(k);
            }
        }
        hits.sort((a, b) => proximity(b) - proximity(a) || a - b);
        kept[c] = hits;
        for (let i = 0; i < 2; i++) {
            const k = hits[i];
            if (c === 1 && k !== undefined) {
                hues[i] = w.rayHue[slot * rayCount + k];
            }
            out.push(...(k === undefined ? [0, 0, 0] : [proximity(k), w.rayCos[k], w.raySin[k]]));
        }
    }
    const sense = [
        ...bodyOf(w, slot, kept[CH_PREY][0]),
        ...bodyOf(w, slot, kept[CH_PREY][1]),
        ...bodyOf(w, slot, kept[CH_THREAT][0]),
        ...SHARED.map((c) => kept[c].length / rayCount),
    ];
    expect(sense).toHaveLength(BODY_SENSE_VALUES);
    out.push(...sense, ...hues);
    const body = raw + rayCount * RAY_CHANNELS;
    out.push(...w.inputs.subarray(body, raw + w.layout.rawInputCount));
    return out.map(Math.fround);
}

/**
 * Fills a slot's raw row with random rays (one channel per ray) and a random body block.
 * @param {ReturnType<typeof senseWorld>} w the world
 * @param {number} slot the slot
 * @param {ReturnType<typeof createRng>} rng the random stream
 * @returns {void}
 */
function randomRow(w, slot, rng) {
    const row = slot * w.layout.rawInputCount;
    const { rayCount } = w.config;
    w.inputs.fill(0, row, row + w.layout.rawInputCount);
    for (let k = 0; k < rayCount; k++) {
        if (nextFloat(rng) < 0.6) {
            const prox = Math.round(nextFloat(rng) * 8) / 8;
            w.inputs[row + k * RAY_CHANNELS] = prox;
            w.inputs[row + k * RAY_CHANNELS + 1 + Math.floor(nextFloat(rng) * 9)] = prox;
        }
    }
    for (let k = 0; k < rayCount; k++) {
        const at = slot * rayCount + k;
        w.rayHue[at] = w.inputs[row + k * RAY_CHANNELS + 1] > 0 ? 2 * nextFloat(rng) - 1 : 0;
        const agent = SHARED.some((c) => w.inputs[row + k * RAY_CHANNELS + c] > 0);
        w.raySize[at] = agent ? 2 * nextFloat(rng) - 1 : 0;
        w.raySpeed[at] = agent ? nextFloat(rng) : 0;
        w.rayClosing[at] = agent ? 2 * nextFloat(rng) - 1 : 0;
    }
    for (let i = rayCount * RAY_CHANNELS; i < w.layout.rawInputCount; i++) {
        w.inputs[row + i] = nextFloat(rng) - 0.5;
    }
}

describe('poolRays', () => {
    it('matches a naive per-channel reference on random rays', () => {
        const rng = createRng(7);
        const w = senseWorld({ rayCount: 16 });
        for (let trial = 0; trial < 40; trial++) {
            for (const slot of [1, 4]) {
                randomRow(w, slot, rng);
                poolRays(w, slot);
                const at = slot * w.layout.inputCount;
                expect(Array.from(w.pooled.subarray(at, at + w.layout.inputCount))).toEqual(reference(w, slot));
            }
        }
    });

    it('gives strength 0 with cosine and sine 0 for a channel no ray hits, and keeps every value in [-1, 1]', () => {
        const w = senseWorld({ rayCount: 8 });
        const me = addAgent(w, 500, 500, 20);
        addFood(w, 600, 500, 20);
        senseAll(w, rebuild(w));
        poolRays(w, me);
        const off = inputOffsets(w.config);
        const row = me * w.layout.inputCount;
        expect(w.pooled[row + off.pooled.food]).toBeGreaterThan(0);
        expect(w.pooled[row + off.pooled.food + 1]).toBe(1);
        const threat = row + off.pooled.threat;
        expect(Array.from(w.pooled.subarray(threat, threat + POOLED_STRIDE))).toEqual([0, 0, 0, 0, 0, 0]);
        for (let i = 0; i < POOLED_VALUES; i++) {
            expect(Math.abs(w.pooled[row + i])).toBeLessThanOrEqual(1);
        }
    });

    it('puts two foods on opposite sides in the two hit slots, the nearer first', () => {
        const w = senseWorld({ rayCount: 8 });
        const me = addAgent(w, 500, 500, 20);
        addFood(w, 600, 500, 20);
        addFood(w, 350, 500, 20);
        senseAll(w, rebuild(w));
        poolRays(w, me);
        const off = inputOffsets(w.config);
        const food = me * w.layout.inputCount + off.pooled.food;
        expect(w.pooled[food + 1]).toBe(1);
        expect(w.pooled[food]).toBeGreaterThan(0.5);
        expect(w.pooled[food + 3]).toBeGreaterThan(0);
        expect(w.pooled[food + 3]).toBeLessThan(w.pooled[food]);
        expect(w.pooled[food + 4]).toBe(-1);
    });

    it('leaves the raw inputs row alone and copies the body block after the pooled values', () => {
        const w = senseWorld({ rayCount: 4 });
        const me = addAgent(w, 500, 500, 20);
        w.energy[me] = w.config.maxEnergy / 2;
        senseAll(w, rebuild(w));
        const before = Array.from(w.inputs);
        poolRays(w, me);
        expect(Array.from(w.inputs)).toEqual(before);
        const off = inputOffsets(w.config);
        expect(w.pooled[me * w.layout.inputCount + off.bodyStart]).toBeCloseTo(0.5, 6);
    });
    it('keeps opposite food hues attached to their directions with first-ray ties', () => {
        const w = senseWorld({ rayCount: 8 });
        const me = addAgent(w, 500, 500, 20);
        const a = addFood(w, 600, 500, 20);
        const b = addFood(w, 400, 500, 20);
        w.foodHue[a] = -0.75;
        w.foodHue[b] = 0.5;
        senseAll(w, rebuild(w));
        poolRays(w, me);
        const at = me * w.layout.inputCount;
        const hue = at + inputOffsets(w.config).foodHueStart;
        expect(Array.from(w.pooled.subarray(hue, hue + 2))).toEqual([-0.75, 0.5]);
        expect(w.pooled[at + 1]).toBe(1);
        expect(w.pooled[at + 4]).toBe(-1);
    });

    it('clears derived hues when food disappears and distinguishes real hue zero by strength', () => {
        const w = senseWorld({ rayCount: 8 });
        const me = addAgent(w, 500, 500, 20);
        const food = addFood(w, 600, 500, 20);
        w.foodHue[food] = 0;
        senseAll(w, rebuild(w));
        poolRays(w, me);
        const at = me * w.layout.inputCount;
        const hue = at + inputOffsets(w.config).foodHueStart;
        expect(w.pooled[at]).toBeGreaterThan(0);
        expect(w.pooled[hue]).toBe(0);
        w.foodHue[food] = 0.75;
        senseAll(w, rebuild(w));
        expect(w.rayHue[me * 8]).toBe(0.75);
        w.foodAlive[food] = 0;
        w.foodCount--;
        senseAll(w, rebuild(w));
        poolRays(w, me);
        expect(Array.from(w.rayHue.subarray(me * 8, (me + 1) * 8))).toEqual(new Array(8).fill(0));
        expect(w.pooled[at]).toBe(0);
        expect(w.pooled[hue]).toBe(0);
        expect(w.pooled[hue + 1]).toBe(0);
    });
});

describe('rayTables', () => {
    it('spaces the rays evenly round the heading, ray 0 straight ahead', () => {
        const { rayCos, raySin } = rayTables(8);
        expect([rayCos[0], raySin[0]]).toEqual([1, 0]);
        for (let k = 0; k < 8; k++) {
            expect(rayCos[k]).toBe(detCos((2 * 3.141592653589793 * k) / 8));
            expect(raySin[k]).toBe(detSin((2 * 3.141592653589793 * k) / 8));
        }
    });
});
