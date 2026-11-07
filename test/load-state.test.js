import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_LOAD_SCALE, isBusy, loadScale, readLoad } from '../scripts/lib/load-state.mjs';
import { busyScale, scaleTimeout } from '../scripts/lib/test-timeout.mjs';

describe('isBusy', () => {
    it('is busy above cores / 8 and not at it', () => {
        expect(isBusy(4.01, 32)).toBe(true);
        expect(isBusy(4, 32)).toBe(false);
        expect(isBusy(0.2, 1)).toBe(true);
    });
});

describe('loadScale', () => {
    it('is exactly 1 on a quiet machine, so a quiet run is as strict as ever', () => {
        expect(loadScale(0, 32)).toBe(1);
        expect(loadScale(4, 32)).toBe(1);
    });

    it('grows with the load and stops at the cap', () => {
        expect(loadScale(5, 32)).toBe(2);
        expect(loadScale(12, 32)).toBe(2);
        expect(loadScale(20, 32)).toBe(3);
        expect(loadScale(200, 32)).toBe(MAX_LOAD_SCALE);
    });
});

describe('readLoad and busyScale', () => {
    it('reads the first field of a loadavg fixture', () => {
        const dir = mkdtempSync(join(tmpdir(), 'loadavg-'));
        try {
            const file = join(dir, 'loadavg');
            writeFileSync(file, '12.55 14.37 19.18 8/1685 2219678\n');
            expect(readLoad({ CHECK_LOADAVG_FILE: file })).toBe(12.55);
            expect(busyScale({ CHECK_LOADAVG_FILE: file }, 32)).toBe(2);
            writeFileSync(file, '0.50 1 1 1/1 1\n');
            expect(busyScale({ CHECK_LOADAVG_FILE: file }, 32)).toBe(1);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('reads 0 when the file is missing, and honours a forced scale', () => {
        expect(readLoad({ CHECK_LOADAVG_FILE: '/nonexistent/loadavg' })).toBe(0);
        expect(busyScale({ TEST_LOAD_SCALE: '3' }, 32)).toBe(3);
    });

    it('a busy-scaled factor lengthens an explicit timeout and a quiet one leaves it', () => {
        expect(scaleTimeout(10_000, { TEST_TIMEOUT_FACTOR: '3' })).toBe(30_000);
        expect(scaleTimeout(10_000, { TEST_TIMEOUT_FACTOR: '1' })).toBe(10_000);
    });
});
