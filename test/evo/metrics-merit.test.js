// The merit metrics (fitness-and-selection.md T23): hand-built populations checkpointed through the real `checkpoint`,
// births and deaths fed through the real `observe`, read with `computeMetrics`. Pools count from tick 10000.

import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../../js/evo/metrics.js';
import { MIN_CORRELATION_DEATHS } from '../../js/evo/metrics-merit.js';
import { checkpoint, observe } from '../../js/evo/observer.js';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { meritPeek } from '../../js/sim/merit.js';
import { TALLY } from '../../js/sim/merit-state.js';
import { SEX } from '../../js/sim/sex.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { addBorn, nextTick, observed, pushBorn, pushDied } from './helpers/observer-world.js';

const ON = { meritHalfLife: 0, maxAgents: 40 };
const NO_AGENTS = 'no checkpoint after burn-in with an alive agent';

const read = (/** @type {any} */ r, /** @type {string} */ name) => computeMetrics(r.observer, r.world)[`eval.${name}`];

/**
 * Adds an alive agent holding `merit` stamped at the world's tick.
 * @param {any} world the world
 * @param {number} merit the stored merit
 * @param {Record<string, number>} [fields] more `addBlob` fields
 * @returns {number} the slot
 */
function withMerit(world, merit, fields = {}) {
    const slot = addBlob(world, fields);
    world.merit[slot] = merit;
    world.meritStamp[slot] = world.tick;
    return slot;
}

/**
 * Sets the tick and checkpoints.
 * @param {{world: any, observer: any}} r the run
 * @param {number} tick the checkpoint tick
 * @returns {void}
 */
function checkpointAt({ world, observer }, tick) {
    world.tick = tick;
    checkpoint(observer, world);
}

describe('eval.merit_mean and eval.merit_p90', () => {
    it('averages the alive merit over agents, and the 90th percentile over checkpoints', () => {
        const r = observed(ON);
        [0, 10, 20, 30, 40].forEach((m) => withMerit(r.world, m));
        checkpointAt(r, 10000); // mean 20, p90 = 36
        for (let slot = 0; slot < 5; slot++) {
            r.world.merit[slot] = 100;
        }
        r.world.meritStamp.fill(10000);
        checkpointAt(r, 10001); // all 100
        expect(read(r, 'merit_mean')).toEqual({ value: (100 + 500) / 10 });
        expect(read(r, 'merit_p90').value).toBeCloseTo((36 + 100) / 2, 10);
    });

    it('decays merit to the checkpoint without restamping it', () => {
        const r = observed({ ...ON, meritHalfLife: 1000 });
        r.world.tick = 9000;
        const slot = withMerit(r.world, 8);
        checkpointAt(r, 10000); // one half-life
        expect(read(r, 'merit_mean').value).toBeCloseTo(4, 10);
        expect(r.world.merit[slot]).toBe(8);
        expect(r.world.meritStamp[slot]).toBe(9000);
        expect(meritPeek(r.world, slot)).toBeCloseTo(4, 10);
    });

    it('ignores checkpoints before burn-in', () => {
        const r = observed(ON);
        withMerit(r.world, 50);
        checkpointAt(r, 9999);
        expect(read(r, 'merit_mean')).toEqual({ value: null, reason: NO_AGENTS });
        expect(read(r, 'merit_p90')).toEqual({ value: null, reason: NO_AGENTS });
    });

    it('is null at a checkpoint with no alive agent', () => {
        const r = observed(ON);
        checkpointAt(r, 10000);
        expect(read(r, 'merit_mean')).toEqual({ value: null, reason: NO_AGENTS });
    });
});

describe('eval.merit_mate_gain', () => {
    /**
     * Builds three males of one specialisation with merits 10, 2 and 0 (pool mean 4) and a female child of the first.
     * @returns {{r: {world: any, observer: any}, father: number, child: number}}
     */
    function mated() {
        const r = observed(ON);
        const father = withMerit(r.world, 10, { sex: SEX.MALE });
        withMerit(r.world, 2, { sex: SEX.MALE });
        withMerit(r.world, 0, { sex: SEX.MALE });
        withMerit(r.world, 500, { sex: SEX.FEMALE }); // a female does not count in the pool
        withMerit(r.world, 500, { sex: SEX.MALE, spec: 1 }); // another specialisation does not either
        const child = addBlob(r.world, { sex: SEX.FEMALE });
        r.world.parentSlotB[child] = father;
        return { r, father, child };
    }

    /**
     * @param {{world: any, observer: any}} r the run
     * @param {number} child the child slot
     * @param {number} father the father slot
     * @param {number} tick the birth tick
     * @param {number} [cause] the birth cause
     * @returns {void}
     */
    function birth(r, child, father, tick, cause = BORN_CAUSE.MATE) {
        r.world.parentSlotB[child] = father;
        nextTick(r.world, tick);
        pushBorn(r.world, { slot: child, genomeId: r.world.genomeId[child], parentB: r.world.genomeId[father], cause });
        observe(r.observer, r.world);
    }

    it('is the father merit above the mean male merit, over that mean', () => {
        const { r, father, child } = mated();
        birth(r, child, father, 10001);
        expect(read(r, 'merit_mate_gain').value).toBeCloseTo((10 - 4) / 4, 10);
    });

    it('pools the gains of several births before dividing', () => {
        const { r, father, child } = mated();
        birth(r, child, father, 10001);
        const second = r.world.merit.findIndex((/** @type {number} */ m) => m === 2);
        birth(r, child, second, 10002); // gain 2 - 4 = -2 over pool 4
        expect(read(r, 'merit_mate_gain').value).toBeCloseTo((6 - 2) / 8, 10);
    });

    it('does not count burn-in births, splits, or a father no longer in his slot', () => {
        const { r, father, child } = mated();
        birth(r, child, father, 9999);
        birth(r, child, father, 10001, BORN_CAUSE.SPLIT);
        r.world.alive[father] = 0;
        birth(r, child, father, 10002);
        expect(read(r, 'merit_mate_gain')).toEqual({
            value: null,
            reason: 'no mating birth after burn-in with a living father',
        });
    });

    it('is null with no merit among the males', () => {
        const { r, father, child } = mated();
        for (let slot = 0; slot < 3; slot++) {
            r.world.merit[slot] = 0;
        }
        birth(r, child, father, 10001);
        expect(read(r, 'merit_mate_gain')).toEqual({ value: null, reason: 'no merit among the males' });
    });
});

describe('eval.split_gated_share', () => {
    it('is the gated share of ready agent-ticks from the world tally', () => {
        const r = observed(ON);
        r.world.meritTally[TALLY.READY] = 8;
        r.world.meritTally[TALLY.GATED] = 2;
        expect(read(r, 'split_gated_share')).toEqual({ value: 0.25 });
    });

    it('is null when no agent was ever ready', () => {
        expect(read(observed(ON), 'split_gated_share')).toEqual({
            value: null,
            reason: 'no agent was ready to split',
        });
    });
});

describe('eval.merit_fitness_corr', () => {
    /**
     * Kills `count` mature agents at tick 10001 whose merit and fitness are given by functions of the index.
     * @param {{world: any, observer: any}} r the run
     * @param {number} count how many agents (at most 40)
     * @param {(i: number) => number} merit merit of agent i
     * @param {(i: number) => number} fit fitness of agent i
     * @param {number} [age] the age at death
     * @returns {void}
     */
    function killAll(r, count, merit, fit, age = 5000) {
        for (let i = 0; i < count; i++) {
            const slot = addBorn(r.world);
            r.world.merit[slot] = merit(i);
            r.world.meritStamp[slot] = 10000;
        }
        r.world.tick = 10000;
        observe(r.observer, r.world, undefined);
        const ids = Array.from({ length: count }, (_, i) => r.world.genomeId[i]);
        nextTick(r.world, 10002);
        ids.forEach((genomeId, slot) => pushDied(r.world, { slot, genomeId, ageTicks: age }));
        observe(r.observer, r.world, (_o, slot) => fit(slot));
    }

    it('is the Spearman correlation of merit at death and fitness', () => {
        const r = observed({ ...ON, meritHalfLife: 0 });
        killAll(
            r,
            MIN_CORRELATION_DEATHS,
            (i) => i,
            (i) => -i,
        );
        expect(read(r, 'merit_fitness_corr').value).toBeCloseTo(-1, 10);
        const same = observed({ ...ON, meritHalfLife: 0 });
        killAll(
            same,
            MIN_CORRELATION_DEATHS,
            (i) => i,
            (i) => i * i,
        );
        expect(read(same, 'merit_fitness_corr').value).toBeCloseTo(1, 10);
    });

    it('reads the merit the dead agent held, decayed to its death tick', () => {
        const r = observed({ ...ON, meritHalfLife: 1000 });
        killAll(
            r,
            MIN_CORRELATION_DEATHS,
            (i) => 64 * i,
            (i) => i,
        );
        const { merit } = r.observer.merit.pairs;
        expect(merit[3]).toBeCloseTo(64 * 3 * 0.5 ** (1 / 1000), 8);
        expect(r.world.merit[3]).toBe(64 * 3); // the world is untouched
    });

    it('is null below 30 mature deaths, for young deaths and without a fitness', () => {
        const few = observed(ON);
        killAll(
            few,
            MIN_CORRELATION_DEATHS - 1,
            (i) => i,
            (i) => i,
        );
        expect(read(few, 'merit_fitness_corr').reason).toBe('fewer than 30 mature deaths with a fitness');
        const young = observed({ ...ON, maturityTicks: 1000 });
        killAll(
            young,
            MIN_CORRELATION_DEATHS,
            (i) => i,
            (i) => i,
            999,
        );
        expect(read(young, 'merit_fitness_corr').value).toBeNull();
        const none = observed(ON);
        killAll(
            none,
            MIN_CORRELATION_DEATHS,
            (i) => i,
            () => Number.NaN,
        );
        expect(read(none, 'merit_fitness_corr').value).toBeNull();
    });

    it('is null when merit is constant', () => {
        const r = observed({ ...ON, meritHalfLife: 0 });
        killAll(
            r,
            MIN_CORRELATION_DEATHS,
            () => 3,
            (i) => i,
        );
        expect(read(r, 'merit_fitness_corr')).toEqual({ value: null, reason: 'merit or fitness is constant' });
    });
});

describe('observing merit', () => {
    it('leaves the merit arrays untouched', () => {
        const r = observed(ON);
        const slot = withMerit(r.world, 7);
        observe(r.observer, r.world);
        checkpointAt(r, 10000);
        expect(r.world.merit[slot]).toBe(7);
        expect(r.world.meritStamp[slot]).toBe(0);
    });
});
