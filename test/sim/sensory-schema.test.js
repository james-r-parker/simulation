// Pins the brain's sensory schema: the pooled channels, the body block offsets and the input count. A change to any
// number here changes what every saved genome means, so it must come with a new `BRAIN_LAYOUT_NAME`.
import { describe, expect, it } from 'vitest';
import {
    BODY_INPUT,
    BRAIN_LAYOUT_NAME,
    EXTRA_INPUTS,
    HIT_STRIDE,
    POOLED_CHANNELS,
    POOLED_HITS,
    POOLED_STRIDE,
    POOLED_VALUES,
    RAY_CHANNELS,
    brainLayout,
    inputOffsets,
} from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { poolRays } from '../../js/sim/ray-pool.js';
import { senseAll } from '../../js/sim/sensors.js';
import { addAgent, addCloud, addFood, rebuild, senseWorld } from './helpers/sense-world.js';

/**
 * @param {ReturnType<typeof senseWorld>} w the world
 * @param {number} slot the slot
 * @returns {number[]} the slot's 83 brain inputs
 */
function pooledRow(w, slot) {
    const at = slot * w.layout.inputCount;
    return Array.from(w.pooled.subarray(at, at + w.layout.inputCount));
}

describe('the sensory schema', () => {
    it('names the layout and counts 83 brain inputs: 50 pooled values then 33 body inputs', () => {
        expect(BRAIN_LAYOUT_NAME).toBe('pooled-v3');
        expect([POOLED_HITS, HIT_STRIDE, POOLED_STRIDE, POOLED_VALUES, EXTRA_INPUTS]).toEqual([2, 3, 6, 50, 33]);
        expect(brainLayout(createConfig()).inputCount).toBe(83);
        expect(brainLayout(createConfig({ rayCount: 8 })).inputCount).toBe(83);
    });

    it('orders the pooled channels as ray channels 1 to 8, each at channel x 6 (strength, cos, sin, then the second hit)', () => {
        expect(RAY_CHANNELS).toBe(9);
        expect(POOLED_CHANNELS).toEqual(['food', 'threat', 'prey', 'other', 'kin', 'wall', 'obstacle', 'smoke']);
        const { pooled } = inputOffsets(createConfig());
        expect(pooled).toEqual({ food: 0, threat: 6, prey: 12, other: 18, kin: 24, wall: 30, obstacle: 36, smoke: 42 });
    });

    it('puts the body block at 50 and the scent, call, sex and memory inputs at fixed offsets', () => {
        const off = inputOffsets(createConfig());
        expect(off).toMatchObject({
            foodHueStart: 48,
            bodyStart: 50,
            scentStart: 67,
            huntScent: 71,
            heardAlarm: 74,
            heardHunt: 77,
            sex: 80,
            memoryA: 81,
            memoryB: 82,
            rawBodyStart: 16 * RAY_CHANNELS,
        });
        expect(BODY_INPUT).toMatchObject({ SCENT: 17, HUNT_SCENT: 21, HEARD_ALARM: 24, HEARD_HUNT: 27, SEX: 30 });
        expect(off.memoryB).toBe(brainLayout(createConfig()).inputCount - 1);
    });

    it('reads all zeros in the pooled block when nothing is detected', () => {
        const w = senseWorld({ rayCount: 8 });
        const me = addAgent(w, 500, 500, 20);
        senseAll(w, rebuild(w));
        poolRays(w, me);
        expect(pooledRow(w, me).slice(0, POOLED_VALUES)).toEqual(new Array(POOLED_VALUES).fill(0));
    });

    it('fills the food, obstacle and smoke channels at their indices, with every value in [-1, 1]', () => {
        const w = senseWorld({ rayCount: 16 });
        const me = addAgent(w, 500, 500, 20);
        addFood(w, 600, 500, 20);
        w.obsX[0] = 500;
        w.obsY[0] = 600;
        w.obsRadius[0] = 30;
        addCloud(w, 500, 400);
        senseAll(w, rebuild(w));
        poolRays(w, me);
        const row = pooledRow(w, me);
        const { pooled } = inputOffsets(w.config);
        for (const name of ['food', 'obstacle', 'smoke']) {
            expect(row[pooled[name]], `${name} strength`).toBeGreaterThan(0);
        }
        expect(row[pooled.food + 1]).toBe(1); // food dead ahead: cos 1, sin 0
        expect(row[pooled.food + 2]).toBe(0);
        expect(row[pooled.threat]).toBe(0);
        expect(row[pooled.kin]).toBe(0);
        for (const v of row) {
            expect(Number.isFinite(v)).toBe(true);
            expect(Math.abs(v)).toBeLessThanOrEqual(1);
        }
        // strengths are proximities, never negative
        for (let c = 0; c < POOLED_CHANNELS.length; c++) {
            expect(row[c * POOLED_STRIDE]).toBeGreaterThanOrEqual(0);
            expect(row[c * POOLED_STRIDE + HIT_STRIDE]).toBeGreaterThanOrEqual(0);
        }
    });
});
