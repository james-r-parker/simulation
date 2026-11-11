import { describe, expect, it } from 'vitest';
import { formatKeepRule, HELD_POPULATION, heldFlags, keepRule } from '../../js/evo/keep-rule.js';

const N = 32;
const SEEDS = Array.from({ length: N }, (_, i) => i + 1);
const verified = () => 'verified';
const seedsFor = () => 16;

/**
 * @param {{ alive?: number[], low?: boolean[], catches?: number[], held?: boolean[] }} spec per-seed hunters at the
 *   end, whether the seed ends under 80, the catch rate, and (when given) whether the trace `pop` holds at 100 or more
 *   after burn-in
 * @returns {Record<string, any>} a report
 */
function report({
    alive = SEEDS.map(() => 5),
    low = SEEDS.map(() => false),
    catches = SEEDS.map((_, i) => 10 + (i % 3)),
    held = undefined,
} = {}) {
    const metric = (/** @type {number[]} */ values) => ({ values, reasons: values.map(() => null), mean: 0, sd: 0 });
    return {
        seeds: SEEDS,
        metrics: { 'eval.predators_at_end': metric(alive), 'eval.hunter_catches_per_1k': metric(catches) },
        traces: low.map((l, i) => ({ spec: l ? [10, 5] : [100, 50], ...(held ? popTrace(held[i]) : {}) })),
    };
}

/**
 * @param {boolean} holds whether the population stays at 100 or more after burn-in
 * @returns {{ interval: number, pop: number[] }} a trace of 20 samples: a dip to 5 at tick 3000, before burn-in, which a
 *   seed that holds ignores, and a dip to 99 at tick 15000 for a seed that does not
 */
function popTrace(holds) {
    const pop = Array.from({ length: 20 }, () => 300);
    pop[2] = 5;
    pop[14] = holds ? 100 : 99;
    return { interval: 1000, pop };
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

describe('keepRule metric guards', () => {
    const metricReport = (/** @type {string} */ name, /** @type {(number | null)[]} */ values) => {
        const r = report();
        r.metrics[name] = { values, reasons: values.map(() => null), mean: 0, sd: 0 };
        return r;
    };
    const opts = (/** @type {string} */ name) => ({ guards: [name], status: verified, seedsFor });

    it('scores a lower-is-better metric: a rise is worse, a fall is not', () => {
        const name = 'bench.step_ms@500';
        const low = metricReport(
            name,
            SEEDS.map((_, i) => 1 + (i % 3)),
        );
        const high = metricReport(
            name,
            SEEDS.map((_, i) => 4 + (i % 3)),
        );
        expect(guardOf(keepRule(low, high, opts(name)), name).verdict).toBe('worse');
        expect(guardOf(keepRule(high, low, opts(name)), name).verdict).toBe('no-harm');
        expect(guardOf(keepRule(low, high, opts(name)), name).smallest).toBe(0);
    });

    it('leaves a metric guard unchecked with a null seed, a missing metric or no direction', () => {
        const name = 'eval.hunter_catches_per_1k';
        const nulled = metricReport(
            name,
            SEEDS.map((_, i) => (i === 0 ? null : 5)),
        );
        expect(guardOf(keepRule(nulled, report(), opts(name)), name)).toMatchObject({
            verdict: 'unchecked',
            note: 'null in a seed',
        });
        expect(guardOf(keepRule(report(), report(), opts('eval.nope')), 'eval.nope')).toMatchObject({
            note: 'the report lacks the metric',
        });
        const watch = 'eval.population_mean';
        const w = metricReport(
            watch,
            SEEDS.map(() => 100),
        );
        expect(guardOf(keepRule(w, w, opts(watch)), watch)).toMatchObject({
            verdict: 'unchecked',
            note: 'no direction',
        });
    });
});

describe('formatKeepRule lines', () => {
    it('prints a metric guard with its interval, an unchecked guard with its note, and a seed guard with its exact test', () => {
        const metric = (/** @type {number[]} */ values) => ({
            values,
            reasons: values.map(() => null),
            mean: 0,
            sd: 0,
        });
        const before = report();
        const after = report({ catches: SEEDS.map((_, i) => 4 + (i % 3)) });
        before.metrics['eval.hunter_catches_per_1k'] = metric(SEEDS.map((_, i) => 10 + (i % 3)));
        const text = formatKeepRule(keepRule(before, after, { status: verified, seedsFor })).join('\n');
        expect(text).toMatch(
            /guard eval\.hunter_catches_per_1k: worse, diff -?\d.*interval \[.*\], smallest loss detected \d/,
        );
        expect(text).toMatch(
            /guard alive: no-harm, 0 seeds harmed vs 0 recovered \(exact p 1\), smallest loss detected 6 seeds/,
        );
        const skipped = formatKeepRule(keepRule(before, after, { status: () => 'unverified', seedsFor })).join('\n');
        expect(skipped).toContain('guard eval.hunter_catches_per_1k: unchecked (unverified)');
        expect(skipped).toContain('keep rule: no harm detected at this size');
    });

    it('prints n/a counts without traces or metrics, and the not-met and WORSE outcomes', () => {
        const bare = { seeds: SEEDS, metrics: {} };
        const text = formatKeepRule(keepRule(bare, bare, { status: verified, seedsFor })).join('\n');
        expect(text).toContain('hunters alive n/a (need 0.75), seeds under 80: n/a vs reference n/a, not met');
        const tiny = SEEDS.slice(0, 3);
        const none = (/** @type {number[]} */ ends) => ({
            ...report(),
            seeds: tiny,
            metrics: { 'eval.predators_at_end': { values: ends, reasons: [null, null, null], mean: 0, sd: 0 } },
            traces: tiny.map(() => ({ spec: [100] })),
        });
        const met = formatKeepRule(keepRule(none([5, 5, 5]), none([5, 5, 5]), { status: verified, seedsFor })).join(
            '\n',
        );
        expect(met).toContain(', met');
        expect(met).toContain('keep rule: no harm detected');
    });
});

describe('the held guard', () => {
    const lostHeld = (/** @type {number} */ k) => SEEDS.map((_, i) => i >= k);
    const all = SEEDS.map(() => true);

    it('flags a seed held when no sample after burn-in is under HELD_POPULATION, ignoring the dip before it', () => {
        expect(HELD_POPULATION).toBe(100);
        expect(heldFlags(report({ held: SEEDS.map((_, i) => i !== 1) }))?.slice(0, 3)).toEqual([1, 0, 1]);
        const trace = { interval: 1000, pop: [5, 5, 5, 5, 5, 5, 5, 5, 5, 100] };
        expect(heldFlags({ traces: [trace] })).toEqual([1]);
        expect(heldFlags({ traces: [{ interval: 2000, pop: [50, 50, 50, 50, 99] }] })).toEqual([0]);
    });

    it('is null without a pop series, or when a seed has no sample after burn-in', () => {
        expect(heldFlags(report())).toBeNull();
        expect(heldFlags({})).toBeNull();
        expect(heldFlags({ traces: [{ interval: 1000, pop: [300, 300] }] })).toBeNull();
    });

    it('judges held by the exact test on the discordant seeds: 5 lost is not worse, 6 lost is', () => {
        const held = (/** @type {number} */ k) =>
            guardOf(
                keepRule(report({ held: all }), report({ held: lostHeld(k) }), {
                    status: verified,
                    seedsFor,
                }),
                'held',
            );
        expect(held(5)).toMatchObject({ verdict: 'no-harm', harmed: 5, recovered: 0 });
        expect(held(6)).toMatchObject({ verdict: 'worse', harmed: 6, recovered: 0, smallestSeeds: 6 });
        const result = keepRule(report({ held: all }), report({ held: lostHeld(6) }), {
            status: verified,
            seedsFor,
        });
        expect(result.worse).toBe(true);
    });

    it('leaves held unchecked when the reports carry no pop, and prints it with the other seed guards', () => {
        const bare = keepRule(report(), report(), { status: verified, seedsFor });
        expect(guardOf(bare, 'held')).toMatchObject({ verdict: 'unchecked', note: 'the report lacks the values' });
        const text = formatKeepRule(
            keepRule(report({ held: all }), report({ held: all }), { status: verified, seedsFor }),
        );
        expect(text.join('\n')).toMatch(
            /guard held: no-harm, 0 seeds harmed vs 0 recovered \(exact p 1\), smallest loss detected 6 seeds/,
        );
    });
});
