import { describe, expect, it } from 'vitest';
import { formatKeepRule, keepRule } from '../../js/evo/keep-rule.js';

const N = 32;
const SEEDS = Array.from({ length: N }, (_, i) => i + 1);
const verified = () => 'verified';

/**
 * @param {{ alive?: number[], low?: boolean[], catches?: number[] }} spec per-seed hunters at the end, whether the seed
 *   ends under 80, and the catch rate
 * @returns {Record<string, any>} a report
 */
function report({
    alive = SEEDS.map(() => 5),
    low = SEEDS.map(() => false),
    catches = SEEDS.map((_, i) => 10 + (i % 3)),
} = {}) {
    const metric = (/** @type {number[]} */ values) => ({ values, reasons: values.map(() => null), mean: 0, sd: 0 });
    return {
        seeds: SEEDS,
        metrics: { 'eval.predators_at_end': metric(alive), 'eval.hunter_catches_per_1k': metric(catches) },
        traces: low.map((l) => ({ spec: l ? [10, 5] : [100, 50] })),
    };
}

/** @param {number} killed how many of the first seeds lose their hunters */
const lostAlive = (killed) => SEEDS.map((_, i) => (i < killed ? 0 : 5));
const half = SEEDS.map((_, i) => (i % 4 === 0 ? 0 : 5));
const guardOf = (/** @type {any} */ r, /** @type {string} */ name) =>
    r.guards.find((/** @type {any} */ g) => g.name === name);

describe('keepRule', () => {
    it('does not call an inert pair worse, whatever the raw counts', () => {
        const r = report({ alive: half, low: SEEDS.map((_, i) => i % 5 === 0) });
        const result = keepRule(r, structuredClone(r), { status: verified });
        expect(result.worse).toBe(false);
        expect(guardOf(result, 'alive')).toMatchObject({ verdict: 'no-harm', diff: 0 });
        expect(guardOf(result, 'under80').verdict).toBe('no-harm');
        // 24 of 32 alive is exactly 0.75, the adoption bar's share; the interval is printed beside it.
        expect(result.adoption.alive).toMatchObject({ count: 24, of: 32 });
    });

    it('calls a planted loss of 10 alive seeds in 32 worse, with its interval excluding 0', () => {
        const result = keepRule(report(), report({ alive: lostAlive(10) }), { status: verified });
        const alive = guardOf(result, 'alive');
        expect(alive.verdict).toBe('worse');
        expect(alive.high).toBeLessThan(0);
        expect(alive.diff).toBeCloseTo(-10 / 32, 12);
        expect(result.worse).toBe(true);
    });

    it('lets the interval decide: a swap of 16 seeds and a net loss of 1 are not worse', () => {
        const noisyBefore = report({ alive: SEEDS.map((_, i) => (i % 2 === 0 ? 0 : 5)) });
        const flipped = SEEDS.map((_, i) => (i % 2 === 0 ? 5 : 0));
        // 16 seeds lose hunters, 16 gain them: the counts are identical, the pairs are not, the interval spans 0.
        const swap = keepRule(noisyBefore, report({ alive: flipped }), { status: verified });
        expect(swap.adoption.alive?.count).toBe(16);
        expect(guardOf(swap, 'alive').verdict).toBe('no-harm');
        // 4 seeds lose hunters and 3 gain them elsewhere: a net loss of 1 seed, inside the noise of the interval.
        const mixed = SEEDS.map((_, i) => (i < 4 ? 0 : 5));
        const base = report({ alive: SEEDS.map((_, i) => (i >= 4 && i < 7 ? 0 : 5)) });
        expect(guardOf(keepRule(base, report({ alive: mixed }), { status: verified }), 'alive').verdict).toBe(
            'no-harm',
        );
    });

    it('judges the under-80 share the other way round', () => {
        const worse = keepRule(report(), report({ low: SEEDS.map((_, i) => i < 12) }), { status: verified });
        expect(guardOf(worse, 'under80').verdict).toBe('worse');
        const better = keepRule(report({ low: SEEDS.map((_, i) => i < 12) }), report(), { status: verified });
        expect(guardOf(better, 'under80').verdict).toBe('no-harm');
        expect(better.worse).toBe(false);
    });

    it('prints the smallest loss each guard detects, at least one seed', () => {
        const inert = keepRule(report(), report(), { status: verified });
        expect(guardOf(inert, 'alive')).toMatchObject({ smallestSeeds: 1 });
        const noisy = keepRule(report({ alive: half }), report({ alive: SEEDS.map((_, i) => (i % 3 === 0 ? 0 : 5)) }), {
            status: verified,
        });
        expect(guardOf(noisy, 'alive').smallestSeeds).toBeGreaterThan(1);
    });

    it('checks a verified guard metric, and leaves an unverified one unchecked', () => {
        const drop = report({ catches: SEEDS.map((_, i) => 4 + (i % 3)) });
        const checked = keepRule(report(), drop, { status: verified });
        expect(guardOf(checked, 'eval.hunter_catches_per_1k')).toMatchObject({ verdict: 'worse' });
        expect(checked.worse).toBe(true);
        const skipped = keepRule(report(), drop, { status: () => 'unverified' });
        expect(guardOf(skipped, 'eval.hunter_catches_per_1k')).toMatchObject({
            verdict: 'unchecked',
            note: 'unverified',
        });
        expect(skipped.worse).toBe(false);
    });

    it('reports the adoption bar as counts with intervals, beside the verdict', () => {
        const result = keepRule(
            report({ low: SEEDS.map((_, i) => i < 3) }),
            report({ alive: lostAlive(8), low: SEEDS.map((_, i) => i < 3) }),
        );
        expect(result.adoption.alive).toMatchObject({ count: 24, of: 32 });
        expect(result.adoption.under80After).toMatchObject({ count: 3, of: 32 });
        expect(result.adoption.pass).toBe(true);
        const text = formatKeepRule(result).join('\n');
        expect(text).toMatch(/adoption bar: hunters alive 24\/32 \[/);
        expect(text).toMatch(/guard alive: worse/);
        expect(text).toMatch(/keep rule: WORSE/);
        const failing = keepRule(report(), report({ alive: lostAlive(10), low: SEEDS.map((_, i) => i < 4) }));
        expect(failing.adoption.pass).toBe(false);
    });

    it('leaves a guard unchecked when the report lacks its values, and refuses different seeds', () => {
        const noTraces = { ...report(), traces: undefined };
        expect(guardOf(keepRule(noTraces, noTraces, { status: verified }), 'under80').verdict).toBe('unchecked');
        expect(() => keepRule(report(), { ...report(), seeds: SEEDS.map((s) => s + 1) })).toThrow(/same seeds/);
    });
});
