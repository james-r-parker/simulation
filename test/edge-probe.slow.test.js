import { describe, expect, it } from 'vitest';
import { probeSeed } from '../scripts/edge-probe.mjs';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

// One eval-default world on one thread for 12000 ticks: the edge rows start at burn-in (10000 ticks), so it cannot run
// shorter, and a smaller world is no cheaper (fixed flora, herd and kernel costs; measured 2026-11-16). It takes 37 s
// quiet, 174 s under coverage at load 33, more beside a loaded gate: the limit scales with coverage and load.
describe('edge probe', () => {
    it(
        'reads the edge scene rows and a funnel from a world run past burn-in',
        () => {
            const probe = probeSeed({ seed: 313056, ticks: 12000 });
            expect(probe.seed).toBe(313056);
            expect(probe.rows.prey).toHaveLength(3);
            expect(Object.keys(probe.rows)).toEqual(
                expect.arrayContaining(['prey', 'hunters', 'mate', 'split', 'deaths', 'starved', 'eaten']),
            );
            expect(probe.funnel.samples + probe.bandFunnel.samples).toBeGreaterThan(0);
        },
        scaleTimeout(120_000),
    );
});
