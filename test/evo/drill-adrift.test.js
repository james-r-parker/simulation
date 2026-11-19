import { describe, expect, it } from 'vitest';
import { createRng, fork } from '../../js/sim/rng.js';
import { drillSubject } from '../../js/evo/drill.js';
import { DRILLS } from '../../js/evo/drill-scenarios.js';
import { oracleSubject } from '../../js/evo/lesson-oracles.js';
import { playTrial, viewOf } from '../../js/evo/memory-probe-run.js';
import { PREDATOR_SPEC } from '../../js/evo/memory-probe-scenarios.js';
import { OUTPUT_COUNT } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';

const byName = (/** @type {string} */ name) => /** @type {any} */ (DRILLS.find((d) => d.name === name));
const view = viewOf({ spec: PREDATOR_SPEC, weights: null }, createConfig({}));
const stream = () => fork(createRng(3), 'adrift');
const idle = { name: 'idle', id: 0, spec: PREDATOR_SPEC, weights: null, act: () => {} };

describe('prey-adrift', () => {
    it('stages the prey-ahead trial with the prey in the adrift role, and prey-ahead keeps its fleeing prey', () => {
        const adrift = byName('prey-adrift').plan(stream(), view).stage.agents;
        const ahead = byName('prey-ahead').plan(stream(), view).stage.agents;
        expect(adrift.map((/** @type {any} */ a) => a.role)).toEqual(['subject', 'adrift']);
        expect(ahead.map((/** @type {any} */ a) => a.role)).toEqual(['subject', 'prey']);
        expect({ ...adrift[1], role: 'prey' }).toEqual(ahead[1]);
    });

    it('leaves the prey still: it holds every output at zero and stays where it was staged', () => {
        const plan = byName('prey-adrift').plan(stream(), view);
        const start = plan.stage.agents[1];
        const done = plan.done;
        let outputs = 0;
        let moved = 0;
        plan.done = (/** @type {any} */ world, /** @type {any} */ control) => {
            if (world.alive[1] === 1) {
                const row = world.outputs.slice(OUTPUT_COUNT, 2 * OUTPUT_COUNT);
                outputs = Math.max(outputs, ...row.map(Math.abs));
                moved = Math.max(moved, Math.hypot(world.x[1] - start.x, world.y[1] - start.y));
            }
            return done(world, control);
        };
        playTrial({ plan, subject: idle, controlSpec: { name: 'intact' }, seed: 3, config: {} });
        expect(moved).toBeLessThan(5);
        expect(outputs).toBe(0);
    });

    it('is won by the oracle, and not by a subject that does nothing', () => {
        const drill = byName('prey-adrift');
        expect(drillSubject(drill, oracleSubject('prey-adrift'), { seed: 1, trials: 8 }).wins).toBe(8);
        expect(drillSubject(drill, idle, { seed: 1, trials: 4 }).wins).toBe(0);
    });
});
