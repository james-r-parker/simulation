// Metric audit, core family (fitness-and-selection.md T1): each `eval.*` metric of `metrics.js`, `metrics-series.js`
// and `metrics-grids.js` checked end to end against its definition in the Metrics table of evolution-evals.md, on the
// smallest state computable by hand. Per-module edge cases already pinned elsewhere are cited, not repeated:
// `metrics.test.js` (per-1k totals, born_share and mating_share arithmetic, medians), `metrics-series.test.js`
// (series arithmetic over `addCheckpoint` rows), `metrics-grids.test.js` (bin edges, sampling),
// `observer-events.test.js` (floor runs, burn-in split) and `observer-checkpoint.test.js` (checkpoint columns).

import { describe, expect, it } from 'vitest';
import { checkpoint, observe } from '../../js/evo/observer.js';
import { computeMetrics } from '../../js/evo/metrics.js';
import { BORN_CAUSE, DEATH_CAUSE, EVENT_TYPE, pushEvent } from '../../js/sim/events.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { addBorn, nextTick, observed, pushBorn, pushDied } from './helpers/observer-world.js';

const { MATE, SPLIT, FLOOR, IMMIGRANT, INITIAL } = BORN_CAUSE;

describe('audit: rates, lifespans and births from an event sequence', () => {
    // Two living agents (slots 0, 1: food 10 and 5) and four tracked ones that die. 500 ticks x 2 alive = 1000
    // agent-ticks. Mature means ageTicks >= 20 (maturityTicks); one food item is 100 energy.
    function run() {
        const { world, observer } = observed({ maturityTicks: 20 });
        addBorn(world);
        addBorn(world);
        for (let slot = 2; slot < 6; slot++) {
            pushBorn(world, { slot, genomeId: 100 + slot, cause: INITIAL, tick: 0 });
        }
        observe(observer, world);
        for (let t = 1; t <= 500; t++) {
            nextTick(world, t);
            world.foodEnergy[0] = Math.min(10, t);
            world.foodEnergy[1] = Math.min(5, t);
            if (t === 50) {
                pushBorn(world, { slot: 6, genomeId: 200, cause: MATE });
                pushBorn(world, { slot: 7, genomeId: 201, cause: SPLIT });
            }
            if (t === 60) {
                pushBorn(world, { slot: 6, genomeId: 202, cause: MATE });
                pushBorn(world, { slot: 7, genomeId: 203, cause: FLOOR });
            }
            if (t === 100) {
                pushDied(world, { slot: 2, genomeId: 102, cause: DEATH_CAUSE.STARVED, ageTicks: 30, foodEnergy: 100 });
                pushDied(world, { slot: 3, genomeId: 103, cause: DEATH_CAUSE.EATEN, ageTicks: 10, foodEnergy: 50 });
                pushDied(world, { slot: 4, genomeId: 104, cause: DEATH_CAUSE.EATEN, ageTicks: 50, foodEnergy: 99 });
                pushDied(world, { slot: 5, genomeId: 105, cause: DEATH_CAUSE.OLD_AGE, ageTicks: 90, foodEnergy: 200 });
            }
            observe(observer, world);
        }
        return computeMetrics(observer, world);
    }

    it('reads food energy per 1000 agent-ticks from the dead (449) plus the living (15)', () => {
        expect(run()['eval.food_energy_per_1k']).toEqual({ value: 464 });
    });

    it('takes the median over mature deaths (30, 50, 90) and over those that ate one item (30, 90)', () => {
        const m = run();
        expect(m['eval.median_lifespan']).toEqual({ value: 50 });
        expect(m['eval.fed_median_lifespan']).toEqual({ value: 60 });
    });

    it('counts mate and split births only: 3 in 1000 agent-ticks; floor and initial entries do not', () => {
        const m = run();
        expect(m['eval.births_per_1k']).toEqual({ value: 3 });
        expect(m['eval.mating_share']).toEqual({ value: 2 / 3 });
    });

    it('counts eaten deaths only: 2 in 1000 agent-ticks', () => {
        expect(run()['eval.predation_per_1k']).toEqual({ value: 2 });
    });

    it('is null without agent-ticks, and without a mature death, with the exact reasons', () => {
        const { world, observer } = observed({ maturityTicks: 20 });
        addBorn(world);
        observe(observer, world);
        const m = computeMetrics(observer, world);
        for (const name of ['food_energy_per_1k', 'births_per_1k', 'predation_per_1k']) {
            expect(m[`eval.${name}`], name).toEqual({ value: null, reason: 'no agent-ticks' });
        }
        nextTick(world, 1);
        pushDied(world, { slot: 0, genomeId: 1, ageTicks: 19, foodEnergy: 500 });
        observe(observer, world);
        const after = computeMetrics(observer, world);
        expect(after['eval.median_lifespan']).toEqual({ value: null, reason: 'no mature death' });
        expect(after['eval.fed_median_lifespan']).toEqual({ value: null, reason: 'no mature death after a meal' });
    });
});

describe('audit: entries after burn-in and floor episodes', () => {
    function entries() {
        const { world, observer } = observed();
        let genomeId = 1;
        const enter = (/** @type {number} */ tick, /** @type {number} */ cause) => {
            nextTick(world, tick + 1);
            pushBorn(world, { slot: 0, genomeId: genomeId++, cause, tick });
            observe(observer, world);
        };
        return { world, observer, enter };
    }

    it('reads born_share as (mate + split) / all entries counted from tick 10000: 2 of 5', () => {
        const { world, observer, enter } = entries();
        enter(9999, MATE); // before burn-in: in neither the numerator nor the denominator
        enter(10000, MATE);
        enter(10000, SPLIT);
        enter(10001, FLOOR);
        enter(10002, IMMIGRANT);
        enter(10003, INITIAL);
        expect(computeMetrics(observer, world)['eval.born_share']).toEqual({ value: 0.4 });
        // mating_share spans the whole run: 2 matings over 3 mating or split births
        expect(computeMetrics(observer, world)['eval.mating_share']).toEqual({ value: 2 / 3 });
    });

    it('is null for born_share when every entry came before burn-in, for mating_share without mate or split', () => {
        const { world, observer, enter } = entries();
        enter(9999, MATE);
        expect(computeMetrics(observer, world)['eval.born_share']).toEqual({
            value: null,
            reason: 'no agent entered after burn-in',
        });
        const other = entries();
        other.enter(10000, FLOOR);
        other.enter(10001, IMMIGRANT);
        expect(computeMetrics(other.observer, other.world)['eval.mating_share']).toEqual({
            value: null,
            reason: 'no mating or split birth',
        });
        expect(computeMetrics(other.observer, other.world)['eval.born_share']).toEqual({ value: 0 });
    });

    it('counts several PopulationFloor records in one tick as one tick of a run', () => {
        // See observer-events.test.js for the run boundaries; this pins the metric value, including a 2-record tick.
        const { world, observer } = observed();
        const floorAt = (/** @type {number} */ tick, /** @type {number} */ records = 1) => {
            nextTick(world, tick + 1);
            for (let i = 0; i < records; i++) {
                pushEvent(world.events, EVENT_TYPE.POPULATION_FLOOR, tick);
            }
            observe(observer, world);
        };
        [9999, 10000, 10001, 10003, 10004].forEach((tick) => floorAt(tick));
        floorAt(10010, 2);
        expect(computeMetrics(observer, world)['eval.floor_episodes']).toEqual({ value: 3 });
    });
});

/**
 * Sets the lineage and specialisation of the first agents (adding agents as needed) and checkpoints at `tick`.
 * @param {any} world the world
 * @param {any} observer the observer
 * @param {number} tick the checkpoint tick
 * @param {{lineages: number[], specs: number[]}} state per slot
 * @returns {void}
 */
function checkpointWith(world, observer, tick, state) {
    state.lineages.forEach((id, slot) => {
        while (world.alive[slot] !== 1) {
            addBlob(world);
        }
        world.lineageId[slot] = id;
        world.spec[slot] = state.specs[slot];
    });
    world.tick = tick;
    checkpoint(observer, world);
}

describe('audit: series metrics built by real checkpoints', () => {
    // Checkpoints at 9000, 10000, 11000, 12000; the run ends at tick 20000, so 10000 ticks follow burn-in.
    function run() {
        const { world, observer } = observed();
        const n = world.layout.weightCount;
        const foragers = [0, 0, 0, 0];
        const withPredator = [0, 1, 0, 0];
        checkpointWith(world, observer, 9000, { lineages: [5, 5, 5, 6], specs: withPredator });
        world.weights[0] = 2; // slot 0 differs from the other three by 2 in one weight
        checkpointWith(world, observer, 10000, { lineages: [5, 5, 5, 6], specs: withPredator });
        checkpointWith(world, observer, 11000, { lineages: [7, 7, 7, 7], specs: foragers });
        // a fifth agent (a forager, zero weights): 4 of the 10 pairs differ by 2
        checkpointWith(world, observer, 12000, { lineages: [5, 5, 5, 6, 8], specs: [...withPredator, 0] });
        observer.ticks = 20000;
        return { m: computeMetrics(observer, world), n };
    }

    it('reads population_mean over all checkpoints: (4 + 4 + 4 + 5) / 4', () => {
        expect(run().m['eval.population_mean']).toEqual({ value: 4.25 });
    });

    it('reads diversity as the mean pairwise L2 distance over sqrt(weightCount), averaged over checkpoints', () => {
        // 0 at 9000 (equal rows), (3 pairs x 2) / 6 = 1 at two checkpoints, (4 pairs x 2) / 10 = 0.8 with five agents
        const { m, n } = run();
        expect(m['eval.diversity'].value).toBeCloseTo((0 + 1 + 1 + 0.8) / 4 / Math.sqrt(n), 6);
    });

    it('reads lineages_alive from checkpoints at or after tick 10000 only: (2 + 1 + 3) / 3', () => {
        // lineages alive: 9000 -> 2 (ignored), 10000 -> 2, 11000 -> 1, 12000 -> 3 (5, 6 and 8)
        expect(run().m['eval.lineages_alive'].value).toBeCloseTo((2 + 1 + 3) / 3, 12);
    });

    it('counts a lineage that becomes dominant and was not in the previous 10 checkpoints', () => {
        // dominants 5, 5, 7, 5: only 7 is new after burn-in (5 is in the window at 12000): 1 per 10000 ticks
        expect(run().m['eval.lineage_turnover']).toEqual({ value: 10 });
    });

    it('keeps the dominant lineage on a tie, so a tie is not turnover', () => {
        const { world, observer } = observed();
        checkpointWith(world, observer, 10000, { lineages: [5, 5, 5, 6], specs: [0, 0, 0, 0] });
        checkpointWith(world, observer, 11000, { lineages: [5, 5, 6, 6], specs: [0, 0, 0, 0] });
        expect(Array.from(observer.series.dominantLineage.subarray(0, 2))).toEqual([5, 5]);
        observer.ticks = 20000;
        expect(computeMetrics(observer, world)['eval.lineage_turnover']).toEqual({ value: 10 });
    });

    it('counts each specialisation that goes extinct or returns: spec 1 leaves at 11000, returns at 12000', () => {
        // the mix does not change into 10000; 2 changes per 10000 ticks after burn-in
        expect(run().m['eval.spec_turnover']).toEqual({ value: 20 });
    });

    it('reads predator_share_cv from the share of specialisation predator over checkpoints', () => {
        // shares 1/4, 1/4, 0, 1/5 (the fifth agent is a forager); population standard deviation over the mean
        const shares = [0.25, 0.25, 0, 0.2];
        const mean = shares.reduce((a, b) => a + b, 0) / 4;
        const sd = Math.sqrt(shares.reduce((a, b) => a + (b - mean) ** 2, 0) / 4);
        expect(run().m['eval.predator_share_cv'].value).toBeCloseTo(sd / mean, 12);
    });

    it('is null with the exact reason for each series metric under its null condition', () => {
        const empty = observed();
        const m = computeMetrics(empty.observer, empty.world);
        expect(m['eval.population_mean']).toEqual({ value: null, reason: 'no checkpoint' });
        expect(m['eval.predator_share_cv']).toEqual({ value: null, reason: 'no checkpoint' });
        expect(m['eval.diversity']).toEqual({ value: null, reason: 'no checkpoint with 2 agents' });
        for (const name of ['lineages_alive', 'lineage_turnover', 'spec_turnover']) {
            expect(m[`eval.${name}`], name).toEqual({ value: null, reason: 'no checkpoint after burn-in' });
        }
        const { world, observer } = observed();
        addBlob(world);
        world.tick = 10000;
        checkpoint(observer, world);
        const one = computeMetrics(observer, world);
        expect(one['eval.diversity']).toEqual({ value: null, reason: 'no checkpoint with 2 agents' });
        expect(one['eval.predator_share_cv']).toEqual({ value: null, reason: 'mean predator share is 0' });
        expect(one['eval.lineage_turnover']).toEqual({ value: null, reason: 'no ticks after burn-in' });
        expect(one['eval.spec_turnover']).toEqual({ value: null, reason: 'no ticks after burn-in' });
    });
});

describe('audit: behaviour and motion coverage from observed lives', () => {
    // Three agents sampled at tick 100 (speed, turn) and dead at tick 101; bins: life (bite share, children per 10000
    // ticks / 5), motion (mean speed, mean turn). maxVelocity 8 and maxTurn 0.2 scale the samples.
    function lives() {
        const { world, observer } = observed({ maturityTicks: 20 });
        const { maxVelocity, maxTurn } = world.config;
        const specs = [
            { speed: 0.55, turn: 0.35, food: 7, bite: 3, kids: 1 }, // life (3, 9), motion (5, 3)
            { speed: 0.15, turn: 0.85, food: 0, bite: 10, kids: 0 }, // life (9, 0), motion (1, 8)
            { speed: 0.25, turn: 0.75, food: 7, bite: 3, kids: 1 }, // life (3, 9), motion (2, 7)
        ];
        for (const s of specs) {
            addBorn(world, { vx: s.speed * maxVelocity, turnRate: s.turn * maxTurn, ageTicks: 100 });
        }
        observe(observer, world);
        nextTick(world, 100);
        observe(observer, world);
        nextTick(world, 101);
        specs.forEach((s, slot) => {
            const genomeId = world.genomeId[slot];
            for (let k = 0; k < s.kids; k++) {
                pushBorn(world, { slot: 5 + slot, genomeId: 900 + slot, parentA: genomeId, parentB: genomeId });
            }
            pushDied(world, { slot, genomeId, ageTicks: 100, foodEnergy: s.food, biteEnergy: s.bite });
        });
        observe(observer, world);
        return { world, observer };
    }

    it('occupies 2 of 100 life cells and 3 of 100 motion cells for the three lives', () => {
        const { world, observer } = lives();
        expect(observer.deathCount).toBe(3);
        const m = computeMetrics(observer, world);
        expect(m['eval.behaviour_coverage']).toEqual({ value: 0.02 });
        expect(m['eval.motion_coverage']).toEqual({ value: 0.03 });
    });

    it('is null with the exact reason when no mature death has a sample', () => {
        const { world, observer } = observed({ maturityTicks: 20 });
        const m = computeMetrics(observer, world);
        expect(m['eval.behaviour_coverage']).toEqual({ value: null, reason: 'no sampled mature death' });
        expect(m['eval.motion_coverage']).toEqual({ value: null, reason: 'no sampled mature death' });
    });
});
