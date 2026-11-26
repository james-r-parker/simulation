import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareReports } from '../../js/evo/compare.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

describe('compareReports on the recorded E150 floor-on and floor-off reports (T29c)', () => {
    it(
        'reads eval.idle_signals_per_1k as no-difference from its interval alone, and the sparse sign test takes back no verdict',
        { timeout: scaleTimeout(120_000) },
        () => {
            const on = JSON.parse(readFileSync('evals/power/defaults-floor-on-E150.json', 'utf8'));
            const off = JSON.parse(readFileSync('evals/power/defaults-floor-off-E150.json', 'utf8'));
            const rows = compareReports(on, off, { allowConfigDiff: ['floorTrigger'], status: () => 'verified' }).rows;
            const idle = rows.find((r) => r.metric === 'eval.idle_signals_per_1k');
            expect(idle?.verdict).toBe('no-difference');
            // Under BCa the interval excluded 0 and the sign test took the verdict back (T29c). The studentised interval
            // (metric-noise D8) reaches 0 on its own, so no note is written.
            expect(idle?.note).toBeUndefined();
            expect(/** @type {number} */ (idle?.low)).toBeLessThanOrEqual(0);
            expect(/** @type {number} */ (idle?.high)).toBeGreaterThanOrEqual(0);
            // A note appears only when the interval's verdict was better or worse and the sign test took it back: on this
            // pair it takes back none.
            const gated = rows.filter((r) => r.note?.startsWith('sparse:')).map((r) => r.metric);
            expect(gated).toEqual([]);
        },
    );
});
