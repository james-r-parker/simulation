// reads: scripts/bench-check.mjs
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('bench-check as a script', () => {
    let dir = '';
    const argv = process.argv;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'bench-check-main-'));
        vi.resetModules();
    });
    afterEach(() => {
        process.argv = argv;
        vi.restoreAllMocks();
        rmSync(dir, { recursive: true, force: true });
    });

    /** @param {number} measured @param {string[]} flags @returns {Promise<{code: number, out: string}>} */
    async function run(measured, flags) {
        const [base, got] = [4, measured].map((ms, i) => {
            const p = join(dir, `f${i}.json`);
            writeFileSync(p, JSON.stringify({ 'bench.step_ms@500': ms }));
            return p;
        });
        process.argv = [argv[0], resolve('scripts/bench-check.mjs'), base, got, ...flags];
        const exit = vi.spyOn(process, 'exit').mockImplementation(/** @type {any} */ (() => undefined));
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        await import('../scripts/bench-check.mjs');
        return { code: Number(exit.mock.calls[0]?.[0]), out: String(log.mock.calls[0]?.[0]) };
    }

    it('exits 0 for an in-limit step and reads the load and core flags', async () => {
        const r = await run(4.1, ['--load=0.5', '--load=0.8', '--cores=32']);
        expect(r.code).toBe(0);
        expect(r.out).toContain('bench.step_ms@500');
    });

    it('exits 1 for a regression on a quiet machine', async () => {
        expect((await run(6, ['--load=0.5', '--cores=32'])).code).toBe(1);
    });

    it('exits inconclusive for a regression read on a busy machine', async () => {
        const { code } = await run(6, ['--load=14', '--cores=32']);
        const { EXIT_INCONCLUSIVE } = await import('../scripts/bench-check.mjs');
        expect(code).toBe(EXIT_INCONCLUSIVE);
    });
});
