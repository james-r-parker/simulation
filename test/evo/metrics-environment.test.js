// The environment metrics (fitness-and-selection.md T8): hand-built populations checkpointed through the real
// `checkpoint`, deaths fed through the real `observe`, read with `computeMetrics`. Pools count from tick 10000.

import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../../js/evo/metrics.js';
import { drainObserverLogs } from '../../js/worker/observer-drain.js';
import { checkpoint, observe } from '../../js/evo/observer.js';
import { DEATH_CAUSE } from '../../js/sim/events.js';
import { WINTER } from '../../js/sim/eras.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { nextTick, observed, pushDied } from './helpers/observer-world.js';

const ON = { erasEnabled: true, hashCellSize: 256 };
const NAMES = ['cold_stress_share', 'heat_stress_share', 'terrain_death_share', 'winter_pop_ratio'];
const NO_AGENTS = 'no checkpoint after burn-in with an alive agent';
const NO_DEATHS = 'no death after burn-in';
const SUMMER = 1;

/**
 * Makes exactly `temps.length` agents alive at those temperatures and checkpoints at `tick` in `season`.
 * @param {{world: any, observer: any}} run the world and observer
 * @param {number} tick the checkpoint tick
 * @param {number[]} temps per slot body temperature
 * @param {number} [season] the season index, summer by default
 * @returns {void}
 */
function checkpointWith({ world, observer }, tick, temps, season = SUMMER) {
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (slot >= temps.length) {
            world.alive[slot] = 0;
            continue;
        }
        while (world.alive[slot] !== 1) {
            addBlob(world);
        }
        world.temperature[slot] = temps[slot];
    }
    world.season[0] = season;
    world.tick = tick;
    checkpoint(observer, world);
}

/**
 * Kills one agent by `cause` in the tick that ends at `tick` (its record carries `tick - 1`).
 * @param {{world: any, observer: any}} run the run
 * @param {number} tick the world tick after the step
 * @param {number} cause a `DEATH_CAUSE` code
 * @returns {void}
 */
function die({ world, observer }, tick, cause) {
    nextTick(world, tick);
    pushDied(world, { slot: 0, genomeId: 900 + tick + cause, cause });
    observe(observer, world);
}

/**
 * @param {{world: any, observer: any}} run the run
 * @returns {Record<string, any>} the four metrics, keyed without the `eval.` prefix
 */
function read({ world, observer }) {
    const all = computeMetrics(observer, world);
    return Object.fromEntries(NAMES.map((name) => [name, all[`eval.${name}`]]));
}

describe('eval.cold_stress_share and eval.heat_stress_share', () => {
    it('are the shares of sampled agent-ticks below 30 and above 85, strictly', () => {
        const r = observed(ON);
        checkpointWith(r, 9999, [0, 0, 100]); // burn-in: not counted
        // 5 agents: 10 and 29 are cold; 30 and 85 are on the thresholds (neither); 90 is hot.
        checkpointWith(r, 10000, [10, 29, 30, 85, 90]);
        expect(read(r).cold_stress_share).toEqual({ value: 2 / 5 });
        expect(read(r).heat_stress_share).toEqual({ value: 1 / 5 });
        // 3 more agents, one cold: pooled 3 of 8 cold, 1 of 8 hot.
        checkpointWith(r, 11000, [20, 50, 60]);
        expect(read(r).cold_stress_share).toEqual({ value: 3 / 8 });
        expect(read(r).heat_stress_share).toEqual({ value: 1 / 8 });
    });

    it('count only alive agents', () => {
        const r = observed(ON);
        checkpointWith(r, 10000, [10, 10]);
        checkpointWith(r, 11000, [50]);
        r.world.temperature[1] = 0; // slot 1 is dead now; its stale temperature must not count
        checkpointWith(r, 12000, [50]);
        expect(read(r).cold_stress_share).toEqual({ value: 2 / 4 });
    });

    it('are null with a reason before burn-in and with no alive agent', () => {
        const r = observed(ON);
        checkpointWith(r, 9999, [10]);
        expect(read(r).cold_stress_share).toEqual({ value: null, reason: NO_AGENTS });
        checkpointWith(r, 10000, []);
        expect(read(r).heat_stress_share).toEqual({ value: null, reason: NO_AGENTS });
    });

    it('do not depend on erasEnabled', () => {
        const r = observed({ ...ON, erasEnabled: false });
        checkpointWith(r, 10000, [10, 50]);
        expect(read(r).cold_stress_share).toEqual({ value: 0.5 });
    });
});

describe('eval.terrain_death_share', () => {
    it('is collision deaths over all deaths from tick 10000 on', () => {
        const r = observed(ON);
        die(r, 10000, DEATH_CAUSE.COLLISION); // record tick 9999: burn-in, not counted
        expect(read(r).terrain_death_share).toEqual({ value: null, reason: NO_DEATHS });
        die(r, 10001, DEATH_CAUSE.COLLISION); // record tick 10000: the first counted tick
        die(r, 10002, DEATH_CAUSE.STARVED);
        die(r, 10003, DEATH_CAUSE.EATEN);
        die(r, 10004, DEATH_CAUSE.OLD_AGE);
        expect(read(r).terrain_death_share).toEqual({ value: 1 / 4 });
        die(r, 10005, DEATH_CAUSE.COLLISION);
        expect(read(r).terrain_death_share).toEqual({ value: 2 / 5 });
    });

    it('is 1 when every counted death is a collision', () => {
        const r = observed(ON);
        die(r, 20000, DEATH_CAUSE.COLLISION);
        expect(read(r).terrain_death_share).toEqual({ value: 1 });
    });
});

describe('eval.winter_pop_ratio', () => {
    it('is the mean winter population over the mean of the other checkpoints', () => {
        const r = observed(ON);
        checkpointWith(r, 9000, [1, 1, 1, 1, 1, 1], WINTER); // burn-in: not counted
        checkpointWith(r, 10000, [50, 50, 50, 50], 0); // others: 4
        checkpointWith(r, 11000, [50, 50, 50, 50, 50, 50], 2); // others: 6, mean 5
        checkpointWith(r, 12000, [50, 50], WINTER); // winter: 2
        checkpointWith(r, 13000, [50, 50, 50], WINTER); // winter: 3, mean 2.5
        expect(read(r).winter_pop_ratio).toEqual({ value: 0.5 });
    });

    it('counts an empty winter checkpoint as a population of 0', () => {
        const r = observed(ON);
        checkpointWith(r, 10000, [50, 50], SUMMER);
        checkpointWith(r, 11000, [], WINTER);
        expect(read(r).winter_pop_ratio).toEqual({ value: 0 });
    });

    it('is null with a reason with erasEnabled off, even in a winter season', () => {
        const r = observed({ ...ON, erasEnabled: false });
        checkpointWith(r, 10000, [50, 50], WINTER);
        checkpointWith(r, 11000, [50, 50], SUMMER);
        expect(read(r).winter_pop_ratio).toEqual({ value: null, reason: 'erasEnabled is off' });
    });

    it('is null with a reason with no winter checkpoint after burn-in', () => {
        const r = observed(ON);
        checkpointWith(r, 9000, [50], WINTER);
        checkpointWith(r, 10000, [50], SUMMER);
        expect(read(r).winter_pop_ratio).toEqual({ value: null, reason: 'no winter checkpoint after burn-in' });
    });

    it('is null with a reason when there are only winter checkpoints, or the others are all empty', () => {
        const r = observed(ON);
        checkpointWith(r, 10000, [50], WINTER);
        expect(read(r).winter_pop_ratio.reason).toBe('no non-winter checkpoint after burn-in with an alive agent');
        checkpointWith(r, 11000, [], SUMMER);
        expect(read(r).winter_pop_ratio.value).toBeNull();
    });
});

describe('environment samples are kept apart from the series', () => {
    function run() {
        const r = observed(ON);
        checkpointWith(r, 10000, [10, 90, 50], SUMMER);
        checkpointWith(r, 11000, [50], WINTER);
        die(r, 12000, DEATH_CAUSE.COLLISION);
        return r;
    }

    it('are not changed by emptying the checkpoint series, as the worker does', () => {
        const r = run();
        const before = read(r);
        drainObserverLogs(r.observer);
        expect(read(r)).toEqual(before);
    });

    it('are not changed by observing ticks: only checkpoints sample', () => {
        const r = run();
        const before = read(r);
        for (let t = 12001; t <= 12010; t++) {
            nextTick(r.world, t);
            observe(r.observer, r.world);
        }
        expect(read(r)).toEqual(before);
    });
});
