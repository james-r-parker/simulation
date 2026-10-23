// The dominance metrics (fitness-and-selection.md T6): hand-built populations checkpointed through the real
// `checkpoint` and read with `computeMetrics`. A share is of the alive agents pooled over the checkpoints at or after
// burn-in (tick 10000), the pooling `eval.lineages_alive` uses.

import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../../js/evo/metrics.js';
import { drainObserverLogs } from '../../js/worker/observer-drain.js';
import { checkpoint, observe } from '../../js/evo/observer.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { nextTick, observed } from './helpers/observer-world.js';

const NAMES = ['spec_dominance', 'spec_effective', 'lineage_dominance', 'lineage_effective'];
const NO_SAMPLE = 'no checkpoint after burn-in with an alive agent';

/**
 * Sets the lineage and specialisation of the first agents (adding agents as needed) and checkpoints at `tick`.
 * @param {{world: any, observer: any}} run the world and observer
 * @param {number} tick the checkpoint tick
 * @param {{lineages: number[], specs: number[]}} state per slot
 * @returns {void}
 */
function checkpointWith({ world, observer }, tick, state) {
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

/**
 * @param {number[]} counts pooled counts
 * @returns {number} exp of the Shannon entropy of their shares
 */
function effective(counts) {
    const total = counts.reduce((a, b) => a + b, 0);
    return Math.exp(-counts.reduce((h, n) => h + (n / total) * Math.log(n / total), 0));
}

/**
 * @param {{world: any, observer: any}} run the run
 * @returns {Record<string, any>} the four metrics, keyed without the `eval.` prefix
 */
function read({ world, observer }) {
    const all = computeMetrics(observer, world);
    return Object.fromEntries(NAMES.map((name) => [name, all[`eval.${name}`]]));
}

describe('dominance metrics from real checkpoints', () => {
    // 9000 is burn-in and not pooled. Pooled 10000, 11000, 12000 (13 agent samples):
    //   specs     0: 3 + 4 + 4 = 11, 1: 1 + 1 = 2
    //   lineages  5: 3 + 3 = 6, 6: 1 + 1 = 2, 7: 4, 8: 1
    function run() {
        const r = observed();
        checkpointWith(r, 9000, { lineages: [9, 9, 9, 9], specs: [1, 1, 1, 1] });
        checkpointWith(r, 10000, { lineages: [5, 5, 5, 6], specs: [0, 1, 0, 0] });
        checkpointWith(r, 11000, { lineages: [7, 7, 7, 7], specs: [0, 0, 0, 0] });
        checkpointWith(r, 12000, { lineages: [5, 5, 5, 6, 8], specs: [0, 1, 0, 0, 0] });
        return r;
    }

    it('reads the largest share of the pooled samples: 11/13 of specs and 6/13 of lineages', () => {
        const m = read(run());
        expect(m.spec_dominance).toEqual({ value: 11 / 13 });
        expect(m.lineage_dominance).toEqual({ value: 6 / 13 });
    });

    it('reads exp of the Shannon entropy of the pooled shares', () => {
        const m = read(run());
        expect(m.spec_effective.value).toBeCloseTo(effective([11, 2]), 12);
        expect(m.lineage_effective.value).toBeCloseTo(effective([6, 2, 4, 1]), 12);
    });

    it('pools from tick 10000 on: a checkpoint at 9999 is out and one at 10000 is in', () => {
        const r = observed();
        checkpointWith(r, 9999, { lineages: [1, 1], specs: [1, 1] });
        expect(read(r).spec_dominance).toEqual({ value: null, reason: NO_SAMPLE });
        checkpointWith(r, 10000, { lineages: [2, 2], specs: [0, 0] });
        expect(read(r).spec_dominance).toEqual({ value: 1 });
        expect(read(r).lineage_dominance).toEqual({ value: 1 });
    });

    it('is not changed by emptying the checkpoint series, as the worker does', () => {
        const r = run();
        const before = read(r);
        drainObserverLogs(r.observer);
        expect(read(r)).toEqual(before);
    });

    it('is not changed by observing ticks: only checkpoints sample', () => {
        const r = run();
        const before = read(r);
        for (let t = 12001; t <= 12010; t++) {
            nextTick(r.world, t);
            observe(r.observer, r.world);
        }
        expect(read(r)).toEqual(before);
    });
});

describe('dominance metrics at the extremes', () => {
    it('gives dominance 1 and effective 1 for a monoculture of one specialisation and one lineage', () => {
        const r = observed();
        checkpointWith(r, 10000, { lineages: [4, 4, 4], specs: [2, 2, 2] });
        checkpointWith(r, 11000, { lineages: [4, 4, 4], specs: [2, 2, 2] });
        expect(read(r)).toEqual({
            spec_dominance: { value: 1 },
            spec_effective: { value: 1 },
            lineage_dominance: { value: 1 },
            lineage_effective: { value: 1 },
        });
    });

    it('gives dominance 1/2 and effective 2 for two equal groups', () => {
        const r = observed();
        checkpointWith(r, 10000, { lineages: [1, 1, 2, 2], specs: [0, 0, 3, 3] });
        const m = read(r);
        expect(m.spec_dominance).toEqual({ value: 0.5 });
        expect(m.lineage_dominance).toEqual({ value: 0.5 });
        expect(m.spec_effective.value).toBeCloseTo(2, 12);
        expect(m.lineage_effective.value).toBeCloseTo(2, 12);
    });

    it('gives effective n for n equal groups: four lineages of one agent', () => {
        const r = observed();
        checkpointWith(r, 10000, { lineages: [1, 2, 3, 4], specs: [0, 0, 0, 0] });
        expect(read(r).lineage_effective.value).toBeCloseTo(4, 12);
        expect(read(r).lineage_dominance).toEqual({ value: 0.25 });
    });
});

describe('dominance metrics are null with a reason', () => {
    const NULLS = {
        spec_dominance: { value: null, reason: NO_SAMPLE },
        spec_effective: { value: null, reason: NO_SAMPLE },
        lineage_dominance: { value: null, reason: NO_SAMPLE },
        lineage_effective: { value: null, reason: NO_SAMPLE },
    };

    it('with no checkpoint at all', () => {
        expect(read(observed())).toEqual(NULLS);
    });

    it('with checkpoints only before burn-in', () => {
        const r = observed();
        checkpointWith(r, 5000, { lineages: [1, 2], specs: [0, 1] });
        checkpointWith(r, 9999, { lineages: [1, 2], specs: [0, 1] });
        expect(read(r)).toEqual(NULLS);
    });

    it('when the only checkpoint after burn-in has no alive agent', () => {
        const r = observed();
        r.world.tick = 10000;
        checkpoint(r.observer, r.world);
        expect(r.observer.checkpointCount).toBe(1);
        expect(read(r)).toEqual(NULLS);
    });
});
