import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXIT_INCONCLUSIVE, judge } from '../scripts/bench-check.mjs';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

const BASE = 4;
const SLOW = BASE * 1.3;
const QUIET = { loads: [0.5, 0.8], cores: 32 };
const BUSY = { loads: [12.5, 14], cores: 32 };

describe('judge', () => {
    it('passes in-limit steps on a quiet or busy machine', () => {
        expect(judge(BASE, BASE * 1.1, QUIET).status).toBe('pass');
        expect(judge(BASE, BASE * 1.1, BUSY).status).toBe('pass');
    });

    it('fails a real regression on a quiet machine (the quiet limit is unchanged)', () => {
        expect(judge(BASE, SLOW, QUIET).status).toBe('fail');
        expect(judge(BASE, BASE * 1.16, QUIET).status).toBe('fail');
    });

    it('calls an over-limit step inconclusive when either reading is busy, naming the load', () => {
        const verdict = judge(BASE, SLOW, BUSY);
        expect(verdict.status).toBe('inconclusive');
        expect(verdict.message).toContain('load avg 14 > 4');
        expect(judge(BASE, SLOW, { loads: [0.5, 9], cores: 32 }).status).toBe('inconclusive');
    });
});

describe('bench-check CLI', { timeout: scaleTimeout(30_000) }, () => {
    /**
     * @param {number} measured the step time in ms
     * @param {string[]} flags the load flags
     * @returns {number | null} the exit status
     */
    function run(measured, flags) {
        const dir = mkdtempSync(join(tmpdir(), 'bench-check-load-'));
        try {
            writeFileSync(join(dir, 'base.json'), JSON.stringify({ 'bench.step_ms@500': BASE }));
            writeFileSync(join(dir, 'now.json'), JSON.stringify({ 'bench.step_ms@500': measured }));
            const args = ['scripts/bench-check.mjs', join(dir, 'base.json'), join(dir, 'now.json'), ...flags];
            return spawnSync('node', args, { cwd: resolve('.') }).status;
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    it('exits 1 for a synthetic slowdown on a quiet machine, 3 under load, 0 when in limit under load', () => {
        expect(run(SLOW, ['--load=0.4', '--load=0.6', '--cores=32'])).toBe(1);
        expect(run(SLOW, ['--load=12', '--load=15', '--cores=32'])).toBe(EXIT_INCONCLUSIVE);
        expect(run(BASE * 1.05, ['--load=12', '--load=15', '--cores=32'])).toBe(0);
    });
});
