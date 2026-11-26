import { describe, expect, it } from 'vitest';
import { studentisedInterval } from '../../js/evo/bootstrap-t.js';
import { bootstrapInterval } from '../../js/evo/compare.js';
import { createRng, fork } from '../../js/sim/rng.js';

const draw = () => ({ rng: fork(createRng(3), 'bt'), resamples: 2000, level: 0.95 });
const SAMPLE = [1.2, 0.8, 1.5, 0.9, 1.1, 1.4, 0.7, 1.0];

describe('studentisedInterval', () => {
    it('brackets the mean, replays from the seed and widens with the level', () => {
        const a = studentisedInterval(SAMPLE, draw());
        expect(a.low).toBeLessThan(1.075);
        expect(a.high).toBeGreaterThan(1.075);
        expect(studentisedInterval(SAMPLE, draw())).toEqual(a);
        const narrow = studentisedInterval(SAMPLE, { ...draw(), level: 0.5 });
        expect(narrow.high - narrow.low).toBeLessThan(a.high - a.low);
    });

    it('is wider than the normal interval of a small sample, which is why it covers', () => {
        const mean = 1.075;
        const sd = Math.sqrt(SAMPLE.reduce((s, v) => s + (v - mean) ** 2, 0) / 7);
        const { low, high } = studentisedInterval(SAMPLE, draw());
        expect(high - low).toBeGreaterThan(2 * 1.96 * (sd / Math.sqrt(8)) * 0.95);
    });

    it('gives a point interval when every resample is one repeated value', () => {
        expect(studentisedInterval([5, 5], draw())).toEqual({ low: 5, high: 5 });
    });
});

describe('bootstrapInterval', () => {
    it('is the studentised interval at every size, from the bootstrap stream', () => {
        for (const size of [16, 32, 64]) {
            const values = Array.from({ length: size }, (_, i) => Math.sin(i * 1.7));
            const rng = fork(createRng(1), 'bootstrap');
            expect(bootstrapInterval(values)).toEqual(
                studentisedInterval(values, { rng, resamples: 10000, level: 0.95 }),
            );
        }
    });
});
