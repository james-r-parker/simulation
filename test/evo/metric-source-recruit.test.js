// Source tests, recruit metrics (honest-budgets T33a): `scene-recruit.js` and `scene-recruit-budget.js` read on the real `step`.
// Three hunters spawn after burn-in as floor entrants with known fates: A kills once, deliberately, at age 51 and starves at 300;
// B starves at 10, a juvenile (maturityTicks is 20); C is alive and 5 ticks old at the end, a censored juvenile. A chase that
// A loses is run to read the chase energy.

import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { starve } from './helpers/source-world.js';
import { FORAGER, PREDATOR, chaseSteps, huntRun, killStep, park, settleChases } from './helpers/hunt-scene.js';

const RUN_TICKS = BURN_IN_TICKS + 400;

/** @returns {Record<string, any>} the metrics of the three-hunter run */
function threeHunters() {
    const { run, world, spawn } = huntRun({ runTicks: RUN_TICKS });
    run.jump(BURN_IN_TICKS);
    const a = spawn(PREDATOR, BORN_CAUSE.FLOOR);
    const b = spawn(PREDATOR, BORN_CAUSE.FLOOR);
    const c = spawn(PREDATOR, BORN_CAUSE.FLOOR);
    park(world, b, 100);
    park(world, c, 200);
    killStep(run, a, spawn(FORAGER), { age: 50 });
    run.jump(BURN_IN_TICKS + 100);
    run.tick((w) => starve(w, b, 10));
    run.jump(BURN_IN_TICKS + 200);
    run.tick((w) => starve(w, a, 300));
    world.ageTicks[c] = 5;
    return run.metrics();
}

const M = threeHunters();

describe('recruit_cohort, recruit_matured_hunters, recruit_censored_share and recruit_matured_share', () => {
    it('read three hunters born after burn-in, one matured, one a living juvenile: censored 1/3, matured 1 of 2 resolved', () => {
        expect(M['eval.recruit_cohort']).toEqual({ value: 3 });
        expect(M['eval.recruit_matured_hunters']).toEqual({ value: 1 });
        expect(M['eval.recruit_censored_share'].value).toBeCloseTo(1 / 3, 12);
        expect(M['eval.recruit_matured_share']).toEqual({ value: 0.5 });
    });
});

describe('recruit_first_kill_share, recruit_lineage_share and recruit_replaced_share.<source>', () => {
    it('read the one matured hunter killing, not breeding, a floor entrant', () => {
        expect(M['eval.recruit_first_kill_share']).toEqual({ value: 1 });
        expect(M['eval.recruit_lineage_share']).toEqual({ value: 0 });
        expect(M['eval.recruit_replaced_share.floor']).toEqual({ value: 0 });
        expect(M['eval.recruit_replaced_share.spec-flip'].value).toBeNull();
        expect(M['eval.recruit_replaced_share.mate-hunter-parent'].value).toBeNull();
        expect(M['eval.recruit_replaced_share.split-hunter-parent'].value).toBeNull();
    });
});

describe('hunter_starve_age_median, hunter_lineage_extinctions and hunter_global_extinctions', () => {
    it('read the median of the starved ages 10 and 300, and two lineage extinctions (A and B each have a lineage) while hunter C lives', () => {
        expect(M['eval.hunter_starve_age_median']).toEqual({ value: 155 });
        expect(M['eval.hunter_lineage_extinctions']).toEqual({ value: 2 });
        expect(M['eval.hunter_global_extinctions']).toEqual({ value: 0 });
    });

    it('count the global extinction when the last hunter starves, and no lineage extinction', () => {
        const { run, world, spawn } = huntRun({ runTicks: RUN_TICKS });
        run.jump(BURN_IN_TICKS);
        const a = spawn(PREDATOR, BORN_CAUSE.FLOOR);
        park(world, a, 100);
        run.tick((w) => starve(w, a, 40));
        const m = run.metrics();
        expect(m['eval.hunter_global_extinctions']).toEqual({ value: 1 });
        expect(m['eval.hunter_lineage_extinctions']).toEqual({ value: 0 });
    });
});

describe('hunter_territory_blocked_share', () => {
    it('reads three adult hunters inside one radius at the first checkpoint after burn-in, each seeing two others: all blocked', () => {
        const { run, world, spawn } = huntRun({ runTicks: RUN_TICKS, over: { territoryMax: 1, territoryRadius: 600 } });
        const slots = [0, 1, 2].map(() => spawn(PREDATOR));
        slots.forEach((slot, i) => {
            park(world, slot, 100 + 50 * i);
            world.ageTicks[slot] = 500;
            world.energy[slot] = 5000;
        });
        run.jump(BURN_IN_TICKS + 999);
        run.tick();
        expect(run.metrics()['eval.hunter_territory_blocked_share']).toEqual({ value: 1 });
    });

    it('is null with no hunter at a checkpoint', () => {
        expect(M['eval.hunter_territory_blocked_share'].value).toBeNull();
    });
});

describe('chase_net_energy and chase_failed_energy', () => {
    it('read a given-up chase as the energy the hunter paid between its opening and its end', () => {
        const { run, world, spawn } = huntRun({ runTicks: RUN_TICKS });
        const hunter = spawn(PREDATOR);
        const prey = spawn(FORAGER);
        run.jump(BURN_IN_TICKS);
        chaseSteps(run, { hunter, prey, outcome: 'gaveup', energy: 500 });
        settleChases(run);
        const m = run.metrics();
        expect(world.alive[hunter]).toBe(1);
        expect(m['eval.chase_failed_energy'].value).toBeLessThan(0);
        expect(m['eval.chase_net_energy']).toEqual(m['eval.chase_failed_energy']);
    });

    it('are null before any chase', () => {
        expect(M['eval.chase_net_energy'].value).toBeNull();
        expect(M['eval.chase_failed_energy'].value).toBeNull();
    });
});
