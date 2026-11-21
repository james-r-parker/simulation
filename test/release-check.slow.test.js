// The shell of the release-check gate on this repository: it hashes the rules at the merge base in a temporary worktree,
// so it needs `origin/main` (a full checkout, as check.yml fetches).
// It reads the git history, not a file, so any change can alter its result: it runs for every change.
// reads: **
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

describe('scripts/release-check.mjs', () => {
    it(
        'passes against main for this checkout',
        () => {
            const done = spawnSync('node', ['scripts/release-check.mjs'], {
                encoding: 'utf8',
                env: { ...process.env, BASE_REF: 'main', GITHUB_BASE_REF: '', PR_TITLE: '' },
            });
            expect(done.status, done.stderr).toBe(0);
            expect(done.stdout).toContain('release-check ok');
        },
        scaleTimeout(60_000),
    );
});
