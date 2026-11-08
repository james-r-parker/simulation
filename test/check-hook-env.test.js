// Git exports GIT_DIR and GIT_INDEX_FILE to the pre-commit hook. check.sh keeps them for the staged-file read and the
// conventions gate (both read the index being committed) and takes them out of the test runner's environment, so a
// test that spawns git cannot write the hook's index (docs/designs/sim-notes.md, 2026-11-08).
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

const CLEAN = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
    CHECK_CPU_LOCK: 'off',
};
const HOOK_VARS = ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE'];

/**
 * @param {string} path the script to write
 * @param {string} out the file it appends its name and git variables to
 */
function recorder(path, out) {
    const vars = HOOK_VARS.map((name) => `${name}=\${${name}-unset}`).join(' ');
    writeFileSync(path, `#!/usr/bin/env bash\necho "$(basename "$0") ${vars} args=$*" >> "${out}"\nexit 0\n`, {
        mode: 0o755,
    });
}

/**
 * Builds a repository with check.sh, recording stand-ins for every tier 1 tool and one staged .js file.
 * @returns {{repo: string, out: string, git: (...args: string[]) => void}} the repository, the record file and git
 */
function hookRepo() {
    const repo = mkdtempSync(join(tmpdir(), 'check-hook-env-'));
    const out = join(repo, 'calls.txt');
    const git = (/** @type {string[]} */ ...args) => {
        spawnSync('git', args, { cwd: repo, env: CLEAN });
    };
    mkdirSync(join(repo, 'scripts/lib'), { recursive: true });
    mkdirSync(join(repo, 'node_modules/.bin'), { recursive: true });
    copyFileSync(resolve('scripts/check.sh'), join(repo, 'scripts/check.sh'));
    copyFileSync(resolve('scripts/lib/cpu-lock.sh'), join(repo, 'scripts/lib/cpu-lock.sh'));
    recorder(join(repo, 'scripts/check-conventions.sh'), out);
    for (const tool of ['prettier', 'eslint', 'vitest']) {
        recorder(join(repo, 'node_modules/.bin', tool), out);
    }
    writeFileSync(join(repo, '.gitignore'), 'node_modules/\ncalls.txt\n.checklogs/\n');
    git('init', '-q');
    git('add', '.');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'base');
    writeFileSync(join(repo, 'staged.js'), 'x\n');
    git('add', 'staged.js');
    return { repo, out, git };
}

/**
 * @param {string} out the record file
 * @param {string} tool a recorded tool's name
 * @returns {string} its first recorded call
 */
function callOf(out, tool) {
    const line = readFileSync(out, 'utf8')
        .split('\n')
        .find((l) => l.startsWith(`${tool} `));
    expect(line, `${tool} was not run`).toBeDefined();
    return /** @type {string} */ (line);
}

describe('check.sh under a git hook environment', { timeout: scaleTimeout(30_000) }, () => {
    it('runs the related tests without the hook git variables, and conventions with them', () => {
        const { repo, out } = hookRepo();
        try {
            const gitDir = join(repo, '.git');
            const index = join(gitDir, 'index');
            const env = { ...CLEAN, GIT_DIR: gitDir, GIT_INDEX_FILE: index, GIT_WORK_TREE: repo };
            const result = spawnSync('bash', ['scripts/check.sh', '--tier', '1'], { cwd: repo, encoding: 'utf8', env });
            expect(result.status, result.stdout + result.stderr).toBe(0);

            const vitest = callOf(out, 'vitest');
            expect(vitest).toContain('args=related --run --passWithNoTests staged.js');
            for (const name of HOOK_VARS) {
                expect(vitest).toContain(`${name}=unset`);
            }
            expect(callOf(out, 'check-conventions.sh')).toContain(`GIT_INDEX_FILE=${index}`);
        } finally {
            rmSync(repo, { recursive: true, force: true });
        }
    });

    it('runs the full test gate without them', () => {
        const dir = mkdtempSync(join(tmpdir(), 'check-hook-env-'));
        try {
            const out = join(dir, 'calls.txt');
            const fake = join(dir, 'vitest');
            recorder(fake, out);
            const env = {
                ...CLEAN,
                GIT_DIR: join(dir, 'git'),
                GIT_INDEX_FILE: join(dir, 'index'),
                VITEST_BIN: fake,
                TEST_SEED: '1',
                CHECK_LOG_DIR: join(dir, 'logs'),
            };
            spawnSync('scripts/check.sh', ['--only=test'], { encoding: 'utf8', env });
            const vitest = callOf(out, 'vitest');
            for (const name of HOOK_VARS) {
                expect(vitest).toContain(`${name}=unset`);
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
