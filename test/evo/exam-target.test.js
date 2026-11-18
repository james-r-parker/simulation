import { describe, expect, it } from 'vitest';
import { SCENE_VERDICT_METRICS, inheritedExamRow, scenesExamRow } from '../../js/evo/exam-target.js';
import { configHash } from '../../js/sim/config.js';

const SEEDS = Array.from({ length: 32 }, (_, i) => i + 1);
const CONFIG = { maxAgents: 100 };
/** Seed-to-seed spread, so the interval of a shift has width and no value is null. */
const jitter = (/** @type {number} */ i) => ((i * 7) % 5) * 0.01;

/**
 * @param {Record<string, number>} level each metric's level
 * @param {Record<string, any>} [over] report field overrides
 * @returns {Record<string, any>} a 32-seed report whose metrics sit at `level` plus the jitter
 */
function report(level, over = {}) {
    const metrics = Object.fromEntries(
        Object.entries(level).map(([name, base]) => {
            const values = SEEDS.map((_, i) => base + jitter(i));
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            return [name, { values, reasons: values.map(() => null), mean, sd: 0 }];
        }),
    );
    return {
        version: 1,
        policy: 'map-elites-v6',
        fitnessName: 'v6',
        config: CONFIG,
        configHash: configHash(CONFIG),
        ticks: 200000,
        seeds: SEEDS,
        sha: 'abc',
        metrics,
        ...over,
    };
}

const FLAT = Object.fromEntries(SCENE_VERDICT_METRICS.map((name) => [name, 0.2]));
const live = () => report({ ...FLAT, 'eval.chase_catch_share': 0.3 });
const champions = (/** @type {Record<string, number>} */ shift = {}, over = {}) =>
    report({ ...FLAT, 'eval.chase_catch_share': 0.35, ...shift }, { policy: 'champions-v1', ...over });
const KEEP = { seedCount: 64, keepRule: { worse: false } };

describe('row 6, scenes', () => {
    it('is not run without the two reports', () => {
        expect(scenesExamRow({ before: null, after: champions(), keep: KEEP }).verdict).toBe('not run');
        expect(scenesExamRow({ before: live(), after: null, keep: KEEP }).command).toMatch(/--keep-rule/);
    });

    it('is not run, naming what is wrong, on a wrong policy, too few seeds or ticks, or no keep-rule report', () => {
        const row = (/** @type {any} */ before, /** @type {any} */ after, /** @type {any} */ keep) =>
            scenesExamRow({ before, after, keep });
        expect(row(live(), champions({}, { policy: 'map-elites-v6' }), KEEP).reason).toMatch(/not champions-v1/);
        expect(row(report(FLAT, { policy: 'other' }), champions(), KEEP).reason).toMatch(/not the live policy/);
        expect(row(live(), champions({}, { seeds: SEEDS.slice(0, 16) }), KEEP).reason).toMatch(/32 seeds/);
        expect(row(live(), champions({}, { ticks: 1000 }), KEEP).reason).toMatch(/200000 ticks/);
        expect(row(live(), champions(), null).reason).toMatch(/no keep-rule report/);
        expect(row(live(), champions(), { ...KEEP, seedCount: 32 }).reason).toMatch(/keep-rule report needs 64/);
        const all = row(report(FLAT, { policy: 'x', ticks: 1 }), champions(), null);
        expect(all.reason?.split('; ').length).toBeGreaterThan(2);
    });

    it('passes when a verified verdict metric is better, none is worse and no guard reads WORSE', () => {
        const row = scenesExamRow({ before: live(), after: champions({ 'eval.bite_on_prey_view': 0.5 }), keep: KEEP });
        expect(row.verdict).toBe('pass');
        expect(row.numbers.verdicts['eval.bite_on_prey_view']).toBe('better');
        expect(row.numbers.seeds).toBe(32);
        expect(row.numbers.watch.map((/** @type {any} */ w) => w.metric)).toEqual(['eval.chase_catch_share']);
        expect(row.numbers.watch[0].after).toBeGreaterThan(row.numbers.watch[0].before);
    });

    it('fails when no verdict metric is better', () => {
        const row = scenesExamRow({ before: live(), after: champions(), keep: KEEP });
        expect(row).toMatchObject({ verdict: 'fail', reason: 'no verified verdict metric is better' });
    });

    it('fails when a verdict metric is worse, though another is better', () => {
        const shift = { 'eval.bite_on_prey_view': 0.5, 'eval.patch_leave_depleted': -0.1 };
        const row = scenesExamRow({ before: live(), after: champions(shift), keep: KEEP });
        expect(row.verdict).toBe('fail');
        expect(row.reason).toBe('worse: eval.patch_leave_depleted');
    });

    it('fails when a keep-rule guard reads WORSE', () => {
        const keep = { seedCount: 64, keepRule: { worse: true } };
        const row = scenesExamRow({ before: live(), after: champions({ 'eval.bite_on_prey_view': 0.5 }), keep });
        expect(row).toMatchObject({ verdict: 'fail', reason: 'a keep-rule guard reads WORSE' });
    });
});

describe('row 7, inherited', () => {
    const named = ['food-ahead', 'prey-ahead'];
    const shares = (/** @type {number} */ share, /** @type {number | null} */ edge) => ({
        drills: { 'food-ahead': { winShare: share, edgeLow: edge }, 'prey-ahead': { winShare: share, edgeLow: edge } },
    });
    const founders = shares(0.8, 0.5);
    const good = { children: shares(0.5, 0.2), grandchildren: shares(0.4, 0.1) };
    const met = { met: true };

    it('is not run without descendants, naming the command', () => {
        const row = inheritedExamRow({ named, founders, groups: null, replacement: met });
        expect(row.verdict).toBe('not run');
        expect(row.command).toMatch(/--descendants/);
    });

    it('is not run while a generation or the replacement reading is missing', () => {
        const unlabelled = inheritedExamRow({
            named,
            founders,
            groups: { unlabelled: shares(0.8, 0.5) },
            replacement: null,
        });
        expect(unlabelled.verdict).toBe('not run');
        expect(unlabelled.numbers.groups).toHaveProperty('unlabelled');
        expect(unlabelled.reason).toBe(
            'not read: children, grandchildren, replacement (a missing generation cannot pass; T23a labels them)',
        );
        const noGrandchildren = inheritedExamRow({
            named,
            founders,
            groups: { children: good.children },
            replacement: met,
        });
        expect(noGrandchildren.reason).toMatch(/not read: grandchildren \(/);
    });

    it('passes when every generation keeps half the founders share with an edge, and replacement is met', () => {
        const row = inheritedExamRow({ named, founders, groups: good, replacement: met });
        expect(row).toMatchObject({ verdict: 'pass', numbers: { weak: { children: [], grandchildren: [] } } });
    });

    it('fails on a generation under half the founders share, with no edge, or a drill it did not run', () => {
        const under = { ...good, grandchildren: shares(0.39, 0.1) };
        expect(inheritedExamRow({ named, founders, groups: under, replacement: met }).reason).toBe(
            'grandchildren fall short on food-ahead, prey-ahead',
        );
        const noEdge = { ...good, children: shares(0.8, 0) };
        expect(inheritedExamRow({ named, founders, groups: noEdge, replacement: met }).verdict).toBe('fail');
        const nullEdge = { ...good, children: shares(0.8, null) };
        expect(inheritedExamRow({ named, founders, groups: nullEdge, replacement: met }).verdict).toBe('fail');
        const blank = { ...good, children: { drills: {} } };
        expect(inheritedExamRow({ named, founders, groups: blank, replacement: met }).reason).toMatch(
            /children fall short/,
        );
        const noFounders = inheritedExamRow({ named, founders: { drills: {} }, groups: good, replacement: met });
        expect(noFounders.verdict).toBe('fail');
    });

    it('fails when the replacement bar is not met, even with a generation missing', () => {
        const row = inheritedExamRow({ named, founders, groups: good, replacement: { met: false } });
        expect(row).toMatchObject({ verdict: 'fail', reason: 'the family-replacement bar is not met' });
        const partial = inheritedExamRow({
            named,
            founders,
            groups: { children: good.children },
            replacement: { met: false },
        });
        expect(partial.verdict).toBe('fail');
    });
});
