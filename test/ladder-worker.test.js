import { describe, expect, it } from 'vitest';
import { runRung } from '../scripts/ladder-worker.mjs';
import { FEATURES_OFF } from '../scripts/lib/features-on.mjs';

const SMALL = { ...FEATURES_OFF, maxAgents: 20, initialAgents: 8, worldWidth: 1500, worldHeight: 1000 };

describe('runRung', () => {
    it('runs one rung on one seed and reports its wall time', () => {
        const run = runRung({ rung: 'wanderer', seed: 1, ticks: 20, overrides: SMALL });
        expect(run.wallMs).toBeGreaterThanOrEqual(0);
        expect(run).toMatchObject({ seed: 1 });
    });

    it('names the rung and the seed when the rung is unknown', () => {
        expect(() => runRung({ rung: 'nope', seed: 4, ticks: 1, overrides: {} })).toThrow(
            'rung nope seed 4 failed: unknown rung "nope"',
        );
    });
});
