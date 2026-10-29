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
