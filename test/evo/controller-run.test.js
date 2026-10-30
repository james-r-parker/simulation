import { describe, expect, it } from 'vitest';
import { RUNG_METRICS, runControllerSeed } from '../../js/evo/controller-run.js';
import { LADDER_RUNGS } from '../../js/evo/ladder.js';

const rung = (/** @type {string} */ name) => /** @type {any} */ (LADDER_RUNGS.find((r) => r.name === name));
const SMALL = { initialAgents: 10, maxAgents: 20, maxFood: 100, initialFood: 100 };

describe('runControllerSeed', () => {
    it('reports the rung, the seed, the final population and every recorded metric', () => {
        const run = runControllerSeed({ rung: rung('foodSeeker'), seed: 1, ticks: 30, overrides: SMALL });
        expect([run.rung, run.seed, run.ticks]).toEqual(['foodSeeker', 1, 30]);
        expect(run.population).toBeGreaterThan(0);
        expect(Object.keys(run.metrics)).toEqual([...RUNG_METRICS]);
    });

    it('is deterministic: the same rung, seed and ticks give the same run', () => {
        const task = { rung: rung('sloppyForager'), seed: 2, ticks: 40, overrides: SMALL };
        expect(runControllerSeed(task)).toEqual(runControllerSeed(task));
    });

    it('starts with no floor and no immigrants, whatever the overrides say', () => {
        const run = runControllerSeed({
            rung: rung('jawSitter-vs-foodSeeker'),
            seed: 1,
            ticks: 5,
            overrides: { ...SMALL, minAgents: 15 },
        });
        expect(run.population).toBeLessThanOrEqual(SMALL.initialAgents);
    });

    it('runs the random rung on random brains and a combat rung with two arms', () => {
        expect(runControllerSeed({ rung: rung('random'), seed: 1, ticks: 10, overrides: SMALL }).rung).toBe('random');
        expect(
            runControllerSeed({ rung: rung('hunter-vs-fleer'), seed: 1, ticks: 10, overrides: SMALL }).population,
        ).toBeGreaterThan(0);
    });
});
