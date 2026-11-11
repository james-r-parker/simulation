import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareReports } from '../../js/evo/compare.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

describe('compareReports on the recorded E150 floor-on and floor-off reports (T29c)', () => {
    it(
        'drops only the sparse eval.idle_signals_per_1k verdict and leaves every other better or worse verdict',
        { timeout: scaleTimeout(120_000) },
        () => {
            const on = JSON.parse(readFileSync('evals/power/defaults-floor-on-E150.json', 'utf8'));
            const off = JSON.parse(readFileSync('evals/power/defaults-floor-off-E150.json', 'utf8'));
            const rows = compareReports(on, off, { allowConfigDiff: ['floorTrigger'], status: () => 'verified' }).rows;
            const idle = rows.find((r) => r.metric === 'eval.idle_signals_per_1k');
            expect(idle?.verdict).toBe('no-difference');
            expect(idle?.note).toMatch(/^sparse: sign p /);
            // A note appears only when the BCa verdict was better or worse and the sign test took it back, so this set is
            // exactly the verdicts T29c changed; every other better or worse verdict is untouched.
            const gated = rows.filter((r) => r.note?.startsWith('sparse:')).map((r) => r.metric);
            expect(gated).toEqual(['eval.idle_signals_per_1k']);
        },
    );
});
