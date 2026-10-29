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
