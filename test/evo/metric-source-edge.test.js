// Checkpoints at T, T + 1000, T + 2000 and T + 3000, each reached by one real step. At T: 10 prey and 2 hunters. Span 1 (an
// edge span, 10 prey to 13): 3 prey give a mating birth and 1 splits; a floor and an immigrant prey are placed and a hunter
// gives a mating birth; 2 prey starve and 1 is eaten by a hunter; 3 prey take a 10-energy meal. Span 2 (an edge span, 13 prey
// to 101): 90 prey are placed by `INITIAL` births and 2 starve. Span 3 (a reference span, 101 prey to 103): 4 prey give a
// mating birth and 2 split; 4 starve and 5 take a meal.

import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { METRICS } from '../../js/evo/metric-registry/index.js';
import { eaten, plantFood, starve } from './helpers/source-world.js';
import { FORAGER, PREDATOR, huntRun } from './helpers/hunt-scene.js';

const T = Math.ceil(BURN_IN_TICKS / 1000) * 1000;
const MEAL = 10;

/**
 * Makes an agent rich enough to give birth, mature and off cooldown, so the step's split phase splits it.
 * @param {any} world the world
 * @param {number} slot the agent
 * @returns {void}
 */
function readyToSplit(world, slot) {
    world.ageTicks[slot] = 100;
    world.energy[slot] = 1500;
    world.cooldown[slot] = 0;
}

/**
 * Makes an agent a mother whose pregnancy comes due in the next step.
 * @param {any} world the world
 * @param {number} slot the agent
 * @returns {void}
 */
function pregnant(world, slot) {
    world.pregnancy[slot] = 1;
    world.energy[slot] = 1500;
}

/** @returns {{run: ReturnType<typeof huntRun>['run']}} the scripted run after its last checkpoint */
function scriptedRun() {
    const { run, spawn } = huntRun({ runTicks: T + 3000, over: { maxAgents: 200, maxFood: 8 } });
    const prey = Array.from({ length: 10 }, () => spawn(FORAGER));
    const hunters = [spawn(PREDATOR), spawn(PREDATOR)];
    run.jump(T - 1);
    run.tick();
    // Span 1: prey[0..2] give birth, prey[3] splits, prey[4] and prey[5] starve, prey[6] is eaten, prey[7..9] eat.
    run.jump(T + 999);
    spawn(FORAGER, BORN_CAUSE.FLOOR);
    spawn(FORAGER, BORN_CAUSE.IMMIGRANT);
    run.tick((w) => {
        prey.slice(0, 3).forEach((slot) => pregnant(w, slot));
        readyToSplit(w, prey[3]);
        pregnant(w, hunters[1]);
        starve(w, prey[4], 100);
        starve(w, prey[5], 100);
        eaten(w, prey[6], hunters[0]);
        prey.slice(7).forEach((slot) => plantFood(w, slot, MEAL));
    });
    // Span 2: 90 new prey, and two starve.
    run.jump(T + 1999);
    const crowd = Array.from({ length: 90 }, () => spawn(FORAGER));
    run.tick((w) => {
        starve(w, crowd[0], 100);
        starve(w, crowd[1], 100);
    });
    // Span 3: crowd[2..5] give birth, crowd[6] and crowd[7] split, crowd[8..11] starve, crowd[12..16] eat.
    run.jump(T + 2999);
    run.tick((w) => {
        crowd.slice(2, 6).forEach((slot) => pregnant(w, slot));
        crowd.slice(6, 8).forEach((slot) => readyToSplit(w, slot));
        crowd.slice(8, 12).forEach((slot) => starve(w, slot, 100));
        crowd.slice(12, 17).forEach((slot) => plantFood(w, slot, MEAL));
    });
    return { run };
}

describe('the edge detectors in a scripted world', () => {
    const { run } = scriptedRun();
    const m = run.metrics();

    it('script the checkpoints they say', () => {
        const { log } = run.observer.scenes.edge;
        expect(Array.from(log.prey.subarray(0, 4))).toEqual([10, 13, 101, 103]);
        expect(Array.from(log.hunters.subarray(0, 4))).toEqual([2, 3, 3, 3]);
    });

    it('count the mating and split births of prey in edge spans, not floor, immigrant or hunter births', () => {
        // Edge spans: 10 to 13 prey (mean 11.5) and 13 to 101 (mean 57), 68.5 prey in all.
        expect(m['eval.edge_mate_births_per_prey']?.value).toBeCloseTo(3 / 68.5, 12);
        expect(m['eval.edge_split_births_per_prey']?.value).toBeCloseTo(1 / 68.5, 12);
    });

    it('count the prey deaths by cause in edge spans', () => {
        expect(m['eval.edge_starve_per_prey']?.value).toBeCloseTo(4 / 68.5, 12);
        expect(m['eval.edge_eaten_per_prey']?.value).toBeCloseTo(1 / 68.5, 12);
        expect(m['eval.edge_deaths_per_prey']?.value).toBeCloseTo(5 / 68.5, 12);
        expect(m['eval.edge_birth_death_ratio']?.value).toBeCloseTo(4 / 5, 12);
    });

    it('read the hunters over the prey of the edge spans', () => {
        expect(m['eval.edge_hunters_per_prey']?.value).toBeCloseTo((2.5 + 3) / 68.5, 12);
    });

    it('read the reference span: 101 prey to 103, mean 102', () => {
        expect(m['eval.edge_ref_mate_births_per_prey']?.value).toBeCloseTo(4 / 102, 12);
        expect(m['eval.edge_ref_split_births_per_prey']?.value).toBeCloseTo(2 / 102, 12);
        expect(m['eval.edge_ref_starve_per_prey']?.value).toBeCloseTo(4 / 102, 12);
        expect(m['eval.edge_ref_eaten_per_prey']?.value).toBe(0);
    });

    it('read the intake ratio: the meals of the edge spans per prey, over those of the reference span', () => {
        expect(m['eval.edge_intake_ratio']?.value).toBeCloseTo((3 * MEAL) / 68.5 / ((5 * MEAL) / 102), 12);
    });

    it('are registered with a source test that names them', () => {
        for (const name of Object.keys(METRICS).filter((n) => n.includes('.edge_'))) {
            expect(METRICS[/** @type {keyof typeof METRICS} */ (name)].tests.source).toBe(
                'test/evo/metric-source-edge.test.js',
            );
        }
    });
});

describe('the edge detectors before any checkpoint', () => {
    it('are null with a reason in a run shorter than burn-in', () => {
        const { run, spawn } = huntRun({ runTicks: 10 });
        spawn(FORAGER);
        run.tick();
        expect(run.metrics()['eval.edge_birth_death_ratio']).toEqual({
            value: null,
            reason: 'no edge span (a span after burn-in that starts with 1 to 99 prey)',
        });
    });
});
