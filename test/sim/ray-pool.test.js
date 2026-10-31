import { describe, expect, it } from 'vitest';
import {
    POOLED_CHANNELS,
    POOLED_STRIDE,
    POOLED_VALUES,
    RAY_CHANNELS,
    inputOffsets,
} from '../../js/sim/brain-layout.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';
import { poolRays } from '../../js/sim/ray-pool.js';
import { senseAll } from '../../js/sim/sensors.js';
import { addAgent, addFood, rebuild, senseWorld } from './helpers/sense-world.js';

/**
 * The naive per-channel reference: scan every ray for the channel, keep the largest proximity (the first ray on a tie).
 * @param {ReturnType<typeof senseWorld>} w the world
 * @param {number} slot the slot
 * @returns {number[]} the 50 pooled values then the body block
 */
function reference(w, slot) {
    const { rayCount } = w.config;
    const raw = slot * w.layout.rawInputCount;
    const proximity = (/** @type {number} */ k) => w.inputs[raw + k * RAY_CHANNELS];
    const out = [];
    for (let c = 1; c <= POOLED_CHANNELS.length; c++) {
        const hits = [];
        for (let k = 0; k < rayCount; k++) {
            if (w.inputs[raw + k * RAY_CHANNELS + c] > 0 && proximity(k) > 0) {
                hits.push(k);
            }
        }
        hits.sort((a, b) => proximity(b) - proximity(a) || a - b);
        for (let i = 0; i < 2; i++) {
            const k = hits[i];
            out.push(...(k === undefined ? [0, 0, 0] : [proximity(k), w.rayCos[k], w.raySin[k]]));
        }
    }
    out.push(0, 0);
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
            w.inputs[row + k * RAY_CHANNELS + 1 + Math.floor(nextFloat(rng) * 8)] = prox;
        }
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
});
