import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

const LIB = resolve('scripts/lib/cpu-lock.sh');
const ENV = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_') && !key.startsWith('CHECK_CPU_LOCK')),
);

let dir = '';
/** @type {string} */
let lock = '';
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cpu-lock-'));
    lock = join(dir, 'x.lock');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/**
 * Runs a bash snippet with `with_cpu_lock` loaded.
 * @param {string} snippet the bash to run after sourcing the library
 * @param {Record<string, string>} [env] extra environment
 * @returns {{status: number | null, stdout: string, stderr: string, ms: number}} the outcome
 */
function run(snippet, env = {}) {
    const start = Date.now();
    const r = spawnSync('bash', ['-c', `source "${LIB}"; ${snippet}`], {
        encoding: 'utf8',
        env: { ...ENV, CHECK_CPU_LOCK: lock, ...env },
    });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, ms: Date.now() - start };
}

/**
 * Holds the lock from another process for `seconds`, returning once it is held.
 * @param {number} seconds how long
 * @returns {Promise<void>} resolves when the holder owns the lock
 */
function hold(seconds) {
    return new Promise((done) => {
        const child = spawn('flock', [lock, 'bash', '-c', `echo held; sleep ${seconds}`], {
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        child.stdout.once('data', () => done());
    });
}

describe('with_cpu_lock', { timeout: scaleTimeout(30_000) }, () => {
    it('runs a function and passes its exit status through', () => {
        const r = run('f() { echo ran "$1"; return 7; }; with_cpu_lock f arg');
        expect(r.stdout.trim()).toBe('ran arg');
        expect(r.status).toBe(7);
    });

    it('sets CHECK_CPU_LOCK_HELD for the command', () => {
        expect(run('with_cpu_lock bash -c \'echo "$CHECK_CPU_LOCK_HELD"\'').stdout.trim()).toBe('1');
    });

    it('waits while another process holds the lock, then runs', async () => {
        await hold(2);
        const r = run('with_cpu_lock echo done', { CHECK_CPU_LOCK_WAIT: '20' });
        expect(r.stdout.trim()).toBe('done');
        expect(r.stderr).toContain('waiting for the CPU lock');
        expect(r.ms).toBeGreaterThan(900);
    });

    it('gives up with status 75 when the wait runs out', async () => {
        await hold(4);
        const r = run('with_cpu_lock echo never', { CHECK_CPU_LOCK_WAIT: '1' });
        expect(r.status).toBe(75);
        expect(r.stdout).toBe('');
        expect(r.stderr).toContain('gave up waiting');
    });

    it('runs at once with CHECK_CPU_LOCK_HELD=1 or CHECK_CPU_LOCK=off while the lock is held', async () => {
        await hold(4);
        for (const env of [{ CHECK_CPU_LOCK_HELD: '1' }, { CHECK_CPU_LOCK: 'off' }]) {
            const r = run('with_cpu_lock echo now', env);
            expect(r.stdout.trim()).toBe('now');
            expect(r.ms).toBeLessThan(2000);
        }
    });

    it('does not wait on a lock an ancestor process holds', () => {
        const r = spawnSync(
            'flock',
            [lock, 'bash', '-c', `source "${LIB}"; CHECK_CPU_LOCK_WAIT=2 with_cpu_lock echo inside`],
            { encoding: 'utf8', env: { ...ENV, CHECK_CPU_LOCK: lock } },
        );
        expect(r.stdout.trim()).toBe('inside');
        expect(r.status).toBe(0);
    });
});
