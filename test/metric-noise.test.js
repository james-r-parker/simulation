import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { entry } from '../js/evo/metric-registry/entry.js';
import { dependencyBlocks, findTargets, passes, renderTable, replaceTable } from '../scripts/lib/metric-noise.mjs';
import { inventory, main, validateEvidence } from '../scripts/metric-noise.mjs';

const unverified = entry('test', {
    module: 'fixture',
    meaning: 'test',
    counts: 'test',
    unit: 'count',
    direction: 'higher',
    nullWhen: [],
});
const registry = {
    'eval.a': unverified,
    'eval.guild_share.forager': unverified,
    'eval.guild_share.scout': unverified,
    'eval.food_energy_per_1k': {
        ...unverified,
        tests: { arithmetic: 'a', source: 's' },
        liveness: { nullShare: 0, distinct: 2, report: 'r' },
        power: {},
        minSeeds: 16,
    },
    'eval.fed_median_lifespan': { ...unverified, deprecated: 'retired' },
};

/** @param {string} text body @param {string} [status] plan status @returns {string} markdown */
const doc = (text, status = 'Proposed') => `# Test\n\n**Status:** ${status}\n\n${text}`;

/** @param {number} size arm size @param {number | null} mde detectable change @param {number | null} [fpr] false positives @returns {any} power reading */
const row = (size, mde, fpr = 0.05) => ({
    metric: 'eval.a',
    size,
    detectable: mde,
    falsePositive: fpr,
    detectableKind: 'relative',
});

describe('active plan metric dependencies', () => {
    it('expands wildcards, deduplicates names, and retains plan/context references in sorted order', () => {
        const result = findTargets(
            {
                'z.md': doc('**Targets:** eval.a, eval.a, eval.guild_share.*\n\nDone when `eval.a` rises.'),
                'a.md': doc('Prediction: `eval.a` falls.', 'In progress'),
            },
            registry,
        );
        expect(result.map((r) => r.metric)).toEqual(['eval.a', 'eval.guild_share.forager', 'eval.guild_share.scout']);
        expect(result[0].references).toEqual([
            { plan: 'a.md', line: 5, kind: 'done/prediction prose' },
            { plan: 'z.md', line: 5, kind: 'Targets' },
            { plan: 'z.md', line: 7, kind: 'done/prediction prose' },
        ]);
    });

    it('expands trailing wildcards in the first name segment and wrapped Targets', () => {
        const result = findTargets({ 'p.md': doc('**Targets:** eval.guild_share*,\n eval.a') }, registry);
        expect(result.map((target) => target.metric)).toEqual([
            'eval.a',
            'eval.guild_share.forager',
            'eval.guild_share.scout',
        ]);
    });

    it('distinguishes namespace examples from explicit all-metric Targets', () => {
        const docs = {
            'p.md': doc('**Targets:** none - no eval.* metric moves.\n\nDone criteria need eval.* detectors.'),
        };
        expect(findTargets(docs, registry)).toEqual([]);
        expect(findTargets({ 'p.md': doc('**Targets:** eval.*') }, registry).map((target) => target.metric)).toEqual([
            'eval.a',
            'eval.guild_share.forager',
            'eval.guild_share.scout',
        ]);
    });

    it('ignores inactive plans, verified/deprecated/future metrics, ordinary mentions and explicit no-prediction declarations', () => {
        const result = findTargets(
            {
                'implemented.md': doc('**Targets:** eval.a', 'Implemented'),
                'reference.md': doc('**Targets:** eval.a', 'Reference'),
                'superseded.md': doc('**Targets:** eval.a', 'Superseded'),
                'active.md': doc(
                    '**Targets:** eval.food_energy_per_1k, eval.fed_median_lifespan, eval.nope\n\n`eval.a` describes a count.\n\n| No baseline prediction is claimed for `eval.a` | Descriptive |',
                ),
            },
            registry,
        );
        expect(result).toEqual([]);
    });

    it('reads multiline prose, done tables, prediction tables, labelled predictions and sections', () => {
        const sources = [
            'Done means:\n`eval.a` rises.',
            '| Done when | Stop when |\n| --- | --- |\n| `eval.a` rises | - |',
            '| Id | Prediction |\n| --- | --- |\n| E1 | `eval.a` rises |',
            '**Prediction and detector.**\n\n- `eval.a` rises.',
            '## Predictions\n\n`eval.a` rises.\n\n## Ordinary\n\n`eval.guild_share.forager` is descriptive.',
        ];
        for (const text of sources) {
            expect(findTargets({ 'p.md': doc(text) }, registry).map((t) => t.metric)).toEqual(['eval.a']);
        }
    });

    it('skips fenced examples and stops table context before unrelated tables', () => {
        const text =
            '```bash\n**Targets:** eval.a\n```\n\n| Done when |\n| --- |\n| No metric |\n\n| Metric | Meaning |\n| --- | --- |\n| eval.a | ordinary |';
        expect(findTargets({ 'p.md': doc(text) }, registry)).toEqual([]);
        expect(dependencyBlocks('Prediction: a\nwrap').map((b) => b.text)).toEqual(['Prediction: a\nwrap']);
    });
});

describe('power bars and table', () => {
    it('requires both FPR and MDE, accepts boundary values and treats null as failure', () => {
        expect(passes(row(16, 0.2, 0.1), unverified, 10)).toBe(true);
        expect(passes(row(32, 0.2, 0.101), unverified, 10)).toBe(false);
        expect(passes(row(64, 0.3), unverified, 10)).toBe(false);
        expect(passes(row(16, null), unverified, 10)).toBe(false);
        expect(passes(row(16, 0.2, null), unverified, 10)).toBe(false);
    });

    it('uses exact registry units, absolute share bars, correlation/trend and near-zero means', () => {
        expect(passes(row(16, 0.05), { unit: 'share' }, 0.9)).toBe(true);
        expect(passes(row(16, 0.075), { unit: 'share' }, 0.9)).toBe(false);
        expect(passes(row(16, 0.3), { unit: 'correlation' }, -0.2)).toBe(true);
        expect(passes(row(16, 0.3), { unit: 'trend' }, 0.5)).toBe(false);
        expect(passes(row(16, 1), unverified, 0.01)).toBe(true);
        expect(passes(row(16, 0.3), { unit: 'share difference' }, 0.5)).toBe(false);
    });

    it('prints the smallest passing size, every reading, unique plan links, and failure through 64', () => {
        const targets = findTargets({ 'p.md': doc('**Targets:** eval.a\n\nDone: eval.a') }, registry);
        const report = { metrics: { 'eval.a': { mean: 10 } } };
        const text = renderTable(targets, [row(16, 0.5), row(32, 0.2), row(64, 0.1)], report, registry);
        expect(text).toContain('0.050 / 0.5 rel');
        expect(text).toMatch(/\| 32\s+\| \[p.md\]\(p.md\)/);
        expect(text.match(/\[p.md\]/g)).toHaveLength(1);
        expect(renderTable(targets, [row(16, null), row(32, 0.3), row(64, 0.3)], report, registry)).toContain(
            'fails through 64',
        );
        expect(() => renderTable(targets, [row(16, 0.1)], report, registry)).toThrow('missing power row');
    });

    it('replaces only the generated region and refuses absent or reversed markers', () => {
        const text = 'before\n<!-- metric-noise:start -->\nold\n<!-- metric-noise:end -->\nafter';
        expect(replaceTable(text, 'new')).toBe(
            'before\n<!-- metric-noise:start -->\n\nnew\n\n<!-- metric-noise:end -->\nafter',
        );
        expect(() => replaceTable('no markers', '')).toThrow('markers');
        expect(() => replaceTable('<!-- metric-noise:end --><!-- metric-noise:start -->', '')).toThrow('order');
    });
});

describe('metric-noise CLI', () => {
    it('reports usage and exposes the same inventory as CSV and auditable references', () => {
        /** @type {string[]} */
        const output = [];
        expect(main([], (s) => output.push(s))).toBe(2);
        expect(main(['--unknown'], (s) => output.push(s))).toBe(2);
        expect(main(['--metrics'], (s) => output.push(s))).toBe(0);
        expect(output[2]).toBe(
            inventory()
                .map((t) => t.metric)
                .join(','),
        );
        expect(main(['--references'], (s) => output.push(s))).toBe(0);
        expect(JSON.parse(output[3])).toEqual(inventory());
    });

    it('refuses stale source evidence and readings without every requested arm size or watch metrics', () => {
        const source = '{"seeds":[1,2]}';
        const power = {
            source: { sha256: createHash('sha256').update(source).digest('hex') },
            includeWatch: true,
            sizes: [16, 32, 64],
        };
        expect(() => validateEvidence(power, source)).not.toThrow();
        expect(() => validateEvidence(power, source + ' ')).toThrow('source hash');
        expect(() => validateEvidence({ ...power, sizes: [16, 32] }, source)).toThrow('arm sizes');
        expect(() => validateEvidence({ ...power, includeWatch: false }, source)).toThrow('include-watch');
    });

    it('checks the committed E210 table without mutating shared files', () => {
        expect(main(['--check'])).toBe(0);
    });
});
