// The shell of the release-check gate on this repository: it hashes the rules at the merge base in a temporary worktree,
// so it needs `origin/main` (a full checkout, as check.yml fetches).
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

/**
 * The base a pull request from this checkout targets: `season/next` when HEAD is built on it and carries work main does
 * not have (rules changes land there as breaking commits), else `main`. The gate itself runs in CI against the real base.
 * @returns {{BASE_REF: string, PR_TITLE?: string}} the environment for the run
 */
function prBase() {
    const git = (/** @type {string[]} */ args) => spawnSync('git', args).status === 0;
    const onSeason = git(['merge-base', '--is-ancestor', 'origin/season/next', 'HEAD']);
    const onMain = git(['merge-base', '--is-ancestor', 'HEAD', 'origin/main']);
    return onSeason && !onMain
        ? { BASE_REF: 'season/next', PR_TITLE: 'feat(sim)!: a rules change for the next season' }
        : { BASE_REF: 'main' };
}

describe('scripts/release-check.mjs', () => {
    it(
        'passes against the base a pull request from this checkout targets (main, or season/next on a rules branch)',
        () => {
            const done = spawnSync('node', ['scripts/release-check.mjs'], {
                encoding: 'utf8',
                env: { ...process.env, ...prBase(), GITHUB_BASE_REF: '' },
            });
            expect(done.status, done.stderr).toBe(0);
            expect(done.stdout).toContain('release-check ok');
        },
        scaleTimeout(60_000),
    );
});
