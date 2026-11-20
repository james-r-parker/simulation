import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRng, fork } from '../../js/sim/rng.js';
import { drillSubject } from '../../js/evo/drill.js';
import { DRILLS, MID_SPRINT_BOOST, WEAK_SPRINT_BOOST } from '../../js/evo/drill-scenarios.js';
import { oracleSubject } from '../../js/evo/lesson-oracles.js';
import { viewOf } from '../../js/evo/memory-probe-run.js';
import { PREDATOR_SPEC } from '../../js/evo/memory-probe-scenarios.js';
import { createConfig } from '../../js/sim/config.js';

const byName = (/** @type {string} */ name) => /** @type {any} */ (DRILLS.find((d) => d.name === name));
const view = viewOf({ spec: PREDATOR_SPEC, weights: null }, createConfig({}));
const stream = () => fork(createRng(3), 'mid');
const idle = { name: 'idle', id: 0, spec: PREDATOR_SPEC, weights: null, act: () => {} };

describe('prey-mid', () => {
    it('is the prey-ahead staging with a sprint between the weak rung and the default, and the oracle wins it', () => {
        const mid = byName('prey-mid');
        expect(mid.plan(stream(), view).stage).toEqual(byName('prey-ahead').plan(stream(), view).stage);
        const boost = createConfig(mid.arena).specialisations.forager.sprintBoost;
        expect(boost).toBe(MID_SPRINT_BOOST);
        expect(boost).toBeGreaterThan(WEAK_SPRINT_BOOST);
        expect(boost).toBeLessThan(createConfig({}).specialisations.forager.sprintBoost);
        expect(drillSubject(mid, oracleSubject('prey-mid'), { seed: 1, trials: 16 }).wins).toBeGreaterThan(4);
        expect(drillSubject(mid, idle, { seed: 1, trials: 4 }).wins).toBe(0);
    });

    it('cuts the sprint of the four prey specialisations in the hunt-mid stage and not the hunter', () => {
        const stage = JSON.parse(readFileSync(new URL('../fixtures/stages/hunt-mid.json', import.meta.url), 'utf8'));
        const config = createConfig(stage);
        for (const prey of ['forager', 'reproducer', 'scout', 'defender']) {
            expect(config.specialisations[prey].sprintBoost).toBe(MID_SPRINT_BOOST);
        }
        expect(config.specialisations.predator.sprintBoost).toBe(createConfig({}).specialisations.predator.sprintBoost);
    });
});
