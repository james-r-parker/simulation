import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import {
    blocksMating,
    gainTemperature,
    passiveMultiplier,
    stepTemperature,
    temperatureInputs,
    thrustEfficiency,
} from '../../js/sim/temperature.js';

// The legacy rates, pinned so these tests check the formulas rather than the tuned defaults.
const LEGACY_RATES = { temperatureGainMove: 0.025, temperatureLossPassive: 0.015 };
const config = createConfig(LEGACY_RATES);

/** The per-season loss multiplier at the defaults: spring, summer, autumn, winter. */
const LOSS = [1.15, 0.55, 0.85, 1.45];

/**
 * A stand-in for the world: just the arrays `stepTemperature` and `gainTemperature` read.
 * @param {number} t starting temperature
 * @param {number} speed speed of the agent, along x
 * @param {number} season season index
 * @returns {any}
 */
function fakeWorld(t, speed, season) {
    return {
        config,
        temperature: Float32Array.of(t),
        vx: Float32Array.of(speed),
        vy: Float32Array.of(0),
        season: Uint32Array.of(season, 0),
    };
}

describe('stepTemperature', () => {
    it.each([0, 1, 2, 3])('cools a sitter by 0.015 x L every tick in season %i', (season) => {
        const world = fakeWorld(50, 0, season);
        for (let tick = 1; tick <= 4; tick++) {
            stepTemperature(world, 0);
            expect(world.temperature[0]).toBeCloseTo(50 - 0.015 * LOSS[season] * tick, 4);
        }
    });

    it.each([0, 1, 2, 3])('warms a full-speed agent by 0.025 - 0.015 x L per tick in season %i', (season) => {
        const world = fakeWorld(50, 8, season);
        stepTemperature(world, 0);
        stepTemperature(world, 0);
        expect(world.temperature[0]).toBeCloseTo(50 + 2 * (0.025 - 0.015 * LOSS[season]), 4);
    });

    it('counts speed as a fraction of maxVelocity and caps the fraction at 1', () => {
        const half = fakeWorld(50, 4, 1);
        stepTemperature(half, 0);
        expect(half.temperature[0]).toBeCloseTo(50 + 0.0125 - 0.015 * 0.55, 5);
        const fast = fakeWorld(50, 40, 1);
        stepTemperature(fast, 0);
        expect(fast.temperature[0]).toBeCloseTo(50 + 0.025 - 0.015 * 0.55, 5);
    });

    it('uses the speed from both velocity components', () => {
        const world = fakeWorld(50, 3, 1);
        world.vy[0] = 4;
        stepTemperature(world, 0);
        expect(world.temperature[0]).toBeCloseTo(50 + (5 / 8) * 0.025 - 0.015 * 0.55, 5);
    });

    it('clamps to 0 and to temperatureMax', () => {
        const cold = fakeWorld(0.01, 0, 3);
        stepTemperature(cold, 0);
        expect(cold.temperature[0]).toBe(0);
        const hot = fakeWorld(99.999, 8, 0);
        hot.config = createConfig({ ...LEGACY_RATES, temperatureLossPassive: 0 });
        stepTemperature(hot, 0);
        expect(hot.temperature[0]).toBe(100);
    });

    it('does not warm a slot with a season loss multiplier below zero', () => {
        const seasons = structuredClone(config.seasons);
        seasons[0].temperatureModifier = 60;
        const world = fakeWorld(50, 0, 0);
        world.config = createConfig({ ...LEGACY_RATES, seasons });
        stepTemperature(world, 0);
        expect(world.temperature[0]).toBe(50);
    });
});

describe('gainTemperature', () => {
    it('adds the amount and caps at temperatureMax', () => {
        const world = fakeWorld(50, 0, 0);
        gainTemperature(world, 0, 2);
        expect(world.temperature[0]).toBe(52);
        gainTemperature(world, 0, 200);
        expect(world.temperature[0]).toBe(100);
    });
});

describe('passiveMultiplier', () => {
    it('is 1 across the optimal band', () => {
        for (const t of [40, 45, 52.5, 65]) {
            expect(passiveMultiplier(config, t)).toBe(1);
        }
    });

    it('reaches the factor at 0 and at temperatureMax', () => {
        expect(passiveMultiplier(config, 0)).toBe(4);
        expect(passiveMultiplier(config, 100)).toBe(4);
    });

    it('is linear between the band and the ends', () => {
        expect(passiveMultiplier(config, 20)).toBeCloseTo(2.5, 12);
        expect(passiveMultiplier(config, 30)).toBeCloseTo(1.75, 12);
        expect(passiveMultiplier(config, 82.5)).toBeCloseTo(2.5, 12);
        expect(passiveMultiplier(config, 70)).toBeCloseTo(1 + (5 / 35) * 3, 12);
    });

    it('is 1 everywhere when the factor is 1', () => {
        const flat = createConfig({ ...LEGACY_RATES, temperaturePassiveLossFactor: 1 });
        for (const t of [0, 10, 50, 90, 100]) {
            expect(passiveMultiplier(flat, t)).toBe(1);
        }
    });
});

describe('thrustEfficiency', () => {
    it.each([
        [0, 0.3],
        [29.99, 0.3],
        [30, 0.7],
        [39.99, 0.7],
        [40, 1],
        [52, 1],
        [65, 1],
        [65.01, 0.8],
        [84.99, 0.8],
        [85, 0.4],
        [100, 0.4],
    ])('is the band value at %f', (t, expected) => {
        expect(thrustEfficiency(config, t)).toBe(expected);
    });
});

describe('blocksMating', () => {
    it('blocks past either stress threshold and not at them', () => {
        expect(blocksMating(config, 29.99)).toBe(true);
        expect(blocksMating(config, 30)).toBe(false);
        expect(blocksMating(config, 50)).toBe(false);
        expect(blocksMating(config, 85)).toBe(false);
        expect(blocksMating(config, 85.01)).toBe(true);
        expect(blocksMating(config, 0)).toBe(true);
        expect(blocksMating(config, 100)).toBe(true);
    });
});

/**
 * @param {number} t the temperature
 * @returns {number[]} the four inputs
 */
function inputsAt(t) {
    const out = new Float32Array(6);
    temperatureInputs(config, t, out, 1);
    expect(out[0]).toBe(0);
    expect(out[5]).toBe(0);
    return Array.from(out.subarray(1, 5));
}

describe('temperatureInputs', () => {
    it('writes the four inputs at 0, each threshold and the maximum', () => {
        expect(inputsAt(0)).toEqual([0, 1, 1, 0]);
        expect(inputsAt(30)).toEqual([0.3, 0.45, 1, 0].map(Math.fround));
        expect(inputsAt(40)).toEqual([0.4, 0.25, 0, 0].map(Math.fround));
        expect(inputsAt(52.5)).toEqual([0.525, 0, 0, 0].map(Math.fround));
        expect(inputsAt(65)).toEqual([0.65, 0.25, 0, 0].map(Math.fround));
        expect(inputsAt(70)).toEqual([0.7, 0.35, 0, 0].map(Math.fround));
        expect(inputsAt(85)).toEqual([0.85, 0.65, 0, 1].map(Math.fround));
        expect(inputsAt(100)).toEqual([1, 0.95, 0, 1].map(Math.fround));
    });

    it('ramps the stress inputs linearly between the thresholds', () => {
        expect(inputsAt(35)[2]).toBeCloseTo(0.5, 6);
        expect(inputsAt(77.5)[3]).toBeCloseTo(0.5, 6);
    });

    it('is 1 above the heat threshold when the moderate and stress thresholds coincide', () => {
        const same = createConfig({ ...LEGACY_RATES, temperatureHeatModerate: 85 });
        const out = new Float32Array(4);
        temperatureInputs(same, 85.5, out, 0);
        expect(out[3]).toBe(1);
        temperatureInputs(same, 85, out, 0);
        expect(out[3]).toBe(0);
    });
});

/**
 * Looks the rules up the long way: by scanning ordered bands.
 * @param {number} t the temperature
 * @returns {{passive: number, thrust: number, blocks: boolean, inputs: number[]}}
 */
function reference(t) {
    const bands = [
        [30, 0.3],
        [40, 0.7],
        [65.0000001, 1],
        [85, 0.8],
        [Infinity, 0.4],
    ];
    const thrust = /** @type {number[]} */ (bands.find(([upper]) => t < upper))[1];
    const lowSlope = (40 - t) / 40;
    const highSlope = (t - 65) / 35;
    const passive = t < 40 ? 1 + lowSlope * 3 : t > 65 ? 1 + highSlope * 3 : 1;
    const cold = t < 30 ? 1 : t < 40 ? (40 - t) / 10 : 0;
    const heat = t > 85 ? 1 : t > 70 ? (t - 70) / 15 : 0;
    return {
        passive,
        thrust,
        blocks: t < 30 || t > 85,
        inputs: [t / 100, Math.min(Math.abs(t - 52.5) / 50, 1), cold, heat],
    };
}

/**
 * A small deterministic generator for the reference comparison (mulberry32).
 * @param {number} seed the seed
 * @returns {() => number} a function returning floats in [0, 1)
 */
function lcg(seed) {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

describe('against a naive reference', () => {
    it('agrees over 200 seeded random temperatures', () => {
        const next = lcg(20260716);
        const out = new Float32Array(4);
        for (let i = 0; i < 200; i++) {
            const t = next() * 100;
            const ref = reference(t);
            expect(passiveMultiplier(config, t), `passive at ${t}`).toBeCloseTo(ref.passive, 10);
            expect(thrustEfficiency(config, t), `thrust at ${t}`).toBe(ref.thrust);
            expect(blocksMating(config, t), `blocks at ${t}`).toBe(ref.blocks);
            temperatureInputs(config, t, out, 0);
            ref.inputs.forEach((value, k) => expect(out[k], `input ${k} at ${t}`).toBeCloseTo(value, 5));
        }
    });
});
