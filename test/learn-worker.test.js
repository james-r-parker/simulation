// reads: scripts/learn-worker.mjs
import { describe, expect, it, vi } from 'vitest';
import { DRILLS } from '../js/evo/drill-scenarios.js';

const learnLesson = vi.fn(() => ({ curve: [1, 2], final: 2 }));
vi.mock('../js/evo/learn-probe.js', () => ({ learnLesson }));

const { runLearnTask } = await import('../scripts/learn-worker.mjs');

describe('runLearnTask', () => {
    it('evolves the named drill with the task settings and returns the result', () => {
        const task = { lesson: DRILLS[0].name, seed: 3, generations: 2, population: 4, trials: 1, config: { a: 1 } };
        expect(runLearnTask(task)).toEqual({ curve: [1, 2], final: 2 });
        expect(learnLesson).toHaveBeenCalledWith(DRILLS[0], {
            seed: 3,
            generations: 2,
            population: 4,
            trials: 1,
            config: { a: 1 },
        });
    });

    it('names an unknown lesson', () => {
        const task = { lesson: 'no-such-lesson', seed: 1, generations: 1, population: 1, trials: 1, config: {} };
        expect(() => runLearnTask(task)).toThrow('learn: unknown lesson "no-such-lesson"');
    });
});
