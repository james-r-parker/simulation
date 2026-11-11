import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configHash } from '../js/sim/config.js';
import { main, parseArgs } from '../scripts/eval-compare.mjs';

const BASE = [10, 12, 9, 11, 13, 10, 12, 11, 10, 12, 9, 11, 13, 10, 12, 11];
const SEEDS = Array.from({ length: 16 }, (_, i) => i + 1);
/** @type {string} */
let dir;

/**
 * @param {number[]} diversity values of eval.births_per_1k
 * @param {Record<string, any>} [over] field overrides
 * @returns {Record<string, any>} a report
 */
function report(diversity, over = {}) {
    const config = { maxAgents: 100 };
    const reasons = diversity.map(() => null);
    const mean = diversity.reduce((a, b) => a + b, 0) / diversity.length;
    return {
        version: 1,
        policy: 'live',
        fitnessName: 'v5',
        config,
        configHash: configHash(config),
        ticks: 1000,
        seeds: SEEDS,
        sha: 'abc',
        metrics: { 'eval.births_per_1k': { values: diversity, reasons, mean, sd: 0 } },
        ...over,
    };
}

/**
 * @param {string} name file name
 * @param {unknown} content JSON content
 * @returns {string} the path
 */
function write(name, content) {
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify(content));
    return path;
}

/**
 * @param {string[]} argv arguments
 * @returns {{ code: number, out: string[], err: string[] }} the exit code and output
 */
function run(argv) {
    /** @type {string[]} */
    const out = [];
    /** @type {string[]} */
    const err = [];
    const code = main(argv, { print: (l) => out.push(l), error: (l) => err.push(l) });
    return { code, out, err };
}

/** @type {string} */
let same;
/** @type {string} */
let better;
/** @type {string} */
let worse;
/** @type {string} */
let short;
beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'eval-compare-'));
    same = write('same.json', report(BASE));
    better = write('better.json', report(BASE.map((v, i) => v + 3 + (i % 2) * 0.1)));
    worse = write('worse.json', report(BASE.map((v, i) => v - 3 - (i % 2) * 0.1)));
    short = write('short.json', report(BASE.slice(0, 2), { seeds: [1, 2] }));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('parseArgs', () => {
    it('reads files and flags in any order', () => {
        expect(
            parseArgs([
                'a.json',
                '--targets',
                'x,y',
                'b.json',
                '--fail-on-worse',
                '--json',
                '--allow-config-diff',
                'k',
            ]),
        ).toEqual({
            files: ['a.json', 'b.json'],
            targets: ['x', 'y'],
            failOnWorse: true,
            keepRule: false,
            json: true,
            allowSeedDiff: false,
            allowConfigDiff: ['k'],
            minEffect: 0.05,
            shareMinEffect: 0.02,
        });
    });

    it('reads --min-effect and validates it is a fraction', () => {
        expect(parseArgs(['a', 'b', '--min-effect', '0.1']).minEffect).toBe(0.1);
        for (const bad of ['2', '-0.1', 'x', '']) {
            expect(() => parseArgs(['a', 'b', '--min-effect', bad])).toThrow(/fraction/);
        }
        expect(() => parseArgs(['a', 'b', '--min-effect'])).toThrow(/fraction/);
    });

    it('reads --share-min-effect and validates it is a fraction', () => {
        expect(parseArgs(['a', 'b', '--share-min-effect', '0.03']).shareMinEffect).toBe(0.03);
        expect(() => parseArgs(['a', 'b', '--share-min-effect', '3'])).toThrow(/fraction/);
    });

    it('rejects a wrong file count and unknown flags', () => {
        expect(() => parseArgs(['a.json'])).toThrow(/two report files/);
        expect(() => parseArgs(['a', 'b', '--nope'])).toThrow(/unknown argument/);
        expect(() => parseArgs(['a', 'b', '--targets'])).toThrow(/comma-separated/);
    });
});

describe('main exit codes', () => {
    it('exits 0 and prints a table with the targets marked', () => {
        const { code, out } = run([same, better, '--targets', 'eval.births_per_1k']);
        expect(code).toBe(0);
        expect(out[0]).toMatch(/metric\s+before\s+after\s+diff\s+effect\s+95% interval\s+verdict/);
        expect(out[0]).toMatch(/eval\.births_per_1k.*better\s+\*/);
    });

    it('prints JSON with --json', () => {
        const { out } = run([same, better, '--json']);
        const result = JSON.parse(out[0]);
        expect(result.rows[0].verdict).toBe('better');
        expect(result.rows[0].effect).toBeGreaterThan(0.2);
        expect(result.minEffect).toBe(0.05);
        expect(result.shareMinEffect).toBe(0.02);
    });

    it('prints the `needs 32 seeds` note in the table and `minSeeds` in --json rows', () => {
        const floor = (/** @type {number[]} */ values) => {
            const r = report(values);
            r.metrics['eval.floor_episodes'] = { ...r.metrics['eval.births_per_1k'] };
            return r;
        };
        const a = write('floor-a.json', floor(BASE));
        const b = write('floor-b.json', floor(BASE.map((v) => v + 3)));
        expect(run([a, b]).out[0]).toMatch(/eval\.floor_episodes.*-\s+needs 32 seeds/);
        const rows = JSON.parse(run([a, b, '--json']).out[0]).rows;
        const byName = Object.fromEntries(rows.map((/** @type {any} */ r) => [r.metric, r]));
        expect(byName['eval.floor_episodes']).toMatchObject({ minSeeds: 32, verdict: '-', note: 'needs 32 seeds' });
        expect(byName['eval.births_per_1k'].minSeeds).toBe(16);
    });

    it('shows the relative effect and honours --min-effect', () => {
        expect(run([same, better]).out[0]).toMatch(/eval\.births_per_1k.*\+27\.\d%.*better/);
        const tiny = write('tiny.json', report(BASE.map((v, i) => v + 0.3 + (i % 2) * 0.1)));
        expect(run([same, tiny]).out[0]).toMatch(/\+3\.\d%.*no-difference/);
        expect(run([same, tiny, '--min-effect', '0.01']).out[0]).toMatch(/\+3\.\d%.*better/);
    });

    it('prints `unverified` for a metric that is not verified, logs it and does not fail on it', () => {
        const raw = (/** @type {number[]} */ values) => {
            const r = report(values);
            r.metrics['eval.floor_episodes'] = { ...r.metrics['eval.births_per_1k'] };
            return r;
        };
        const seeds = Array.from({ length: 32 }, (_, i) => i + 1);
        const wide = (/** @type {number} */ d) => raw([...BASE, ...BASE].map((v) => v - d));
        const a = write('un-a.json', { ...wide(0), seeds });
        const b = write('un-b.json', { ...wide(5), seeds });
        const res = run([a, b, '--fail-on-worse']);
        expect(res.out[0]).toMatch(/eval\.floor_episodes.*unverified/);
        expect(res.out[0]).toMatch(/eval\.births_per_1k.*worse/);
        expect(res.err.map((l) => JSON.parse(l))).toEqual([
            { level: 'info', event: 'CompareUnverified', metric: 'eval.floor_episodes', status: 'unverified' },
        ]);
        const only = run([a, b, '--fail-on-worse', '--targets', 'eval.floor_episodes']);
        expect(only.code).toBe(0);
    });

    it('--keep-rule prints the guards and the adoption bar, in the table and in --json, and --fail-on-worse reads it', () => {
        const withHunters = (/** @type {number[]} */ ends) => {
            const r = report(BASE);
            r.metrics['eval.predators_at_end'] = { values: ends, reasons: ends.map(() => null), mean: 0, sd: 0 };
            r.traces = ends.map(() => ({
                interval: 100,
                lineages: 5,
                pop: [100],
                mate: [0],
                split: [0],
                spec: [100],
                deaths: [0],
            }));
            return r;
        };
        const alive = write('keep-a.json', withHunters(BASE.map(() => 5)));
        const dead = write('keep-b.json', withHunters(BASE.map((_, i) => (i < 12 ? 0 : 5))));
        const inert = run([alive, alive, '--keep-rule']);
        expect(inert.out[0]).toMatch(/guard alive: no-harm/);
        expect(inert.out[0]).toMatch(/adoption bar: hunters alive 16\/16/);
        expect(inert.out[0]).toMatch(/keep rule: no harm detected/);
        expect(run([alive, dead, '--keep-rule']).out[0]).toMatch(/keep rule: WORSE/);
        expect(run([alive, dead, '--fail-on-worse']).code).toBe(0);
        expect(run([alive, dead, '--fail-on-worse', '--keep-rule']).code).toBe(1);
        expect(JSON.parse(run([alive, dead, '--keep-rule', '--json']).out[0]).keepRule.worse).toBe(true);
        expect(JSON.parse(run([alive, dead, '--json']).out[0]).keepRule).toBeUndefined();
    });

    it('exits 1 on a worse verdict only with --fail-on-worse', () => {
        expect(run([same, worse]).code).toBe(0);
        expect(run([same, worse, '--fail-on-worse']).code).toBe(1);
        expect(run([same, better, '--fail-on-worse']).code).toBe(0);
    });

    it('exits 2 on a refusal, naming the field', () => {
        const { code, err } = run([same, short]);
        expect(code).toBe(2);
        expect(err[0]).toMatch(/^CompareRefused seeds: /);
        expect(JSON.parse(err[1])).toMatchObject({ event: 'CompareRefused', field: 'seeds' });
        const fewer = write('few2.json', report(BASE.slice(0, 2), { seeds: [1, 2] }));
        expect(run([short, fewer]).err[0]).toMatch(/^CompareRefused seedCount/);
    });

    it('--allow-seed-diff compares different seed lists and says so in the table', () => {
        const offset = write('offset.json', report(BASE, { seeds: SEEDS.map((x) => x + 16) }));
        expect(run([same, offset]).code).toBe(2);
        const { code, out } = run([same, offset, '--allow-seed-diff']);
        expect(code).toBe(0);
        expect(out[0]).toMatch(/paired by position, not by seed/);
        expect(JSON.parse(run([same, offset, '--allow-seed-diff', '--json']).out[0]).paired).toBe(false);
    });

    it('compares reports whose policyOptions differ and says what differed', () => {
        const tuned = write('tuned.json', report(BASE, { policyOptions: { fitnessOverrides: { BORN: 9 }, a: 1 } }));
        const { code, out } = run([same, tuned]);
        expect(code).toBe(0);
        expect(out[0]).toMatch(/policyOptions differ: before \{\}, after \{"a":1,"fitnessOverrides":\{"BORN":9\}\}$/);
        const json = JSON.parse(run([same, tuned, '--json']).out[0]);
        expect(json.policyOptions).toMatchObject({ differ: true, before: '{}' });
        expect(run([tuned, tuned]).out[0]).not.toMatch(/policyOptions differ/);
        expect(run([same, same]).out[0]).not.toMatch(/policyOptions differ/);
    });

    it('exits 2 on unknown targets, invalid reports and bad arguments', () => {
        const unknown = run([same, better, '--targets', 'eval.births_per_1k,eval.nope']);
        expect(unknown.code).toBe(2);
        expect(unknown.err[0]).toMatch(/eval\.nope/);
        expect(run([same, write('bad.json', { version: 1 })]).code).toBe(2);
        expect(run([same]).code).toBe(2);
        expect(run([same, join(dir, 'missing.json')]).code).toBe(2);
    });
});
