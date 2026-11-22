import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sharedLockCommand } from '../scripts/lib/cpu-lock.mjs';
import { claimWorkers, pickWorkers, readLeases, releaseWorkers } from '../scripts/lib/test-workers.mjs';

describe('pickWorkers', () => {
    const base = { cores: 32, flying: [], leases: [] };

    it('takes the free budget (24 of 32 cores), less other claims and leases, at least 1', () => {
        expect(pickWorkers({ ...base, env: {} })).toBe(24);
        expect(pickWorkers({ ...base, env: {}, flying: [{ workers: 16 }] })).toBe(8);
        expect(pickWorkers({ ...base, env: {}, leases: [{ workers: 20 }] })).toBe(4);
        expect(pickWorkers({ ...base, env: {}, flying: [{ workers: 24 }] })).toBe(1);
    });

    it('lets TEST_MAX_WORKERS override and leaves CI uncapped', () => {
        expect(pickWorkers({ ...base, env: { TEST_MAX_WORKERS: '3' }, flying: [{ workers: 24 }] })).toBe(3);
        expect(pickWorkers({ ...base, env: { CI: 'true' } })).toBeNull();
        expect(pickWorkers({ ...base, env: { CI: 'true', TEST_MAX_WORKERS: '2' } })).toBe(2);
    });

    it('ignores a bad override', () => {
        expect(pickWorkers({ ...base, env: { TEST_MAX_WORKERS: '0' } })).toBe(24);
        expect(pickWorkers({ ...base, env: { TEST_MAX_WORKERS: 'x' } })).toBe(24);
    });
});

describe('sharedLockCommand', () => {
    it('wraps the command in a shared flock, unless the caller holds the lock', () => {
        const input = { lockPath: '/l', command: 'npx', args: ['vitest'] };
        expect(sharedLockCommand(input)).toEqual({ command: 'flock', args: ['-s', '/l', 'npx', 'vitest'] });
        expect(sharedLockCommand({ ...input, env: { CHECK_CPU_LOCK_HELD: '1' } }).command).toBe('npx');
        expect(sharedLockCommand({ ...input, env: { CHECK_CPU_LOCK: 'off' } }).command).toBe('npx');
    });
});

describe('leases', () => {
    /** @type {string} */
    let dir;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'leases-'));
        process.env.TEST_LEASE_DIR = dir;
    });
    afterEach(() => {
        delete process.env.TEST_LEASE_DIR;
        rmSync(dir, { recursive: true, force: true });
    });

    it('drops the lease of a dead process and keeps a live one', () => {
        writeFileSync(join(dir, '1.json'), JSON.stringify({ pid: 1, workers: 4 }));
        writeFileSync(join(dir, '2.json'), JSON.stringify({ pid: 2, workers: 6 }));
        expect(readLeases(dir, (pid) => pid === 1)).toEqual([{ pid: 1, workers: 4 }]);
        expect(readLeases(dir, () => false)).toEqual([]);
    });

    it('a claim records a lease that the next claim subtracts, and release frees it', () => {
        const env = { TEST_MAX_WORKERS: '', CI: '' };
        const first = claimWorkers(process.pid, { root: dir, env });
        expect(first).toBeGreaterThanOrEqual(1);
        expect(readLeases(dir)).toEqual([{ pid: process.pid, workers: first }]);
        releaseWorkers(process.pid);
        expect(readLeases(dir)).toEqual([]);
    });
});
