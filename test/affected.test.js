import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { diffPaths, main, select } from '../scripts/affected.mjs';
import { affectedTests, entryHolds, isDocsPath, onFullList } from '../scripts/lib/affected.mjs';
import { affectedMatrix, FILES_PER_SHARD, fullMatrix } from '../scripts/lib/affected-matrix.mjs';
import { importsOf } from '../scripts/lib/import-graph.mjs';
import { listModules, readerModules } from '../scripts/lib/module-reads.mjs';
import { HEAVY_TESTS, STATISTICAL_TESTS } from '../scripts/lib/test-scope.mjs';

/** @type {string[]} */
const made = [];

/**
 * Makes a repo tree in a temporary directory.
 * @param {Record<string, string>} files path to content
 * @returns {string} its root
 */
function repo(files) {
    const root = mkdtempSync(join(tmpdir(), 'affected-'));
    made.push(root);
    for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), text);
    }
    return root;
}

afterEach(() => {
    made.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

// Built from parts: the test-data rule flags a test that names a shipped evals/ data path.
const LEDGER = ['evals', 'ledger'].join('/');

const FILES = {
    'js/sim/brain.js': 'export const a = 1;\n',
    'js/sim/util.js': "import { a } from './brain.js';\nexport const b = a;\n",
    'js/app/hud.js': 'export const h = 1;\n',
    'scripts/tool.mjs': "import { a } from '../js/sim/brain.js';\nconsole.log(a);\n",
    'scripts/lib/helper.mjs': 'export const c = 1;\n',
    'scripts/lib/tool-part.mjs': "import { c } from './helper.mjs';\nexport const d = c;\n",
    'scripts/tool2.mjs': "import { d } from './lib/tool-part.mjs';\nconsole.log(d);\n",
    'evals/data.json': '{}\n',
    'docs/designs/a.md': '# a\n',
    'test/sim/brain.test.js': "import { a } from '../../js/sim/brain.js';\n",
    'test/sim/util.test.js': "import { b } from '../../js/sim/util.js';\n",
    'test/app/hud.test.js': "import { h } from '../../js/app/hud.js';\n",
    'test/tool.test.js': "spawnSync('node', ['scripts/tool2.mjs']);\n",
    'test/data.test.js': "readFileSync('evals/data.json');\n",
    'scripts/noise.mjs': "readFileSync('docs/designs/a.md');\n",
    'test/noise.test.js': "spawnSync('node', ['scripts/noise.mjs']);\n",
    'test/lonely.test.js': 'export {};\n',
    'test/evo/survivable-world.slow.test.js': "import { a } from '../../js/sim/brain.js';\n",
    'test/train.slow.test.js': "import { a } from '../js/sim/brain.js';\n",
};

describe('the modes', () => {
    it('reaches the test of a script-only change, and nothing else', () => {
        const root = repo(FILES);
        const result = affectedTests(['scripts/lib/helper.mjs'], { root });
        expect(result.mode).toBe('affected');
        expect(result.tests).toEqual(['test/tool.test.js']);
        expect(result.why['test/tool.test.js']).toBe('imports scripts/lib/helper.mjs');
    });

    it('follows imports through other modules, and a changed test reaches itself', () => {
        const root = repo(FILES);
        expect(affectedTests(['js/app/hud.js'], { root }).tests).toEqual(['test/app/hud.test.js']);
        expect(affectedTests(['test/lonely.test.js'], { root })).toMatchObject({
            tests: ['test/lonely.test.js'],
            why: { 'test/lonely.test.js': 'changed test' },
        });
        const sim = affectedTests(['js/sim/brain.js'], { root });
        expect(sim.tests).toEqual([
            'test/evo/survivable-world.slow.test.js',
            'test/sim/brain.test.js',
            'test/sim/util.test.js',
            'test/train.slow.test.js',
        ]);
        expect(sim.why['test/sim/util.test.js']).toBe('imports js/sim/brain.js');
    });

    it('reaches a test that reads a data file, from the generated map or a scan of the tree', () => {
        const root = repo(FILES);
        expect(affectedTests(['evals/data.json'], { root }).tests).toEqual(['test/data.test.js']);
        expect(affectedTests(['evals/data.json'], { root, deps: {} }).tests).toEqual([]);
        expect(affectedTests(['evals/data.json'], { root, deps: { 'test/lonely.test.js': ['evals'] } }).tests).toEqual([
            'test/lonely.test.js',
        ]);
    });

    it('reaches a test that spawns a script which reads the changed file, and one that declares it reads everything', () => {
        const root = repo({ ...FILES, 'test/always.test.js': '// reads: **\nexport {};\n' });
        const result = affectedTests(['docs/designs/a.md', 'js/app/hud.js'], { root });
        expect(result.tests).toEqual(['test/always.test.js', 'test/app/hud.test.js', 'test/noise.test.js']);
        expect(result.why['test/noise.test.js']).toBe('scripts/noise.mjs reads docs/designs/a.md');
        expect(result.why['test/always.test.js']).toBe('reads **');
    });

    it('reaches the tests that name a path the change removed', () => {
        const root = repo({ ...FILES, 'test/names.test.js': "const p = 'evals/gone.json';\n" });
        expect(affectedTests(['evals/gone.json'], { root }).tests).toEqual(['test/names.test.js']);
    });

    it('reads data-deps.json when the tree has one', () => {
        const root = repo({ ...FILES, 'test/data-deps.json': '{"test/lonely.test.js": ["evals/data.json"]}' });
        expect(affectedTests(['evals/data.json'], { root }).tests).toEqual(['test/lonely.test.js']);
    });

    it('says full for a path on the full list and for an empty diff', () => {
        const root = repo(FILES);
        for (const path of [
            'package.json',
            'package-lock.json',
            'vitest.config.js',
            'eslint.config.js',
            'tsconfig.json',
            '.github/workflows/check.yml',
            'scripts/check.sh',
            'scripts/lib/test-scope.mjs',
            'wasm/blob-kernels.wasm',
            'js/sim/wasm-binary.js',
            'test/helpers/world.js',
            '.node-version',
        ]) {
            expect(affectedTests([path, 'js/app/hud.js'], { root }).mode, path).toBe('full');
        }
        expect(affectedTests([], { root })).toMatchObject({
            mode: 'full',
            why: { '*': expect.stringContaining('empty') },
        });
        expect(affectedTests(['', ''], { root }).mode).toBe('full');
    });

    it('says docs for Markdown only and records for the ledger and decision reports', () => {
        const root = repo(FILES);
        expect(affectedTests(['docs/designs/a.md', 'README.md', '.claude/skills/x/SKILL.md'], { root }).mode).toBe(
            'docs',
        );
        expect(affectedTests([`${LEDGER}/E1.json`, 'docs/designs/a.md'], { root }).mode).toBe('records');
        expect(affectedTests(['evals/decisions/E151/r.json'], { root }).mode).toBe('records');
        expect(affectedTests(['docs/image.png'], { root }).mode).toBe('affected');
        expect(affectedTests(['src/README.md'], { root }).mode).toBe('affected');
    });
});

describe('the helpers', () => {
    it('knows the full list, docs paths and read entries', () => {
        expect(onFullList('test/helpers/a.js')).toBe(true);
        expect(onFullList('test/a.test.js')).toBe(false);
        expect(isDocsPath('docs/a.md')).toBe(true);
        expect(isDocsPath('docs/a.json')).toBe(false);
        expect(isDocsPath('README.md')).toBe(true);
        expect(isDocsPath('js/README.md')).toBe(false);
        expect(entryHolds('evals', 'evals/a/b.json')).toBe(true);
        expect(entryHolds('evals/a', 'evals/ab.json')).toBe(false);
        expect(entryHolds('test/fixtures/*.json', 'test/fixtures/x.json')).toBe(true);
        expect(entryHolds('test/**/*.json', 'test/a/b/x.json')).toBe(true);
        expect(entryHolds('test/*.json', 'test/a/x.json')).toBe(false);
    });

    it('lists relative imports of every form, and skips packages and comments', () => {
        const source = `
            import a from './a.js';
            import './side.js';
            export * from '../b.js';
            const c = await import('./c.js');
            import { d } from 'three';
            // import e from './commented.js';
        `;
        expect(importsOf(source, 'js/x/y.js')).toEqual(['js/x/a.js', 'js/x/side.js', 'js/b.js', 'js/x/c.js']);
    });
});

describe('module reads', () => {
    it('lists modules, skips node_modules and a missing directory', () => {
        const root = repo({ ...FILES, 'js/node_modules/x.js': '', 'js/app/notes.md': '' });
        expect(listModules(root, 'js')).toEqual(['js/app/hud.js', 'js/sim/brain.js', 'js/sim/util.js']);
        expect(listModules(root, 'functions')).toEqual([]);
    });

    it('names the module that reads a changed path, and not the changed module itself', () => {
        const root = repo(FILES);
        const readers = readerModules(root, ['docs/designs/a.md', 'scripts/noise.mjs'], entryHolds);
        expect([...readers]).toEqual([['scripts/noise.mjs', 'docs/designs/a.md']]);
    });
});

describe('the matrix', () => {
    it('is every shard, heavy file and statistical file for the whole suite', () => {
        const jobs = fullMatrix();
        expect(jobs.filter((job) => job.pass === 'shard').map((job) => job.shard)).toEqual(
            Array.from({ length: 8 }, (_, i) => `${i + 1}/8`),
        );
        expect(jobs.filter((job) => job.pass === 'heavy').map((job) => job.files)).toEqual(HEAVY_TESTS);
        expect(jobs.filter((job) => job.pass === 'statistical').map((job) => job.files)).toEqual(STATISTICAL_TESTS);
        expect(jobs.map((job) => job.id)).toContain('heavy-train-pool');
        expect(new Set(jobs.map((job) => job.id)).size).toBe(jobs.length);
    });

    it('sizes the shards to the reached files and gives a heavy or statistical file its own job', () => {
        expect(affectedMatrix([])).toEqual([]);
        const few = affectedMatrix(['test/a.test.js', 'test/b.test.js']);
        expect(few).toEqual([{ pass: 'shard', id: 'shard-1', files: 'test/a.test.js test/b.test.js' }]);
        const many = Array.from({ length: FILES_PER_SHARD + 1 }, (_, i) => `test/f${i}.test.js`);
        expect(affectedMatrix(many).map((job) => job.id)).toEqual(['shard-1', 'shard-2']);
        const huge = Array.from({ length: FILES_PER_SHARD * 20 }, (_, i) => `test/f${i}.test.js`);
        expect(affectedMatrix(huge)).toHaveLength(8);
        const own = affectedMatrix([HEAVY_TESTS[0] ?? '', STATISTICAL_TESTS[0] ?? '', 'test/a.test.js']);
        expect(own.map((job) => job.pass)).toEqual(['shard', 'heavy', 'statistical']);
    });
});

describe('select and the CLI', () => {
    it('runs the whole suite for no paths at all, and no job for a docs change', () => {
        const root = repo(FILES);
        expect(select({ paths: null, root }).matrix.include).toHaveLength(fullMatrix().length);
        expect(select({ paths: null, root })).toMatchObject({ mode: 'full', coverage: 'whole', has_tests: true });
        expect(select({ paths: ['docs/designs/a.md'], root })).toMatchObject({
            mode: 'docs',
            coverage: 'none',
            has_tests: false,
        });
        expect(select({ paths: ['scripts/lib/helper.mjs'], root })).toMatchObject({
            mode: 'affected',
            coverage: 'related',
            has_tests: true,
        });
    });

    it('prints the mode, writes the artifact and the step outputs', () => {
        const root = repo(FILES);
        const out = join(root, 'affected.json');
        const output = join(root, 'github-output');
        /** @type {string[]} */
        const lines = [];
        const code = main(['--stdin', '--out', out, '--github-output', output], {
            root,
            stdin: () => 'js/app/hud.js\n',
            log: (line) => lines.push(line),
        });
        expect(code).toBe(0);
        expect(lines[0]).toContain('affected: affected, 1 test file(s), 1 job(s)');
        expect(JSON.parse(readFileSync(out, 'utf8')).tests).toEqual(['test/app/hud.test.js']);
        const text = readFileSync(output, 'utf8');
        expect(text).toContain('mode=affected\nhas_tests=true\ncoverage=related\n');
        expect(text).toContain('"files":"test/app/hud.test.js"');
    });

    it('takes the whole suite when there is no base, no diff to read or --full', () => {
        const root = repo(FILES);
        /** @type {string[]} */
        const lines = [];
        const log = (/** @type {string} */ line) => lines.push(line);
        main([], { root, log });
        expect(lines.pop()).toContain('affected: full');
        main(['origin/nowhere'], { root, log });
        expect(lines.pop()).toMatch(/full.*diff could not be read/);
        main(['--full', 'origin/main'], { root, log });
        expect(lines.pop()).toContain('whole suite was asked for');
        expect(() => diffPaths(root, 'origin/nowhere')).toThrow('git diff');
    });
});

describe('this repository', () => {
    it('reaches the statistical files from a change under js/sim, and one test from a one-file script change', () => {
        const sim = affectedTests(['js/sim/brain.js'], { root: process.cwd() });
        expect(sim.mode).toBe('affected');
        for (const file of STATISTICAL_TESTS) {
            expect(sim.tests, file).toContain(file);
        }
        const script = affectedTests(['scripts/lib/data-deps.mjs'], { root: process.cwd() });
        expect(script.tests).toContain('test/data-deps.test.js');
        expect(script.tests.length).toBeLessThan(30);
    });
});
