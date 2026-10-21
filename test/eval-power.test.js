import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { configHash } from '../js/sim/config.js';
import { createRng } from '../js/sim/rng.js';
import { evalPower, formatPower, main, parseArgs, powerRow, shuffled } from '../scripts/eval-power.mjs';

const SEEDS = Array.from({ length: 64 }, (_, i) => i + 1);
const dir = mkdtempSync(join(tmpdir(), 'eval-power-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/**
 * @param {Record<string, (number | null)[]>} metrics values per metric, one per seed
 * @param {number} [count] seeds in the report
 * @returns {Record<string, any>} a report
 */
function report(metrics, count = 64) {
    const config = { maxAgents: 100 };
    return {
        version: 1,
        policy: 'live',
        fitnessName: 'v5',
        config,
        configHash: configHash(config),
        ticks: 1000,
        seeds: SEEDS.slice(0, count),
        sha: 'abc',
        metrics: Object.fromEntries(
            Object.entries(metrics).map(([name, values]) => {
                const present = /** @type {number[]} */ (values.filter((v) => v !== null));
                const mean = present.length === 0 ? null : present.reduce((a, b) => a + b, 0) / present.length;
                return [name, { values, reasons: values.map((v) => (v === null ? 'none' : null)), mean, sd: 0 }];
            }),
        ),
    };
}

describe('parseArgs', () => {
    it('has the defaults and reads every flag', () => {
        expect(parseArgs(['r.json'])).toEqual({
            files: ['r.json'],
            splits: 1000,
            powerSplits: 200,
            sizes: [16, 32],
            metrics: [],
            json: false,
        });
        expect(
            parseArgs([
                'r.json',
                '--splits',
                '50',
                '--power-splits',
                '20',
                '--sizes',
                '16',
                '--metrics',
                'a,b',
                '--json',
            ]),
        ).toMatchObject({ splits: 50, powerSplits: 20, sizes: [16], metrics: ['a', 'b'], json: true });
    });

    it('rejects a wrong file count, bad numbers and unknown flags', () => {
        expect(() => parseArgs([])).toThrow(/one report file/);
        expect(() => parseArgs(['a', 'b'])).toThrow(/one report file/);
        expect(() => parseArgs(['a', '--splits', '0'])).toThrow(/integer/);
        expect(() => parseArgs(['a', '--sizes', '8'])).toThrow(/integer/);
        expect(() => parseArgs(['a', '--nope'])).toThrow(/unknown argument/);
    });
});

describe('shuffled', () => {
    it('is a permutation that replays from the seed', () => {
        const order = shuffled(64, createRng(3));
        expect([...order].sort((a, b) => a - b)).toEqual(SEEDS.map((s) => s - 1));
        expect(shuffled(64, createRng(3))).toEqual(order);
        expect(shuffled(64, createRng(4))).not.toEqual(order);
    });
});

describe('powerRow and evalPower', () => {
    const flat = Array.from({ length: 64 }, (_, i) => 10 + (i % 5));
    const base = { size: 16, splits: 4, powerSplits: 4 };

    it('gives watch, unknown and zero-mean metrics a note instead of numbers', () => {
        const r = report({ 'eval.population_mean': flat, mystery: flat, 'eval.diversity': flat.map(() => 0) });
        expect(powerRow(r, 'eval.population_mean', base)).toMatchObject({ note: 'watch', falsePositive: null });
        expect(powerRow(r, 'mystery', base)).toMatchObject({ note: 'unknown metric' });
        expect(powerRow(r, 'eval.diversity', base)).toMatchObject({ note: 'mean is 0', falsePositive: 0 });
    });

    it('gives no verdict below a metric seed minimum, and with nulls in every split', () => {
        const r = report({ 'eval.floor_episodes': flat, 'eval.diversity': flat.map(() => null) });
        expect(powerRow(r, 'eval.floor_episodes', base).note).toBe('no verdict at this size');
        expect(powerRow(r, 'eval.diversity', base).note).toBe('no verdict at this size');
    });

    it('measures a metric whose planted effect never reaches 80% as detectable null', () => {
        const noisy = Array.from({ length: 64 }, (_, i) => (i % 2 === 0 ? 0 : 1000));
        const row = powerRow(report({ 'eval.diversity': noisy }), 'eval.diversity', { ...base, powerSplits: 3 });
        expect(row.detectable).toBeNull();
        expect(row.note).toBeUndefined();
    });

    it('covers each metric at each size, and refuses a report too small or a missing metric', () => {
        const r = report({ 'eval.diversity': flat, 'eval.population_mean': flat });
        const rows = evalPower(r, { splits: 2, powerSplits: 2, sizes: [16], metrics: [] });
        expect(rows.map((x) => `${x.metric}@${x.size}`)).toEqual(['eval.diversity@16', 'eval.population_mean@16']);
        expect(() =>
            evalPower(report({ 'eval.diversity': flat.slice(0, 20) }, 20), { ...base, sizes: [16], metrics: [] }),
        ).toThrow(/needs 32 seeds/);
        expect(() => evalPower(r, { ...base, sizes: [16], metrics: ['nope'] })).toThrow(/not in the report: nope/);
    });
});

describe('formatPower and main', () => {
    it('prints rates as percentages, flags a rate above 10%, and shows >100% when nothing is detected', () => {
        const lines = formatPower([
            { metric: 'a', size: 16, falsePositive: 0.04, detectable: 0.2 },
            { metric: 'b', size: 16, falsePositive: 0.2, detectable: null },
            { metric: 'c', size: 16, falsePositive: null, detectable: null, note: 'watch' },
        ]);
        expect(lines[0]).toMatch(/metric\s+seeds\s+false positive\s+detectable at 80%/);
        expect(lines[1]).toMatch(/^a\s+16\s+4\.0%\s+20\.0%$/);
        expect(lines[2]).toMatch(/^b\s+16\s+20\.0%\s+>100%\s+watch\?$/);
        expect(lines[3]).toMatch(/^c\s+16\s+-\s+-\s+watch$/);
    });

    it('reads a report file and prints a table or JSON, and exits 2 on bad input', () => {
        const flat = Array.from({ length: 64 }, (_, i) => 10 + (i % 5));
        const path = join(dir, 'r.json');
        writeFileSync(path, JSON.stringify(report({ 'eval.diversity': flat })));
        /** @type {string[]} */
        const out = [];
        /** @type {string[]} */
        const err = [];
        const io = { print: (/** @type {string} */ l) => out.push(l), error: (/** @type {string} */ l) => err.push(l) };
        const args = [path, '--splits', '3', '--power-splits', '3', '--sizes', '16'];
        expect(main(args, io)).toBe(0);
        expect(out[0]).toMatch(/eval\.diversity\s+16/);
        expect(main([...args, '--json'], io)).toBe(0);
        expect(JSON.parse(out[1]).rows[0].metric).toBe('eval.diversity');
        expect(main([join(dir, 'missing.json')], io)).toBe(2);
        writeFileSync(join(dir, 'bad.json'), '{"version":1}');
        expect(main([join(dir, 'bad.json')], io)).toBe(2);
        expect(err).toHaveLength(2);
    });
});
