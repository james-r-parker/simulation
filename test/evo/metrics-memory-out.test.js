import { describe, expect, it } from 'vitest';
import { OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import {
    LIFE_CLASS,
    MEMORY_OUT_DIRECTIONS,
    classifyLife,
    memoryOutMetrics,
    noteMemoryOutDeath,
    outputStats,
    resetMemoryOutSlot,
    sampleMemoryOut,
} from '../../js/evo/metrics-memory-out.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

/**
 * Samples one slot's two memory outputs through a series, one value per 4 ticks.
 * @param {{world: any, observer: any}} env the world and observer
 * @param {number} slot the slot
 * @param {(t: number) => [number, number]} series the outputs at sample t
 * @param {number} samples how many samples
 * @returns {void}
 */
function run({ world, observer }, slot, series, samples) {
    for (let t = 0; t < samples; t++) {
        world.tick = 4 * (t + 1);
        const [a, b] = series(t);
        world.outputs[slot * world.layout.outputCount + OUTPUT_INDEX.MEMORY_A] = a;
        world.outputs[slot * world.layout.outputCount + OUTPUT_INDEX.MEMORY_B] = b;
        sampleMemoryOut(observer.memoryOut, world);
    }
}

/**
 * @param {number[]} x a series
 * @returns {{sd: number, r1: number}} the naive standard deviation and lag-1 Pearson correlation
 */
function naive(x) {
    const mean = (/** @type {number[]} */ v) => v.reduce((a, b) => a + b, 0) / v.length;
    const m = mean(x);
    const sd = Math.sqrt(mean(x.map((v) => (v - m) ** 2)));
    const a = x.slice(0, -1);
    const b = x.slice(1);
    const ma = mean(a);
    const mb = mean(b);
    const cov = mean(a.map((v, i) => (v - ma) * (b[i] - mb)));
    const va = mean(a.map((v) => (v - ma) ** 2));
    const vb = mean(b.map((v) => (v - mb) ** 2));
    return { sd, r1: cov / Math.sqrt(va * vb) };
}

describe('outputStats', () => {
    it('matches a naive standard deviation and lag-1 autocorrelation', () => {
        const env = observed();
        const slot = addBlob(env.world);
        const values = Array.from({ length: 50 }, (_, t) => Math.fround(Math.sin(t / 5) * 0.4 + ((t * 7) % 5) / 20));
        run(env, slot, (t) => [values[t], 0], 50);
        const got = outputStats(env.observer.memoryOut, slot * 2, 50);
        const want = naive(values);
        expect(got.sd).toBeCloseTo(want.sd, 9);
        expect(got.r1).toBeCloseTo(want.r1, 9);
    });
});

describe('classifyLife', () => {
    /**
     * @param {(t: number) => [number, number]} series the outputs
     * @returns {number} the class of a 200-sample life
     */
    function classOf(series) {
        const env = observed();
        const slot = addBlob(env.world);
        run(env, slot, series, 200);
        return classifyLife(env.observer.memoryOut, slot);
    }

    it('calls constant outputs flat', () => {
        expect(classOf(() => [0.3, -0.2])).toBe(LIFE_CLASS.FLAT);
        expect(classOf((t) => [0.3 + 0.01 * Math.sin(t), 0])).toBe(LIFE_CLASS.FLAT);
    });

    it('calls a slow drift a signal and one signalling output enough', () => {
        expect(classOf((t) => [Math.sin(t / 20), 0])).toBe(LIFE_CLASS.SIGNAL);
        expect(classOf((t) => [(t * 37) % 11 < 5 ? 1 : -1, Math.sin(t / 30)])).toBe(LIFE_CLASS.SIGNAL);
    });

    it('calls a varying output with no persistence noisy', () => {
        expect(classOf((t) => [t % 2 === 0 ? 1 : -1, 0])).toBe(LIFE_CLASS.NOISY);
    });
});

describe('the memory-output metrics', () => {
    /**
     * @param {number} lives lives to end, each of 100 samples of a constant output
     * @param {number} age the age at death of each
     * @returns {any} the observer
     */
    function withLives(lives, age) {
        const env = observed({ maxAgents: 8 });
        const slot = addBlob(env.world);
        for (let i = 0; i < lives; i++) {
            resetMemoryOutSlot(env.observer.memoryOut, slot);
            run(env, slot, () => (i % 2 === 0 ? [0.2, 0.2] : [0, 0]), 10);
            noteMemoryOutDeath(env.observer.memoryOut, slot, age);
        }
        return env.observer;
    }

    it('counts only lives of at least 600 ticks and reports shares that sum to 1', () => {
        const observer = withLives(100, 600);
        const m = memoryOutMetrics(observer);
        const total = Object.values(m).reduce((s, r) => s + (r.value ?? 0), 0);
        expect(total).toBeCloseTo(1, 12);
        expect(m['eval.memory_out_flat_share'].value).toBe(1);
        expect(memoryOutMetrics(withLives(100, 599))['eval.memory_out_flat_share'].value).toBeNull();
    });

    it('is null below 100 lives', () => {
        expect(memoryOutMetrics(withLives(99, 900))['eval.memory_out_flat_share'].reason).toMatch(/100 lives/);
    });

    it('resets a slot on reuse, so a new life starts from nothing', () => {
        const env = observed();
        const slot = addBlob(env.world);
        run(env, slot, () => [1, 1], 5);
        resetMemoryOutSlot(env.observer.memoryOut, slot);
        expect(env.observer.memoryOut.count[slot]).toBe(0);
        expect(env.observer.memoryOut.sum[slot * 2]).toBe(0);
    });

    it('samples only on ticks that divide by 4 and only alive agents', () => {
        const env = observed();
        const slot = addBlob(env.world);
        env.world.tick = 5;
        sampleMemoryOut(env.observer.memoryOut, env.world);
        expect(env.observer.memoryOut.count[slot]).toBe(0);
        env.world.tick = 8;
        sampleMemoryOut(env.observer.memoryOut, env.world);
        expect(env.observer.memoryOut.count[slot]).toBe(1);
        expect(env.observer.memoryOut.count[slot + 1]).toBe(0);
    });

    it('is a watch metric', () => {
        expect(Object.values(MEMORY_OUT_DIRECTIONS).every((d) => d === 'watch')).toBe(true);
    });
});
