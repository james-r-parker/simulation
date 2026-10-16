import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// Git exports GIT_DIR and friends to hooks; a child process that inherits them could act on the wrong repo.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
const TIMEOUT_MS = 120_000;

describe('step allocation', () => {
    it(
        'grows the heap by under 1 MB over 1000 steady-state ticks',
        () => {
            const result = spawnSync('node', ['--expose-gc', 'scripts/alloc-check.mjs'], {
                encoding: 'utf8',
                env: ENV,
            });
            expect(result.stdout + result.stderr).toContain('alloc-check');
            expect(result.status).toBe(0);
        },
        TIMEOUT_MS,
    );
});
