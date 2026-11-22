import { describe, expect, it } from 'vitest';
import { castRays } from '../../js/sim/ray-march.js';
import { RAY_CHANNELS, inputOffsets } from '../../js/sim/brain-layout.js';
import { poolRays } from '../../js/sim/ray-pool.js';
import { senseAll } from '../../js/sim/sensors.js';
import { addAgent, addCloud, addFood, rebuild, senseWorld } from './helpers/sense-world.js';

// smoke-decoy.md: a cloud younger than `smokeDecoyTicks` reads on the prey channel (as a body) beside the smoke channel.
const CH = { prox: 0, food: 1, prey: 3, smoke: 8 };
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
 * @param {Record<string, number>} overrides config overrides
 * @returns {{w: ReturnType<typeof senseWorld>, me: number, cloud: number}} a caster at 200 with a cloud ahead of it
 */
function scene(overrides = {}) {
    const w = senseWorld({ smokeTicks: 100, smokeDecoyTicks: 60, ...overrides });
    const me = addAgent(w, 200, 500, 20);
    const cloud = addCloud(w, 400, 500);
    return { w, me, cloud };
}

describe('the smoke decoy', () => {
    it('reads a fresh cloud on the prey channel at the proximity of the smoke hit, beside the smoke channel', () => {
        const { w, me } = scene();
        castRays(w, rebuild(w), me);
        const r = rayValues(w, me, 0);
        const proximity = 1 - (400 - w.config.smokeRadius - 200) / VISION;
        expect(r[CH.prox]).toBeCloseTo(proximity, 6);
        expect(r[CH.prey]).toBeCloseTo(proximity, 6);
        expect(r[CH.smoke]).toBe(1);
    });

    it('reads as a body for smokeDecoyTicks ticks of age and as smoke alone after', () => {
        const { w, me, cloud } = scene();
        w.cloudTtl[cloud] = 100 - 59; // age 59
        castRays(w, rebuild(w), me);
        expect(rayValues(w, me, 0)[CH.prey]).toBeGreaterThan(0);
        w.cloudTtl[cloud] = 100 - 60; // age 60
        castRays(w, rebuild(w), me);
        expect(rayValues(w, me, 0)[CH.prey]).toBe(0);
        expect(rayValues(w, me, 0)[CH.smoke]).toBe(1);
    });

    it('is off at smokeDecoyTicks 0', () => {
        const { w, me } = scene({ smokeDecoyTicks: 0 });
        castRays(w, rebuild(w), me);
        expect(rayValues(w, me, 0)[CH.prey]).toBe(0);
    });

    it('reads at proximity 1 on every ray of a caster inside the cloud', () => {
        const w = senseWorld({ smokeTicks: 100, smokeDecoyTicks: 60 });
        const me = addAgent(w, 400, 500, 20);
        addCloud(w, 420, 500);
        castRays(w, rebuild(w), me);
        for (let k = 0; k < 4; k++) {
            expect(rayValues(w, me, k)[CH.prey]).toBe(1);
        }
    });

    it('hides food behind the cloud, as plain smoke does', () => {
        const { w, me } = scene();
        addFood(w, 500, 500, 20);
        castRays(w, rebuild(w), me);
        expect(rayValues(w, me, 0)[CH.food]).toBe(0);
    });

    it('lets a nearer body win the ray: the cloud behind it is not read', () => {
        const { w, me } = scene();
        addAgent(w, 280, 500, 20);
        castRays(w, rebuild(w), me);
        const r = rayValues(w, me, 0);
        expect(r[CH.smoke]).toBe(0);
        expect(r[CH.prox]).toBeGreaterThan(0);
    });

    it('leaves a ray that misses the cloud unchanged', () => {
        const { w, me } = scene();
        castRays(w, rebuild(w), me);
        expect(rayValues(w, me, 1)).toEqual(new Array(RAY_CHANNELS).fill(0));
    });

    it('is pooled as a prey and not as smoke, since a pooled ray takes its first set channel; plain smoke pools as smoke', () => {
        const pooledStrengths = (/** @type {number} */ decoy) => {
            const { w, me } = scene({ smokeDecoyTicks: decoy });
            senseAll(w, rebuild(w));
            poolRays(w, me);
            const { pooled } = inputOffsets(w.config);
            const row = w.pooled.subarray(me * w.layout.inputCount, (me + 1) * w.layout.inputCount);
            return { prey: row[pooled.prey], smoke: row[pooled.smoke] };
        };
        const fresh = pooledStrengths(60);
        expect(fresh.prey).toBeGreaterThan(0);
        expect(fresh.smoke).toBe(0);
        const plain = pooledStrengths(0);
        expect(plain.prey).toBe(0);
        expect(plain.smoke).toBeGreaterThan(0);
    });
});
