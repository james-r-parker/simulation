// The trend metrics (fitness-and-selection.md T5): each hand-built run is driven through the real `observe` and read
// with `computeMetrics`. Windows are 400 ticks; the tables in `helpers/trend-run.js` give each window's pair.

import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../../js/evo/metrics.js';
import { foodShare } from '../../js/evo/metrics-intent.js';
import { RUN_TICKS, every, trendRun } from './helpers/trend-run.js';

/**
 * @param {[number, number][]} table a per-window table
 * @param {number} k the window to empty
 * @returns {[number, number][]} the table with window `k` at [0, 0]
 */
const without = (table, k) => table.map((pair, i) => (i === k ? [0, 0] : pair));

const NAMES = ['deliberate_food_trend', 'pursuit_trend', 'evasion_trend', 'skill_trend'];

/**
 * @param {ReturnType<typeof trendRun>} run the run
 * @param {string} name the metric without the `eval.` prefix
 * @returns {{value: number | null, reason?: string}} the metric
 */
function read(run, name) {
    return computeMetrics(run.observer, run.world)[`eval.${name}`];
}

// Windows 0, 1, 6 and 7 are compared; 2 to 5 are empty, and must not matter. Shares: window 0 is 0, 1 is 1/2, 6 is
// 3/4 (food) or 1 (the others), 7 is 1/2: first two 1/4, last two 5/8 (food) or 3/4.
/** @type {[number, number][]} */
const FOOD = [
    [0, 10],
    [10, 10],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [30, 10],
    [10, 10],
];
/** @type {[number, number][]} */
const PAIRS = [
    [0, 1],
    [1, 1],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [1, 0],
    [1, 1],
];

describe('eval.deliberate_food_trend', () => {
    it('is the last two windows mean food share minus the first two: 5/8 - 1/4', () => {
        expect(read(trendRun({ food: FOOD }), 'deliberate_food_trend')).toEqual({ value: 0.375 });
    });

    it('is 0 for a constant share, whatever the food eaten', () => {
        const run = trendRun({ food: every([10, 10]) });
        expect(read(run, 'deliberate_food_trend')).toEqual({ value: 0 });
    });

    it('is null with a reason when a compared span has no food, and ignores an empty middle window', () => {
        const first = without(FOOD, 0);
        expect(read(trendRun({ food: first }), 'deliberate_food_trend')).toEqual({
            value: null,
            reason: 'a compared span has no food',
        });
        const last = without(FOOD, 7);
        expect(read(trendRun({ food: last }), 'deliberate_food_trend').value).toBeNull();
    });

    it('uses the whole-run share formula on the window differences', () => {
        const run = trendRun({ food: every([30, 10]) });
        const { run: totals } = run.observer.intent;
        expect(foodShare(totals.foodDeliberate, totals.foodChance)).toEqual({ value: 0.75 });
        expect(read(run, 'deliberate_food_share')).toEqual({ value: 0.75 });
    });
});

describe('eval.pursuit_trend', () => {
    it('is the last two windows mean deliberate share of hunter kills minus the first two: 3/4 - 1/4', () => {
        const run = trendRun({ kills: PAIRS });
        expect(run.observer.combat.huntKills).toBe(6);
        expect(read(run, 'pursuit_trend')).toEqual({ value: 0.5 });
    });

    it('is null when fewer than 4 compared windows have a kill', () => {
        const kills = without(PAIRS, 7);
        expect(read(trendRun({ kills: kills }), 'pursuit_trend')).toEqual({
            value: null,
            reason: 'fewer than 4 compared windows have a hunter kill',
        });
    });
});

describe('eval.evasion_trend', () => {
    it('is the last two windows mean responded share of escaped episodes minus the first two: 3/4 - 1/4', () => {
        const run = trendRun({ episodes: PAIRS });
        expect(run.observer.combat.escapedEpisodes).toBe(6);
        expect(read(run, 'evasion_trend')).toEqual({ value: 0.5 });
    });

    it('is null when fewer than 4 compared windows have an escape', () => {
        const episodes = without(PAIRS, 0);
        expect(read(trendRun({ episodes: episodes }), 'evasion_trend')).toEqual({
            value: null,
            reason: 'fewer than 4 compared windows have an escaped bite episode',
        });
    });
});

describe('eval.skill_trend', () => {
    it('is the mean of the trends that are not null: food 0.375 and pursuit 0.5, evasion null', () => {
        const run = trendRun({ food: FOOD, kills: PAIRS });
        expect(read(run, 'evasion_trend').value).toBeNull();
        expect(read(run, 'skill_trend')).toEqual({ value: 0.4375 });
    });

    it('is the mean of all three when none is null', () => {
        const pairs = PAIRS;
        const run = trendRun({ food: FOOD, kills: pairs, episodes: pairs });
        expect(read(run, 'skill_trend')).toEqual({ value: (0.375 + 0.5 + 0.5) / 3 });
    });

    it('is null with a reason when all three are null', () => {
        expect(read(trendRun({}), 'skill_trend')).toEqual({ value: null, reason: 'every trend is null' });
    });
});

describe('the trend metrics without a known run length', () => {
    it('are all null when the observer was not told the run length', () => {
        const run = trendRun({ food: FOOD }, 0);
        for (const name of NAMES) {
            expect(read(run, name)).toEqual({ value: null, reason: 'run length unknown or within burn-in' });
        }
    });

    it('are all null when the run ends before the last window', () => {
        const run = trendRun({ food: FOOD }, RUN_TICKS + 1);
        for (const name of NAMES) {
            expect(read(run, name)).toEqual({ value: null, reason: 'run ended before the final boundary' });
        }
    });
});
