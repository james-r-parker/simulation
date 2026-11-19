import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { main, parseArgs } from '../scripts/train-compare.mjs';
import { formatCompare } from '../scripts/lib/yield-compare-report.mjs';
import { ladderYield } from '../js/evo/ladder-yield.js';
import { compareYield } from '../js/evo/yield-compare.js';
import { loadRuns } from '../scripts/lib/yield-files.mjs';
import { row, writeRun } from './helpers/yield-fixture.js';

const root = mkdtempSync(join(tmpdir(), 'train-compare-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/**
 * @param {string} arm the arm's directory name
 * @param {number} count runs
 * @param {boolean} passes whether each run passes its second stage too
 * @returns {void} writes `count` runs, offsets 0, 8, ...
 */
function writeArm(arm, count, passes) {
    for (let i = 0; i < count; i++) {
        const stages = passes
            ? [
                  { name: 'nursery', passedAt: 10 },
                  { name: 'hunt', passedAt: 40 },
              ]
            : [{ name: 'nursery', passedAt: 10 }, { name: 'hunt' }];
        const rows = [row('nursery', 3600, 1), row('hunt', passes ? 10800 : 5400, passes ? 1 : 0.3)];
        writeRun(join(root, arm, `o${i * 8}`), { offset: i * 8, stages, rows });
    }
}

describe('parseArgs', () => {
    it('takes two patterns and --out, and refuses any other count, an unknown flag or a bare --out', () => {
        expect(parseArgs(['a', 'b', '--out', 'x'])).toEqual({ before: 'a', after: 'b', out: 'x' });
        expect(parseArgs(['a', 'b']).out).toBeNull();
        expect(() => parseArgs(['a'])).toThrow(/usage/);
        expect(() => parseArgs(['a', 'b', 'c'])).toThrow(/usage/);
        expect(() => parseArgs(['a', 'b', '--x'])).toThrow(/unknown argument/);
        expect(() => parseArgs(['a', 'b', '--out'])).toThrow(/--out needs a path/);
    });
});

describe('train:compare', () => {
    it('prints the pairs, the stages side by side, the CPU hours and the verdict, and writes the JSON', async () => {
        writeArm('base', 16, false);
        writeArm('stop', 16, true);
        const out = join(root, 'compare.json');
        /** @type {string[]} */
        const lines = [];
        const code = await main([join(root, 'base', 'o*'), join(root, 'stop', 'o*'), '--out', out], (l) =>
            lines.push(l),
        );
        expect(code).toBe(0);
        const text = lines.join('\n');
        expect(text).toMatch(/offset\s+before\s+after\s+diff/);
        expect(text).toMatch(/hunt\s+0% -> 100%\s+- -> 30\s+- -> 2\.00/);
        expect(text).toContain('matched 16: 16 up, 0 down, 0 tied');
        expect(text).toContain('verdict: better');
        const json = JSON.parse(readFileSync(out, 'utf8'));
        expect(json.compare.verdict).toBe('better');
        expect(json.after.stages[1].passShare).toBe(1);
    });

    it('exits 2 on too few matched offsets, and 1 when a pattern matches nothing', async () => {
        writeArm('few-a', 15, false);
        writeArm('few-b', 15, true);
        expect(await main([join(root, 'few-a', 'o*'), join(root, 'few-b', 'o*')], () => {})).toBe(2);
        expect(await main([join(root, 'nothing*'), join(root, 'few-b', 'o*')], () => {})).toBe(1);
    });
});

describe('formatCompare', () => {
    it('names the offsets present in one arm only and handles a before arm that spent no CPU', () => {
        const arm = (/** @type {number} */ from) =>
            Array.from({ length: 16 }, (_, i) => ({
                dir: '',
                offset: from + i * 8,
                reached: 0,
                passed: [],
                bestProgress: 0,
                score: 0,
                cpuSeconds: 0,
                stageCpuSeconds: {},
            }));
        const before = [...arm(0), ...arm(1000).slice(0, 1)];
        const after = arm(0);
        const compare = compareYield(before, after);
        const yields = { before: ladderYield(before, ['a']), after: ladderYield(after, ['a']) };
        const text = formatCompare(compare, yields).join('\n');
        expect(text).toContain('unmatched offsets: before only [1000], after only []');
        expect(text).toContain('cpu hours 0.0 -> 0.0 (-100%)');
        expect(loadRuns([]).runs).toEqual([]);
    });

    it('prints the union of the two arms` stages, `-` where an arm lacks one, and the incomparable verdict', () => {
        const run = (/** @type {number} */ i, /** @type {number} */ score) => ({
            dir: '',
            offset: i * 8,
            reached: 0,
            passed: [],
            bestProgress: 0,
            score,
            cpuSeconds: 0,
            stageCpuSeconds: {},
        });
        const before = Array.from({ length: 16 }, (_, i) => run(i, 1));
        const after = Array.from({ length: 16 }, (_, i) => run(i, 2));
        const stages = { before: ['a', 'weak'], after: ['a', 'hunt'] };
        const compare = compareYield(before, after, { stages });
        const yields = { before: ladderYield(before, stages.before), after: ladderYield(after, stages.after) };
        const text = formatCompare(compare, yields).join('\n');
        expect(text).toMatch(/weak\s+0% -> -/);
        expect(text).toMatch(/hunt\s+- -> 0%/);
        expect(text).toContain('verdict: incomparable (');
        expect(text).not.toContain('mean score difference');
        expect(text).toMatch(/passed last stage 0 -> 0/);
    });
});
