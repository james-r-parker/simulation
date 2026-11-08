import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkMetricNames, LET_THROUGH } from '../scripts/check-metric-names.mjs';
import { isRegistered, literalUses, stringLiterals, targetUses } from '../scripts/lib/metric-names.mjs';

/** A made-up registry: one metric, one family and one renamed metric. */
const FAKE = {
    'eval.alpha': { renamedFrom: ['eval.alpha_old'] },
    'eval.family.one': { renamedFrom: [] },
    'eval.family.two': { renamedFrom: [] },
};

/** @type {string[]} */
const roots = [];
afterEach(() => {
    while (roots.length > 0) {
        rmSync(/** @type {string} */ (roots.pop()), { recursive: true, force: true });
    }
});

/**
 * @param {Record<string, string>} files file path to text
 * @returns {string} a repo root holding them and the directories the check reads
 */
function repo(files) {
    const root = mkdtempSync(join(tmpdir(), 'metric-names-'));
    roots.push(root);
    for (const dir of ['js', 'scripts', 'test', 'evals', 'docs/designs']) {
        mkdirSync(join(root, dir), { recursive: true });
    }
    for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), text);
    }
    return root;
}

/**
 * @param {Record<string, string>} files the repo's files
 * @returns {string[]} the problems for the made-up registry
 */
const problems = (files) => checkMetricNames(repo(files), { letThrough: {}, metrics: FAKE });

describe('literalUses', () => {
    it('reads names in string and template literals, not in comments', () => {
        const text = "// 'eval.in_comment'\nconst a = 'eval.alpha';\n/* eval.block */\nconst b = `eval.family.${x}`;\n";
        expect(literalUses(text)).toEqual([
            { line: 2, name: 'eval.alpha', prefix: false },
            { line: 4, name: 'eval.family.', prefix: true },
        ]);
    });

    it('leaves out a bare eval. and a file name, and finds each name of a comma list', () => {
        expect(literalUses("x('eval.' + n, 'scripts/eval.mjs', `eval.${n}`)")).toEqual([]);
        expect(literalUses("'eval.alpha,eval.family.one@16'").map((u) => u.name)).toEqual([
            'eval.alpha',
            'eval.family.one',
        ]);
    });

    it('counts the lines of a multi-line template', () => {
        expect(stringLiterals('`a\nb`;\n"c"').map((l) => l.line)).toEqual([1, 3]);
    });
});

describe('targetUses', () => {
    it('reads the Targets line of an unbuilt phase, a * or <placeholder> ending a name as a prefix', () => {
        const text = [
            '### Phase 1 - A (built)',
            '**Targets:** eval.alpha_gone',
            '### Phase 2 - B',
            '**Targets:** eval.alpha, eval.family.*, eval.family.<spec>, bench.step_ms@500.',
        ].join('\n');
        expect(targetUses(text)).toEqual([
            { line: 4, name: 'eval.alpha', prefix: false },
            { line: 4, name: 'eval.family.', prefix: true },
            { line: 4, name: 'eval.family.', prefix: true },
        ]);
    });
});

describe('isRegistered', () => {
    it('knows a name, an old name, a family base and a prefix', () => {
        const known = (/** @type {string} */ name, prefix = false) => isRegistered({ name, prefix }, FAKE);
        expect(known('eval.alpha')).toBe(true);
        expect(known('eval.alpha_old')).toBe(true);
        expect(known('eval.family')).toBe(true);
        expect(known('eval.family.', true)).toBe(true);
        expect(known('eval.alph')).toBe(false);
        expect(known('eval.other.', true)).toBe(false);
    });
});

describe('checkMetricNames', () => {
    it('passes registered names, an old name, a template prefix and a Targets family', () => {
        const files = {
            'scripts/a.mjs': "export const m = 'eval.alpha';\n",
            'test/b.test.js': "const old = 'eval.alpha_old';\nconst t = `eval.family.${x}`;\n",
            'evals/grid.json': '{"metrics": ["eval.family.one"]}\n',
            'docs/designs/d.md': '### Phase 1 - X\n**Targets:** eval.alpha, eval.family.*\n',
        };
        expect(problems(files)).toEqual([]);
    });

    it('fails an unregistered name in a script, a test, a JSON config and an unbuilt Targets line', () => {
        const found = problems({
            'scripts/a.mjs': "export const m = 'eval.missing_script';\n",
            'test/b.test.js': 'const a = 1;\nconst m = "eval.missing_test";\n',
            'evals/grid.json': '{"metrics": ["eval.missing_json"]}\n',
            'docs/designs/d.md': '### Phase 1 - X\n**Targets:** eval.alpha, eval.missing_doc\n',
        });
        expect(found).toHaveLength(4);
        expect(found[0]).toContain('scripts/a.mjs:1: eval.missing_script');
        expect(found[1]).toContain('test/b.test.js:2: eval.missing_test');
        expect(found[2]).toContain('evals/grid.json:1: eval.missing_json');
        expect(found[3]).toContain('docs/designs/d.md:2: eval.missing_doc');
    });

    it('fails a template prefix that starts no name', () => {
        expect(problems({ 'js/a.js': 'const k = `eval.missing.${x}`;\n' })).toHaveLength(1);
    });

    it('does not read the history: built Targets, experiments.json, results, fixtures and the registry itself', () => {
        const files = {
            'docs/designs/d.md': '### Phase 1 - X (built)\n**Targets:** eval.missing_doc\n',
            'evals/experiments.json': '{"metric": "eval.missing_json"}\n',
            'evals/results/r.json': '{"metric": "eval.missing_json"}\n',
            'test/fixtures/f.js': "export const m = 'eval.missing_fixture';\n",
            'js/evo/metric-registry/core.js': "export const m = 'eval.missing_registry';\n",
        };
        expect(problems(files)).toEqual([]);
    });

    it('lets a listed name through, and reports it once the registry holds it', () => {
        const root = repo({ 'scripts/a.mjs': "export const m = 'eval.planned';\n" });
        expect(checkMetricNames(root, { letThrough: { 'eval.planned': 'planned' }, metrics: FAKE })).toEqual([]);
        const stale = checkMetricNames(root, { letThrough: { 'eval.alpha': 'now built' }, metrics: FAKE });
        expect(stale.some((p) => p.includes('eval.alpha is in the registry now'))).toBe(true);
    });

    it('holds for this repo, with a reason for every name let through', () => {
        expect(checkMetricNames()).toEqual([]);
        for (const reason of Object.values(LET_THROUGH)) {
            expect(reason.length).toBeGreaterThan(10);
        }
    });
});
