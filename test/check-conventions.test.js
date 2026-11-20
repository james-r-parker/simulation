import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

// Git exports GIT_DIR, GIT_INDEX_FILE and friends to hooks; a child git that inherits them acts on this repo.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

/**
 * Runs scripts/check-conventions.sh in a temporary repo that tracks the given files.
 * @param {Record<string, string | Buffer>} files path to content
 * @returns {string} the script's output
 */
function conventions(files) {
    const repo = mkdtempSync(join(tmpdir(), 'conventions-'));
    try {
        mkdirSync(join(repo, 'scripts'));
        copyFileSync(resolve('scripts/check-conventions.sh'), join(repo, 'scripts/check-conventions.sh'));
        for (const [path, content] of Object.entries(files)) {
            mkdirSync(join(repo, path, '..'), { recursive: true });
            writeFileSync(join(repo, path), content);
        }
        /** @param {...string} args git arguments */
        const git = (...args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8', env: ENV });
        git('init', '-q');
        git('add', '-A');
        const result = spawnSync('bash', ['scripts/check-conventions.sh'], { cwd: repo, encoding: 'utf8', env: ENV });
        return result.stdout;
    } finally {
        rmSync(repo, { recursive: true, force: true });
    }
}

/** @param {string} text a line to wrap in two ordinary lines */
const marker = (text) => `before\n${text}\nafter\n`;

describe('conventions conflict markers', { timeout: scaleTimeout(30_000) }, () => {
    it.each([
        ['ours', `${'<'.repeat(7)} HEAD`],
        ['base', `${'|'.repeat(7)} parent of abc1234`],
        ['theirs', `${'>'.repeat(7)} abc1234`],
        ['separator', '='.repeat(7)],
    ])('flags the %s marker in a tracked text file', (_name, line) => {
        expect(conventions({ 'docs/a.md': marker(line) })).toContain('docs/a.md:2 - merge conflict marker');
    });

    it('leaves a longer rule line and an indented marker alone', () => {
        const out = conventions({ 'docs/a.md': marker(`${'='.repeat(8)}\n  ${'<'.repeat(7)} x\n${'='.repeat(7)} x`) });
        expect(out).not.toContain('merge conflict marker');
    });

    it('skips binary files and node_modules', () => {
        const binary = Buffer.concat([Buffer.from([0, 1, 2, 0]), Buffer.from(`\n${'='.repeat(7)}\n`)]);
        const out = conventions({ 'bin.dat': binary, 'node_modules/x/readme.md': marker('='.repeat(7)) });
        expect(out).not.toContain('merge conflict marker');
    });
});

describe('conventions flag ledger', { timeout: scaleTimeout(30_000) }, () => {
    const STUB = 'scripts/check-flag-ledger.mjs';

    it('reports each line the ledger check prints as a violation', () => {
        const out = conventions({
            [STUB]: "console.log('flag-ledger: mode: a boolean or enum rule with no ledger entry');\nprocess.exitCode = 1;\n",
        });
        expect(out).toContain('flag-ledger: mode: a boolean or enum rule with no ledger entry');
    });

    it('reports a check that fails without printing anything', () => {
        const out = conventions({ [STUB]: 'process.exitCode = 3;\n' });
        expect(out).toContain('flag-ledger: scripts/check-flag-ledger.mjs exited 3 with no output');
    });

    it('stays quiet when the check passes', () => {
        expect(conventions({ [STUB]: '' })).not.toContain('flag-ledger');
    });
});

describe('conventions metric names', { timeout: scaleTimeout(30_000) }, () => {
    const STUB = 'scripts/check-metric-names.mjs';

    it('reports each line the name check prints as a violation', () => {
        const out = conventions({
            [STUB]: "console.log('js/a.js:3: eval.nope is not a registered metric');\nprocess.exitCode = 1;\n",
        });
        expect(out).toContain('metric-names: js/a.js:3: eval.nope is not a registered metric');
    });

    it('reports a check that fails without printing anything', () => {
        const out = conventions({ [STUB]: 'process.exitCode = 3;\n' });
        expect(out).toContain('metric-names: scripts/check-metric-names.mjs exited 3 with no output');
    });

    it('stays quiet when the check passes', () => {
        expect(conventions({ [STUB]: '' })).not.toContain('metric-names');
    });
});

describe('conventions metrics doc', { timeout: scaleTimeout(30_000) }, () => {
    const STUB = 'scripts/metrics-doc.mjs';

    it('reports a stale doc with the command that fixes it', () => {
        const out = conventions({
            [STUB]: "console.error('docs/designs/metrics.md is stale. Run: node scripts/metrics-doc.mjs --write');\nprocess.exitCode = 1;\n",
        });
        expect(out).toContain(
            'metrics-doc: docs/designs/metrics.md is stale. Run: node scripts/metrics-doc.mjs --write',
        );
    });

    it('reports a check that fails without printing anything', () => {
        expect(conventions({ [STUB]: 'process.exitCode = 3;\n' })).toContain(
            'metrics-doc: scripts/metrics-doc.mjs exited 3 with no output',
        );
    });

    it('stays quiet when the doc is up to date', () => {
        expect(conventions({ [STUB]: "console.log('up to date');\n" })).not.toContain('metrics-doc');
    });
});

describe('conventions scene scorecard', { timeout: scaleTimeout(30_000) }, () => {
    const STUB = 'scripts/scene-scorecard.mjs';

    it('reports a stale scorecard with the command that fixes it', () => {
        const out = conventions({
            [STUB]: "console.error('docs/scene-scorecard.md is stale. Run: node scripts/scene-scorecard.mjs --write');\nprocess.exitCode = 1;\n",
        });
        expect(out).toContain(
            'scene-scorecard: docs/scene-scorecard.md is stale. Run: node scripts/scene-scorecard.mjs --write',
        );
    });

    it('reports a check that fails without printing anything', () => {
        expect(conventions({ [STUB]: 'process.exitCode = 3;\n' })).toContain(
            'scene-scorecard: scripts/scene-scorecard.mjs exited 3 with no output',
        );
    });

    it('stays quiet when the scorecard is up to date', () => {
        expect(conventions({ [STUB]: "console.log('up to date');\n" })).not.toContain('scene-scorecard');
    });
});

describe('conventions legacy guard', { timeout: scaleTimeout(30_000) }, () => {
    it('flags a file directly under js/ but not one in a module directory', () => {
        expect(conventions({ 'js/game.js': 'x\n' })).toContain('js/game.js: sits directly under js/');
        expect(conventions({ 'js/app/main.js': 'x\n' })).not.toContain('directly under js/');
    });

    it.each(['legacy.html', 'js/constants/agents.js', 'js/dev/perf-probe.js', 'public/database-worker.js'])(
        'flags the recreated legacy path %s',
        (path) => {
            expect(conventions({ [path]: 'x\n' })).toContain(`${path}: a deleted legacy path came back`);
        },
    );

    it('flags the word legacy in AGENTS.md, README.md and a skill', () => {
        const out = conventions({
            'AGENTS.md': 'ok\nthe legacy app\n',
            'README.md': 'The Legacy build\n',
            '.claude/skills/x/SKILL.md': 'legacy wording\n',
        });
        expect(out).toContain('AGENTS.md:2: the word "legacy"');
        expect(out).toContain('README.md:1: the word "legacy"');
        expect(out).toContain('.claude/skills/x/SKILL.md:1: the word "legacy"');
    });

    it('allows the word legacy on a line that links the audit or the recorded baseline', () => {
        const out = conventions({
            'AGENTS.md': 'See [legacy-audit.md](docs/designs/legacy-audit.md) for the old app\n',
            'README.md': 'Before: `bench/legacy-baseline.json`\n',
        });
        expect(out).not.toContain('the word "legacy"');
    });
});

describe('conventions checks that read every file in one pass', { timeout: scaleTimeout(30_000) }, () => {
    it('flags a browser global in a sim file with its file and line, but not in a comment', () => {
        const out = conventions({
            'js/sim/a.js': 'export const a = 1;\nexport const b = Math.random();\n',
            'js/evo/b.js': '// Date.now is never used here\nexport const c = performance.now();\n',
            'js/sim/c.js': 'export const d = 2;\n',
        });
        expect(out).toContain('js/sim/a.js:2: export const b = Math.random(); - the headless sim never uses');
        expect(out).toContain('js/evo/b.js:2: export const c = performance.now(); - the headless sim never uses');
        expect(out).not.toContain('js/evo/b.js:1:');
        expect(out).not.toMatch(/js\/sim\/c\.js:\d+:/);
    });

    it('flags a tracked file over 5 MB and no smaller one', () => {
        const out = conventions({
            'media/big.bin': Buffer.alloc(6 * 1024 * 1024),
            'media/small file.bin': Buffer.alloc(1024),
        });
        expect(out).toContain('media/big.bin: 6 MB - tracked files stay under 5 MB');
        expect(out).not.toContain('small file.bin');
    });
});

describe('conventions agents-size', { timeout: scaleTimeout(30_000) }, () => {
    it('flags an AGENTS.md over 16000 bytes with its size', () => {
        const out = conventions({ 'AGENTS.md': 'x'.repeat(16_001) });
        expect(out).toContain('AGENTS.md: 16001 bytes - it stays at or under 16000');
    });

    it('accepts an AGENTS.md at exactly 16000 bytes', () => {
        expect(conventions({ 'AGENTS.md': 'x'.repeat(16_000) })).not.toContain('AGENTS.md: ');
    });
});

describe('conventions test-data', { timeout: scaleTimeout(30_000) }, () => {
    /**
     * @param {string} line a line of test code
     * @param {string} [path] the file that holds it
     * @returns {string} the conventions output for a repo with that file
     */
    const run = (line, path = 'test/a.test.js') => conventions({ [path]: `${line}\n` });

    it.each([
        "readFileSync('evals/train-tune.json', 'utf8')",
        "readFileSync('evals/train-ladder.json', 'utf8')",
        "readFileSync('evals/train-ladder-adaptive.json', 'utf8')",
        "parseArgs(['--curriculum', 'evals/train-curriculum-iter2-a.json'])",
        "readFileSync(`evals/stages/${name}.json`, 'utf8')",
        "readdirSync('evals/train-screens')",
        "readFileSync('evals/ledger/E250.json', 'utf8')",
        "const FILES = readdirSync('evals').filter((f) => /^train-curriculum.*\\.json$/.test(f));",
    ])('flags a test that reads %s', (line) => {
        const out = run(line);
        expect(out).toContain('test/a.test.js:1');
        expect(out).toContain('test-data');
    });

    it('flags it in a nested slow test as well', () => {
        expect(run("read('evals/stages/hunt.json')", 'test/evo/b.slow.test.js')).toContain('test-data');
    });

    it('lets a *.shipped.test.js and a *.shipped.slow.test.js read the shipped files', () => {
        expect(run("read('evals/train-ladder.json')", 'test/a.shipped.test.js')).not.toContain('test-data');
        expect(run("read('evals/stages/hunt.json')", 'test/evo/b.shipped.slow.test.js')).not.toContain('test-data');
    });

    it('lets a test read a frozen copy under test/fixtures/ and skips comment lines', () => {
        expect(run("read('test/fixtures/train-ladder.json')")).not.toContain('test-data');
        expect(run("read('../fixtures/train-curriculum.json')")).not.toContain('test-data');
        expect(run('// evals/train-ladder.json is the shipped ladder')).not.toContain('test-data');
        expect(run(' * reads evals/stages/hunt.json')).not.toContain('test-data');
    });

    it('leaves the other evals/ files and non-test files alone', () => {
        expect(run("read('evals/micro-world.json')")).not.toContain('test-data');
        expect(run("read('evals/seeds.json')")).not.toContain('test-data');
        expect(conventions({ 'scripts/x.mjs': "read('evals/train-ladder.json')\n" })).not.toContain('test-data');
    });
});
