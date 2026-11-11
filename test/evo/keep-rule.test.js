import { describe, expect, it } from 'vitest';
import { formatKeepRule, keepRule } from '../../js/evo/keep-rule.js';

const N = 32;
const SEEDS = Array.from({ length: N }, (_, i) => i + 1);
const verified = () => 'verified';
const seedsFor = () => 16;

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
        const result = keepRule(r, structuredClone(r), { status: verified, seedsFor });
        expect(result.worse).toBe(false);
        expect(guardOf(result, 'alive')).toMatchObject({ verdict: 'no-harm', diff: 0 });
        expect(guardOf(result, 'under80').verdict).toBe('no-harm');
        // 24 of 32 alive is exactly 0.75, the adoption bar's share; the interval is printed beside it.
        expect(result.adoption.alive).toMatchObject({ count: 24, of: 32 });
    });

    it('judges alive by the exact test on the discordant seeds: 2 vs 0 is not worse, 6 vs 0 and 10 vs 0 are', () => {
        const alive = (/** @type {number} */ k) =>
            guardOf(keepRule(report(), report({ alive: lostAlive(k) }), { status: verified, seedsFor }), 'alive');
        expect(alive(2)).toMatchObject({ verdict: 'no-harm', harmed: 2, recovered: 0, p: 0.5 });
        expect(alive(5).verdict).toBe('no-harm');
        expect(alive(6)).toMatchObject({ verdict: 'worse', harmed: 6, recovered: 0 });
        const ten = keepRule(report(), report({ alive: lostAlive(10) }), { status: verified, seedsFor });
        expect(guardOf(ten, 'alive')).toMatchObject({ verdict: 'worse', harmed: 10, low: null });
        expect(guardOf(ten, 'alive').diff).toBeCloseTo(-10 / 32, 12);
        expect(ten.worse).toBe(true);
    });

    it('lets the discordant counts, not the net count, decide: 10 vs 8 is not worse, a 16-seed swap is not worse', () => {
        const before = report({ alive: SEEDS.map((_, i) => (i >= 10 && i < 18 ? 0 : 5)) });
        const after = report({ alive: SEEDS.map((_, i) => (i < 10 ? 0 : 5)) });
        const tenEight = guardOf(keepRule(before, after, { status: verified, seedsFor }), 'alive');
        expect(tenEight).toMatchObject({ harmed: 10, recovered: 8, verdict: 'no-harm' });
        const noisyBefore = report({ alive: SEEDS.map((_, i) => (i % 2 === 0 ? 0 : 5)) });
        const flipped = report({ alive: SEEDS.map((_, i) => (i % 2 === 0 ? 5 : 0)) });
        const swap = keepRule(noisyBefore, flipped, { status: verified, seedsFor });
        expect(swap.adoption.alive?.count).toBe(16);
        expect(guardOf(swap, 'alive')).toMatchObject({ harmed: 16, recovered: 16, verdict: 'no-harm' });
    });

    it('judges the under-80 share the other way round', () => {
        const worse = keepRule(report(), report({ low: SEEDS.map((_, i) => i < 12) }), { status: verified, seedsFor });
        expect(guardOf(worse, 'under80')).toMatchObject({ verdict: 'worse', harmed: 12, recovered: 0 });
        const few = keepRule(report(), report({ low: SEEDS.map((_, i) => i < 3) }), { status: verified, seedsFor });
        expect(guardOf(few, 'under80').verdict).toBe('no-harm');
        const better = keepRule(report({ low: SEEDS.map((_, i) => i < 12) }), report(), { status: verified, seedsFor });
        expect(guardOf(better, 'under80').verdict).toBe('no-harm');
        expect(better.worse).toBe(false);
    });

    it('prints the smallest loss each guard detects, given the seeds that recovered', () => {
        const inert = keepRule(report(), report(), { status: verified, seedsFor });
        expect(guardOf(inert, 'alive')).toMatchObject({ smallestSeeds: 6, p: 1 });
        const back = report({ alive: SEEDS.map((_, i) => (i < 1 ? 0 : 5)) });
        const one = keepRule(report({ alive: SEEDS.map((_, i) => (i === 31 ? 0 : 5)) }), back, {
            status: verified,
            seedsFor,
        });
        expect(guardOf(one, 'alive').smallestSeeds).toBe(8);
        expect(formatKeepRule(inert).join('\n')).toMatch(
            /guard alive: no-harm, 0 seeds harmed vs 0 recovered.*smallest loss detected 6 seeds/,
        );
    });

    it('checks a verified guard metric, and leaves an unverified one unchecked', () => {
        const drop = report({ catches: SEEDS.map((_, i) => 4 + (i % 3)) });
        const checked = keepRule(report(), drop, { status: verified, seedsFor });
        expect(guardOf(checked, 'eval.hunter_catches_per_1k')).toMatchObject({ verdict: 'worse' });
        expect(checked.worse).toBe(true);
        const skipped = keepRule(report(), drop, { status: () => 'unverified', seedsFor });
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

    it('leaves a metric guard unchecked below its seed minimum', () => {
        const drop = report({ catches: SEEDS.map((_, i) => 4 + (i % 3)) });
        const short = keepRule(report(), drop, { status: verified, seedsFor: () => 64 });
        expect(guardOf(short, 'eval.hunter_catches_per_1k')).toMatchObject({
            verdict: 'unchecked',
            note: 'needs 64 seeds',
        });
    });

    it('leaves a guard unchecked when the report lacks its values, and refuses different seeds', () => {
        const noTraces = { ...report(), traces: undefined };
        expect(guardOf(keepRule(noTraces, noTraces, { status: verified, seedsFor }), 'under80').verdict).toBe(
            'unchecked',
        );
        expect(() => keepRule(report(), { ...report(), seeds: SEEDS.map((s) => s + 1) })).toThrow(/same seeds/);
    });
});
