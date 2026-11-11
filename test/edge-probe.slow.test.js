import { describe, expect, it } from 'vitest';
import { probeSeed } from '../scripts/edge-probe.mjs';

describe('edge probe', () => {
    it('reads the edge scene rows and a funnel from a world run past burn-in', () => {
        const probe = probeSeed({ seed: 313056, ticks: 12000 });
        expect(probe.seed).toBe(313056);
        expect(probe.rows.prey).toHaveLength(3);
        expect(Object.keys(probe.rows)).toEqual(
            expect.arrayContaining(['prey', 'hunters', 'mate', 'split', 'deaths', 'starved', 'eaten']),
        );
        expect(probe.funnel.samples + probe.bandFunnel.samples).toBeGreaterThan(0);
    }, 120000);
});
