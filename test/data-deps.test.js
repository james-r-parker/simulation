import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { main } from '../scripts/data-deps.mjs';
import { buildDataDeps, listTests, readDataDeps } from '../scripts/lib/data-deps.mjs';
import { declaredReads, scanTest, stripComments } from '../scripts/lib/data-scan.mjs';

/** The repo paths that exist in the fixture scans below. */
const PATHS = new Set([
    'evals',
    'test/fixtures/ladder.json',
    'test/fixtures',
    'scripts/tool.mjs',
    'docs/designs/a.md',
    'js/sim/brain.js',
    'package.json',
]);
const exists = (/** @type {string} */ path) => PATHS.has(path);

describe('scanTest', () => {
    it('finds a path read by readFileSync, a spawned script and a URL', () => {
        const source = `
            import { forwardAll } from '../js/sim/brain.js';
            const a = readFileSync('test/fixtures/ladder.json', 'utf8');
            const b = spawnSync('node', ['scripts/tool.mjs']);
            const c = new URL('../scripts/tool.mjs', import.meta.url);
            const d = readFileSync('package.json');
        `;
        const { reads, blind } = scanTest(source, 'test/x.test.js', exists);
        expect(reads).toEqual(['package.json', 'scripts/tool.mjs', 'test/fixtures/ladder.json']);
        expect(blind).toEqual([]);
    });

    it('leaves out imports, vi.mock specifiers, comments and the test itself', () => {
        const source = `
            import x from 'js/sim/brain.js';
            import('js/sim/brain.js');
            vi.mock('js/sim/brain.js');
            // docs/designs/a.md is only named in a comment
            /* package.json too */
            const self = 'test/x.test.js';
        `;
        const seen = new Set([...PATHS, 'test/x.test.js']);
        expect(scanTest(source, 'test/x.test.js', (p) => seen.has(p)).reads).toEqual([]);
    });

    it('resolves join and resolve calls, and the directory part of a template', () => {
        const source = `
            const a = readFileSync(join(ROOT, 'docs', 'designs', 'a.md'));
            const b = readFileSync(\`test/fixtures/\${name}.json\`);
            const c = readdirSync(resolve('evals'));
        `;
        expect(scanTest(source, 'test/x.test.js', exists).reads).toEqual([
            'docs/designs/a.md',
            'evals',
            'test/fixtures',
        ]);
    });

    it('never counts a generated directory, which exists on some machines only', () => {
        const seen = new Set(['.checklogs', 'coverage/lcov.info', 'evals/results/x.json']);
        const source = "read('.checklogs'); read('coverage/lcov.info'); read('evals/results/x.json');";
        expect(scanTest(source, 'test/x.test.js', (p) => seen.has(p)).reads).toEqual([]);
    });

    it('does not count a bare word that happens to name a directory', () => {
        expect(scanTest("const kind = 'evals';", 'test/x.test.js', exists).reads).toEqual([]);
    });

    it('reports a path expression it cannot resolve, and the declaration clears it', () => {
        const source = 'const t = readFileSync(spec.curriculum, "utf8");';
        expect(scanTest(source, 'test/x.test.js', exists).blind).toEqual(['spec.curriculum']);
        const declared = `// reads: test/fixtures/ladder.json\n${source}`;
        const result = scanTest(declared, 'test/x.test.js', exists);
        expect(result.blind).toEqual([]);
        expect(result.reads).toContain('test/fixtures/ladder.json');
    });

    it('ignores a variable path in a test that makes its own temporary directory', () => {
        const source = 'const dir = mkdtempSync(join(tmpdir(), "x-"));\nreadFileSync(out, "utf8");';
        expect(scanTest(source, 'test/x.test.js', exists).blind).toEqual([]);
    });

    it('lets `// reads: none` declare a path that is no repo file', () => {
        const source = '// reads: none\nconst h = new URL(call[0]).host;';
        expect(scanTest(source, 'test/x.test.js', exists)).toEqual({ reads: [], blind: [] });
    });
});

describe('declarations and comments', () => {
    it('reads a comma list and drops none', () => {
        expect(declaredReads('// reads: a/b, c/*.json ,none\n// reads: d\nconst x = 1;')).toEqual([
            'a/b',
            'c/*.json',
            'd',
        ]);
    });

    it('removes line and block comments', () => {
        expect(stripComments('a\n  // b\n/* c\nd */ e')).toBe('a\n\n e');
    });
});

/**
 * Makes a small repo with two tests.
 * @returns {string} its root
 */
function fixtureRepo() {
    const root = mkdtempSync(join(tmpdir(), 'data-deps-'));
    mkdirSync(join(root, 'test/sub'), { recursive: true });
    mkdirSync(join(root, 'evals'));
    writeFileSync(join(root, 'evals/data.json'), '{}');
    writeFileSync(join(root, 'test/a.test.js'), "readFileSync('evals/data.json');\n");
    writeFileSync(join(root, 'test/sub/b.test.js'), 'const x = 1;\n');
    writeFileSync(join(root, 'test/helper.js'), 'export {};\n');
    return root;
}

describe('buildDataDeps and the CLI', () => {
    it('lists test files only, depth first and sorted, and maps those that read data', () => {
        const root = fixtureRepo();
        try {
            expect(listTests(root)).toEqual(['test/a.test.js', 'test/sub/b.test.js']);
            expect(buildDataDeps(root).deps).toEqual({ 'test/a.test.js': ['evals/data.json'] });
            expect(readDataDeps(root)).toBeNull();
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('--write makes the file, --check passes on it and fails when it goes stale', () => {
        const root = fixtureRepo();
        /** @type {string[]} */
        const lines = [];
        const out = (/** @type {string} */ line) => lines.push(line);
        try {
            expect(main(['--check'], { root, out })).toBe(1);
            expect(lines.join('\n')).toContain('stale. Run: node scripts/data-deps.mjs --write');
            expect(main(['--write'], { root, out })).toBe(0);
            expect(JSON.parse(readFileSync(join(root, 'test/data-deps.json'), 'utf8'))).toEqual({
                'test/a.test.js': ['evals/data.json'],
            });
            lines.length = 0;
            expect(main(['--check'], { root, out })).toBe(0);
            writeFileSync(join(root, 'test/sub/b.test.js'), "readFileSync('evals/data.json');\n");
            expect(main(['--check'], { root, out })).toBe(1);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('fails a test with an unresolved dynamic path and names it', () => {
        const root = fixtureRepo();
        /** @type {string[]} */
        const lines = [];
        try {
            writeFileSync(join(root, 'test/sub/b.test.js'), 'readFileSync(spec.file);\n');
            expect(main(['--write'], { root, out: (line) => lines.push(line) })).toBe(1);
            expect(lines[0]).toContain('test/sub/b.test.js: reads a path the scan cannot resolve (spec.file)');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('prints usage and exits 2 without a mode', () => {
        /** @type {string[]} */
        const lines = [];
        expect(main([], { root: '.', out: (line) => lines.push(line) })).toBe(2);
        expect(lines[0]).toContain('usage');
    });
});
