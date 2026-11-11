import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { format } from 'prettier';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { METRICS } from '../js/evo/metric-registry/index.js';
import { main, renderMetricsDoc, renderTable } from '../scripts/metrics-doc.mjs';

/** A made-up registry: a verified metric, a deprecated one and a watch one, with a pipe in a meaning. */
const base = METRICS['eval.median_lifespan'];
const verified = {
    ...base,
    family: 'core',
    tests: { arithmetic: 'a.test.js', source: 'b.test.js' },
    liveness: { nullShare: 0, distinct: 5, report: 'r.json' },
    power: { fpr16: 0.05, fpr32: 0.05, mde16: 0.3, mde32: 0.12, referenceMean: 100, report: 'r.json' },
    minSeeds: /** @type {const} */ (32),
};
const FAKE = {
    'eval.zeta': {
        ...base,
        family: 'core',
        meaning: 'Has a | pipe.',
        deprecated: 'kept until T24',
        power: null,
        minSeeds: null,
    },
    'eval.alpha': verified,
    'eval.mid': {
        ...base,
        family: 'world',
        direction: /** @type {const} */ ('watch'),
        intended: /** @type {const} */ ('lower'),
        liveness: null,
        power: null,
        minSeeds: null,
    },
};

/** @type {string[]} */
const dirs = [];
afterEach(() => {
    vi.restoreAllMocks();
    while (dirs.length > 0) {
        rmSync(/** @type {string} */ (dirs.pop()), { recursive: true, force: true });
    }
});

/**
 * @param {string} doc the rendered doc
 * @param {string} name a metric name
 * @returns {string[][]} the cells of each row of that metric
 */
function cellsOf(doc, name) {
    return doc
        .split('\n')
        .filter((line) => line.startsWith(`| \`${name}\` `))
        .map((line) =>
            line
                .split(/(?<!\\)\|/)
                .slice(1, -1)
                .map((cell) => cell.trim()),
        );
}

/** @returns {string} a path for a doc in a fresh temporary directory */
function docPath() {
    const dir = mkdtempSync(join(tmpdir(), 'metrics-doc-'));
    dirs.push(dir);
    return join(dir, 'metrics.md');
}

/**
 * @param {string[]} args the CLI arguments
 * @param {string} path the doc's path
 * @returns {{ code: number, err: string }} the exit code and what went to stderr
 */
function run(args, path) {
    const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const code = main(args, { path });
    return { code, err: err.mock.calls.map((call) => String(call[0])).join('') };
}

describe('renderMetricsDoc', () => {
    it('has one row per registry metric, in a section per family', () => {
        const doc = renderMetricsDoc();
        const rows = doc.split('\n').filter((line) => line.startsWith('| `eval.'));
        expect(rows).toHaveLength(Object.keys(METRICS).length);
        for (const name of Object.keys(METRICS)) {
            expect(cellsOf(doc, name), name).toHaveLength(1);
        }
        expect(doc.split('\n').filter((line) => line.startsWith('## '))).toHaveLength(7);
    });

    it('is the text Prettier writes, so the format gate leaves it alone', async () => {
        const doc = renderMetricsDoc();
        expect(
            await format(doc, { parser: 'markdown', printWidth: 120, singleQuote: true, proseWrap: 'preserve' }),
        ).toBe(doc);
    });

    it('shows status, direction, seeds and the detectable change, and escapes a pipe', () => {
        const doc = renderMetricsDoc(FAKE);
        expect(doc).toContain('1 verified, 1 unverified, 1 deprecated');
        expect(cellsOf(doc, 'eval.alpha')[0].slice(3)).toEqual(['higher', 'verified', '32', '12%']);
        expect(cellsOf(doc, 'eval.zeta')[0]).toEqual([
            '`eval.zeta`',
            'Has a \\| pipe.',
            'ticks',
            'higher',
            'deprecated',
            '16',
            '-',
        ]);
        expect(doc).toContain('watch (lower)');
        expect(doc.indexOf('eval.alpha')).toBeLessThan(doc.indexOf('eval.zeta'));
    });

    it('reads "none" when no seed count detects a change, and the legacy 32 for a noisy metric', () => {
        const noisy = { ...verified, power: { ...verified.power, mde32: null }, minSeeds: null };
        const doc = renderMetricsDoc({ 'eval.floor_episodes': noisy });
        expect(cellsOf(doc, 'eval.floor_episodes')[0].slice(4)).toEqual(['unverified', '32', 'none']);
    });
});

describe('renderTable', () => {
    it('pads each column to its widest cell', () => {
        expect(
            renderTable([
                ['a', 'bb'],
                ['cccc', 'd'],
            ]),
        ).toEqual(['| a    | bb  |', '| ---- | --- |', '| cccc | d   |']);
    });
});

describe('metrics-doc --check', () => {
    it('fails on a stale doc and passes after --write', () => {
        const path = docPath();
        writeFileSync(path, '# Metrics\n\nstale\n');
        expect(run(['--check'], path)).toMatchObject({ code: 1 });
        expect(run(['--check'], path).err).toContain('stale');
        expect(run(['--write'], path).code).toBe(0);
        expect(run(['--check'], path).code).toBe(0);
    });

    it('fails when the doc is missing, and rejects an unknown argument', () => {
        expect(run(['--check'], docPath()).code).toBe(1);
        expect(run(['--fix'], docPath()).code).toBe(2);
    });

    it('holds for the committed docs/designs/metrics.md', () => {
        const committed = readFileSync(new URL('../docs/designs/metrics.md', import.meta.url), 'utf8');
        expect(committed).toBe(renderMetricsDoc());
    });
});
