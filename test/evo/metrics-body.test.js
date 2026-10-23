// The body and sex metrics (fitness-and-selection.md T7): hand-built populations checkpointed through the real
// `checkpoint` and read with `computeMetrics`. Sampled at checkpoints at or after burn-in (tick 10000) only.

import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../../js/evo/metrics.js';
import { drainObserverLogs } from '../../js/worker/observer-drain.js';
import { checkpoint, observe } from '../../js/evo/observer.js';
import { SEX } from '../../js/sim/sex.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { nextTick, observed } from './helpers/observer-world.js';

const ON = { traitsEnabled: true, sexesEnabled: true, hashCellSize: 256 };
const NAMES = ['trait_spread', 'body_plan_coverage', 'sex_balance'];
const NO_SAMPLE = 'no checkpoint after burn-in with an alive agent';
const NO_SPREAD = 'no checkpoint after burn-in with 2 alive agents';

/** @typedef {{size?: number, vision?: number, share?: number, sex?: number}} Body trait multiples of the defaults */

/**
 * Makes exactly `bodies.length` agents alive with those traits and checkpoints at `tick`.
 * @param {{world: any, observer: any}} run the world and observer
 * @param {number} tick the checkpoint tick
 * @param {Body[]} bodies per slot; traits default to 1 and sex to female
 * @returns {void}
 */
function checkpointWith({ world, observer }, tick, bodies) {
    const { baseSize, childEnergyShare } = world.config;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (slot >= bodies.length) {
            world.alive[slot] = 0;
            continue;
        }
        while (world.alive[slot] !== 1) {
            addBlob(world);
        }
        const b = bodies[slot];
        world.baseSize[slot] = baseSize * (b.size ?? 1);
        world.vision[slot] = b.vision ?? 1;
        world.childShare[slot] = childEnergyShare * (b.share ?? 1);
        world.sex[slot] = b.sex ?? SEX.FEMALE;
    }
    world.tick = tick;
    checkpoint(observer, world);
}

/**
 * @param {{world: any, observer: any}} run the run
 * @returns {Record<string, any>} the three metrics, keyed without the `eval.` prefix
 */
function read({ world, observer }) {
    const all = computeMetrics(observer, world);
    return Object.fromEntries(NAMES.map((name) => [name, all[`eval.${name}`]]));
}

describe('eval.trait_spread', () => {
    it('averages the size, vision and child-share CVs per checkpoint, then over checkpoints', () => {
        const r = observed(ON);
        // Burn-in: wild traits that must not count.
        checkpointWith(r, 9000, [{ size: 0.7 }, { size: 1.3 }]);
        // Size 20, 30 (CV 0.2), vision 0.9, 1.1 (CV 0.1), share 0.25, 0.75 of default 0.5 (CV 0.5): 0.8 / 3.
        checkpointWith(r, 10000, [
            { size: 0.8, vision: 0.9, share: 0.5 },
            { size: 1.2, vision: 1.1, share: 1.5 },
        ]);
        expect(read(r).trait_spread.value).toBeCloseTo(0.8 / 3, 6);
        // Identical bodies: CV 0 at the second checkpoint, so the mean over two is half of the first.
        checkpointWith(r, 11000, [{ size: 1.1 }, { size: 1.1 }, { size: 1.1 }]);
        expect(read(r).trait_spread.value).toBeCloseTo(0.8 / 6, 6);
    });

    it('skips a checkpoint with one alive agent, whose spread is undefined', () => {
        const r = observed(ON);
        checkpointWith(r, 10000, [{ size: 0.8 }, { size: 1.2 }]);
        const before = read(r).trait_spread.value;
        checkpointWith(r, 11000, [{ size: 0.7 }]);
        expect(read(r).trait_spread.value).toBe(before);
    });

    it('is null with a reason before any pair, and with only one agent ever', () => {
        const r = observed(ON);
        expect(read(r).trait_spread).toEqual({ value: null, reason: NO_SPREAD });
        checkpointWith(r, 10000, [{}]);
        expect(read(r).trait_spread).toEqual({ value: null, reason: NO_SPREAD });
    });

    it('is null with traitsEnabled off, whatever the population', () => {
        const r = observed({ ...ON, traitsEnabled: false });
        checkpointWith(r, 10000, [{ size: 0.8 }, { size: 1.2 }]);
        expect(read(r).trait_spread).toEqual({ value: null, reason: 'traitsEnabled is off' });
    });
});

describe('eval.body_plan_coverage', () => {
    it('is the occupied share of the 5 x 5 size x vision grid, pooled over checkpoints', () => {
        const r = observed(ON);
        checkpointWith(r, 9000, [{ size: 0.76, vision: 1.24 }]); // burn-in: not counted
        // Bins of width 0.12 from 0.7: 0.76 is bin 0, 1.0 is bin 2, 1.24 is bin 4. Two agents share a cell.
        checkpointWith(r, 10000, [
            { size: 0.76, vision: 0.76 },
            { size: 1, vision: 1 },
            { size: 1, vision: 1 },
            { size: 1.24, vision: 1.24 },
        ]);
        expect(read(r).body_plan_coverage).toEqual({ value: 3 / 25 });
        checkpointWith(r, 11000, [{ size: 0.88, vision: 1.24 }]); // bin (1, 4): a new cell
        expect(read(r).body_plan_coverage).toEqual({ value: 4 / 25 });
        checkpointWith(r, 12000, [{ size: 0.88, vision: 1.24 }]); // the same cell again
        expect(read(r).body_plan_coverage).toEqual({ value: 4 / 25 });
    });

    it('puts the upper bound in the last bin: a size of 1.3 and a vision of 0.7 are cell (4, 0)', () => {
        const r = observed(ON);
        checkpointWith(r, 10000, [{ size: 1.3, vision: 0.7 }]);
        expect(r.observer.body.cells[4 * 5]).toBe(1);
        expect(read(r).body_plan_coverage).toEqual({ value: 1 / 25 });
    });

    it('is 25/25 when every cell holds an agent', () => {
        const r = observed({ ...ON, maxAgents: 32 });
        const mids = [0.76, 0.88, 1, 1.12, 1.24];
        checkpointWith(
            r,
            10000,
            mids.flatMap((size) => mids.map((vision) => ({ size, vision }))),
        );
        expect(read(r).body_plan_coverage).toEqual({ value: 1 });
    });

    it('is null with a reason when no checkpoint after burn-in has an agent, and with traitsEnabled off', () => {
        const r = observed(ON);
        checkpointWith(r, 9999, [{}]);
        expect(read(r).body_plan_coverage).toEqual({ value: null, reason: NO_SAMPLE });
        checkpointWith(r, 10000, []);
        expect(read(r).body_plan_coverage).toEqual({ value: null, reason: NO_SAMPLE });
        const off = observed({ ...ON, traitsEnabled: false });
        checkpointWith(off, 10000, [{}]);
        expect(read(off).body_plan_coverage).toEqual({ value: null, reason: 'traitsEnabled is off' });
    });
});

describe('eval.sex_balance', () => {
    const F = { sex: SEX.FEMALE };
    const M = { sex: SEX.MALE };

    it('is the mean over checkpoints after burn-in of |female share - 0.5|', () => {
        const r = observed(ON);
        checkpointWith(r, 9000, [M, M, M, M]); // burn-in: not counted
        checkpointWith(r, 10000, [F, F, F, M]); // 0.75 -> 0.25
        checkpointWith(r, 11000, [F, F, M, M]); // 0.5 -> 0
        expect(read(r).sex_balance).toEqual({ value: 0.125 });
    });

    it('is 0.5 for a single-sex population', () => {
        const r = observed(ON);
        checkpointWith(r, 10000, [M, M]);
        expect(read(r).sex_balance).toEqual({ value: 0.5 });
    });

    it('is null with a reason before burn-in, with no agents, and with sexesEnabled off', () => {
        const r = observed(ON);
        checkpointWith(r, 9999, [F]);
        expect(read(r).sex_balance).toEqual({ value: null, reason: NO_SAMPLE });
        checkpointWith(r, 10000, []);
        expect(read(r).sex_balance).toEqual({ value: null, reason: NO_SAMPLE });
        const off = observed({ ...ON, sexesEnabled: false });
        checkpointWith(off, 10000, [F, M]);
        expect(read(off).sex_balance).toEqual({ value: null, reason: 'sexesEnabled is off' });
    });

    it('does not depend on traitsEnabled', () => {
        const r = observed({ ...ON, traitsEnabled: false });
        checkpointWith(r, 10000, [F, F, F, M]);
        expect(read(r).sex_balance).toEqual({ value: 0.25 });
    });
});

describe('body samples are kept apart from the series', () => {
    function run() {
        const r = observed(ON);
        checkpointWith(r, 10000, [{ size: 0.8, sex: SEX.MALE }, { size: 1.2 }]);
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
        for (let t = 10001; t <= 10010; t++) {
            nextTick(r.world, t);
            observe(r.observer, r.world);
        }
        expect(read(r)).toEqual(before);
    });
});
