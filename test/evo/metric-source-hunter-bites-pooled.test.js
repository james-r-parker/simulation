// Source test of `eval.bite_idle_pooled` (metric-noise Phase 2, T3): the pooled bite_idle read on the real `step`, with
// real opportunities. Two seeds with different exposure show that the report pools their sums.

import { describe, expect, it } from 'vitest';
import { OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { buildReport } from '../../js/evo/report.js';
import { createConfig } from '../../js/sim/config.js';
import { FORAGER, PREDATOR, huntRun } from './helpers/hunt-scene.js';

const STILL = { maturityTicks: 100000 };

/**
 * One hunter alone in the world for `ticks` ticks (nothing in its jaws), wanting to bite on the first `wishes` of them.
 * @param {number} ticks the ticks run
 * @param {number} wishes the ticks with a wish to bite
 * @returns {Record<string, any>} the run's metrics
 */
function idleHunter(ticks, wishes) {
    const { run, world, spawn } = huntRun({ over: STILL });
    const hunter = spawn(PREDATOR);
    for (let t = 0; t < ticks; t++) {
        world.x[hunter] = 200;
        world.y[hunter] = 500;
        world.vx[hunter] = 0;
        world.vy[hunter] = 0;
        if (t < wishes) {
            run.want(hunter, OUTPUT_INDEX.BITE);
        } else {
            run.release(hunter, OUTPUT_INDEX.BITE);
        }
        run.tick();
    }
    return run.metrics();
}

describe('eval.bite_idle_pooled from a real run', () => {
    it('reads the wishes over the hunter-ticks with nothing in the jaws, and the sums behind the ratio', () => {
        const m = idleHunter(40, 10)['eval.bite_idle_pooled'];
        expect(m).toEqual({ value: 0.25, num: 10, den: 40 });
    });

    it('is null with zero exposure in a world with no hunter', () => {
        const { run, spawn } = huntRun({ over: STILL });
        spawn(FORAGER);
        run.tick();
        const m = run.metrics()['eval.bite_idle_pooled'];
        expect(m.value).toBeNull();
        expect([m.num, m.den]).toEqual([0, 0]);
    });

    it('pools two seeds of unequal exposure as a ratio of sums, not the mean of their ratios', () => {
        const short = idleHunter(10, 10);
        const long = idleHunter(40, 0);
        const config = createConfig({ seed: 1 });
        const report = buildReport({
            policy: 'p',
            fitnessName: 'v6',
            config,
            ticks: 100,
            seeds: [1, 2],
            sha: 'abc',
            perSeed: [short, long],
        });
        const metric = report.metrics['eval.bite_idle_pooled'];
        expect(metric.values).toEqual([1, 0]);
        expect(metric.pooled).toEqual([
            { num: 10, den: 10 },
            { num: 0, den: 40 },
        ]);
        expect(metric.mean).toBe(10 / 50);
        expect(metric.mean).not.toBe(0.5);
    });
});
