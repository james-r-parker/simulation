// The lineage metrics (fitness-and-selection.md T9): hand-built AgentBorn and AgentDied records fed through the real
// `observe`, read with `computeMetrics`. maturityTicks is 100, the run is 20000 ticks and burn-in ends at 10000, so a
// child counts when born in [10000, 19900]. A record tick is the tick the event happened in; the world reads one more.

import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../../js/evo/metrics.js';
import { drainObserverLogs } from '../../js/worker/observer-drain.js';
import { observe } from '../../js/evo/observer.js';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { nextTick, observed, pushBorn, pushDied } from './helpers/observer-world.js';

const CONFIG = { maturityTicks: 100, hashCellSize: 256 };
const RUN = 20000;
const MATE = BORN_CAUSE.MATE;
const SPLIT = BORN_CAUSE.SPLIT;
const FLOOR = BORN_CAUSE.FLOOR;

const NO_RUN = 'no run length (createObserver runTicks)';
const NOT_FINISHED = 'the run has not reached its length';

/** @returns {{world: any, observer: any}} a world and an observer that knows the 20000-tick run length */
function run() {
    return observed(CONFIG, { runTicks: RUN });
}

/**
 * Feeds the events of tick `tick` (their records say `tick`; the world reads `tick + 1`).
 * @param {{world: any, observer: any}} r the run
 * @param {number} tick the event tick
 * @param {{born?: Record<string, number>[], died?: Record<string, number>[]}} events the records to push
 * @returns {void}
 */
function at({ world, observer }, tick, { born = [], died = [] }) {
    nextTick(world, tick + 1);
    for (const f of died) {
        pushDied(world, f);
    }
    for (const f of born) {
        pushBorn(world, { ...f, tick });
    }
    observe(observer, world);
}

/**
 * Moves the observer to the run end with an event-free tick.
 * @param {{world: any, observer: any}} r the run
 * @returns {void}
 */
function finish(r) {
    nextTick(r.world, RUN);
    observe(r.observer, r.world);
}

/**
 * @param {{world: any, observer: any}} r the run
 * @returns {{child_survival: any, lineage_lifespan_p50: any}} the two metrics
 */
function read({ world, observer }) {
    const all = computeMetrics(observer, world);
    return { child_survival: all['eval.child_survival'], lineage_lifespan_p50: all['eval.lineage_lifespan_p50'] };
}

describe('eval.child_survival', () => {
    it('is the share of mate and split children in the window that reached maturityTicks', () => {
        const r = run();
        at(r, 0, { born: [{ slot: 0, genomeId: 1, cause: BORN_CAUSE.INITIAL }] });
        // Before burn-in (record tick 9999): not counted, though it dies at once.
        at(r, 9999, { born: [{ slot: 1, genomeId: 2, cause: MATE, parentA: 1, parentB: 1 }] });
        at(r, 9999, { died: [{ slot: 1, genomeId: 2, ageTicks: 0 }] });
        // In the window: dies at 99 (fails), dies at exactly 100 (survives), split dies at 5 (fails).
        at(r, 10000, { born: [{ slot: 2, genomeId: 3, cause: MATE, parentA: 1, parentB: 1 }] });
        at(r, 10050, { born: [{ slot: 3, genomeId: 4, cause: MATE, parentA: 1, parentB: 1 }] });
        at(r, 10100, { born: [{ slot: 4, genomeId: 5, cause: SPLIT, parentA: 1, parentB: 1 }] });
        at(r, 10099, { died: [{ slot: 2, genomeId: 3, ageTicks: 99 }] });
        at(r, 10150, { died: [{ slot: 3, genomeId: 4, ageTicks: 100 }] });
        at(r, 10105, { died: [{ slot: 4, genomeId: 5, ageTicks: 5 }] });
        // A floor entrant is not a child, even though it dies at age 1.
        at(r, 10200, { born: [{ slot: 5, genomeId: 6, cause: FLOOR }] });
        at(r, 10201, { died: [{ slot: 5, genomeId: 6, ageTicks: 1 }] });
        // Last tick with time to mature (19900 + 100 = the run end): alive at the end, so it matured.
        at(r, 19900, { born: [{ slot: 6, genomeId: 7, cause: SPLIT, parentA: 1, parentB: 1 }] });
        // One tick later: too young to judge, excluded (alive, so it would add a survivor if it counted).
        at(r, 19901, { born: [{ slot: 7, genomeId: 8, cause: MATE, parentA: 1, parentB: 1 }] });
        finish(r);
        expect(read(r).child_survival).toEqual({ value: 2 / 4 });
    });

    it('counts a child born and dead in the same tick as one that failed', () => {
        const r = run();
        at(r, 12000, {
            born: [{ slot: 0, genomeId: 9, cause: MATE, parentA: 1, parentB: 2 }],
            died: [{ slot: 0, genomeId: 9, ageTicks: 0 }],
        });
        at(r, 12010, { born: [{ slot: 1, genomeId: 10, cause: MATE, parentA: 1, parentB: 2 }] });
        finish(r);
        expect(read(r).child_survival).toEqual({ value: 1 / 2 });
    });

    it('is 1 when every counted child is still alive, and 0 when none lived', () => {
        const alive = run();
        at(alive, 11000, { born: [{ slot: 0, genomeId: 9, cause: SPLIT, parentA: 1, parentB: 1 }] });
        finish(alive);
        expect(read(alive).child_survival).toEqual({ value: 1 });
        const dead = run();
        at(dead, 11000, { born: [{ slot: 0, genomeId: 9, cause: SPLIT, parentA: 1, parentB: 1 }] });
        at(dead, 11010, { died: [{ slot: 0, genomeId: 9, ageTicks: 10 }] });
        finish(dead);
        expect(read(dead).child_survival).toEqual({ value: 0 });
    });

    it('is null with a reason when no child is in the window', () => {
        const r = run();
        at(r, 0, { born: [{ slot: 0, genomeId: 1, cause: BORN_CAUSE.INITIAL }] });
        at(r, 9999, { born: [{ slot: 1, genomeId: 2, cause: MATE, parentA: 1, parentB: 1 }] });
        at(r, 12000, { born: [{ slot: 2, genomeId: 3, cause: FLOOR }] });
        at(r, 19901, { born: [{ slot: 3, genomeId: 4, cause: SPLIT, parentA: 1, parentB: 1 }] });
        finish(r);
        expect(read(r).child_survival).toEqual({
            value: null,
            reason: 'no child born after burn-in with time to mature',
        });
    });

    it('is null with a reason without a run length, and before the run reaches it', () => {
        const none = observed(CONFIG);
        at(none, 12000, { born: [{ slot: 0, genomeId: 9, cause: MATE, parentA: 1, parentB: 1 }] });
        nextTick(none.world, RUN);
        observe(none.observer, none.world);
        expect(read(none).child_survival).toEqual({ value: null, reason: NO_RUN });
        const early = run();
        at(early, 12000, { born: [{ slot: 0, genomeId: 9, cause: MATE, parentA: 1, parentB: 1 }] });
        expect(read(early).child_survival).toEqual({ value: null, reason: NOT_FINISHED });
        const short = observed(CONFIG, { runTicks: 10000 });
        expect(read(short).child_survival).toEqual({ value: null, reason: NO_RUN });
    });
});

describe('eval.lineage_lifespan_p50', () => {
    it('is the median first-birth to last-death span of lineages founded after burn-in', () => {
        const r = run();
        // Founded before burn-in: not counted, living or not.
        at(r, 0, { born: [{ slot: 0, genomeId: 1, lineageId: 1 }] });
        at(r, 9999, { born: [{ slot: 1, genomeId: 2, lineageId: 2 }] });
        // Lineage 3, founded exactly at burn-in: two agents; the first dying (10600) is not its end, the second is.
        at(r, 10000, { born: [{ slot: 2, genomeId: 3, lineageId: 3 }] });
        at(r, 10500, { born: [{ slot: 3, genomeId: 4, lineageId: 3, cause: MATE, parentA: 3, parentB: 3 }] });
        at(r, 10600, { died: [{ slot: 2, genomeId: 3, lineageId: 3, ageTicks: 600 }] });
        at(r, 11000, { died: [{ slot: 3, genomeId: 4, lineageId: 3, ageTicks: 500 }] });
        // Lineage 4: 12000 to 12400.
        at(r, 12000, { born: [{ slot: 2, genomeId: 5, lineageId: 4 }] });
        at(r, 12400, { died: [{ slot: 2, genomeId: 5, lineageId: 4, ageTicks: 400 }] });
        // Lineage 5: alive at the run end, counted to 20000.
        at(r, 15000, { born: [{ slot: 4, genomeId: 6, lineageId: 5 }] });
        // Lineage 6: born and dead in one tick, a span of 0.
        at(r, 16000, {
            born: [{ slot: 5, genomeId: 7, lineageId: 6 }],
            died: [{ slot: 5, genomeId: 7, lineageId: 6, ageTicks: 0 }],
        });
        // A death in a lineage the observer never saw born is ignored.
        at(r, 17000, { died: [{ slot: 6, genomeId: 99, lineageId: 99, ageTicks: 50 }] });
        finish(r);
        // Spans 1000, 400, 5000, 0: the median is (400 + 1000) / 2.
        expect(read(r).lineage_lifespan_p50).toEqual({ value: 700 });
    });

    it('counts a lineage that went extinct at the run end tick as dead, and a living one up to runTicks', () => {
        const r = run();
        at(r, 10000, { born: [{ slot: 0, genomeId: 3, lineageId: 3 }] });
        at(r, 19999, { died: [{ slot: 0, genomeId: 3, lineageId: 3, ageTicks: 9999 }] });
        at(r, 10000, { born: [{ slot: 1, genomeId: 4, lineageId: 4 }] });
        finish(r);
        // 9999 (dead at 19999) and 10000 (alive, to the run end).
        expect(read(r).lineage_lifespan_p50).toEqual({ value: 9999.5 });
    });

    it('is null with a reason when every lineage was founded before burn-in', () => {
        const r = run();
        at(r, 0, { born: [{ slot: 0, genomeId: 1, lineageId: 1 }] });
        at(r, 9999, { born: [{ slot: 1, genomeId: 2, lineageId: 2 }] });
        at(r, 12000, { born: [{ slot: 2, genomeId: 3, lineageId: 1, cause: MATE, parentA: 1, parentB: 1 }] });
        finish(r);
        expect(read(r).lineage_lifespan_p50).toEqual({ value: null, reason: 'no lineage founded after burn-in' });
    });

    it('is null with a reason without a run length, and before the run reaches it', () => {
        const none = observed(CONFIG);
        at(none, 12000, { born: [{ slot: 0, genomeId: 9, lineageId: 9 }] });
        nextTick(none.world, RUN);
        observe(none.observer, none.world);
        expect(read(none).lineage_lifespan_p50).toEqual({ value: null, reason: NO_RUN });
        const early = run();
        at(early, 12000, { born: [{ slot: 0, genomeId: 9, lineageId: 9 }] });
        expect(read(early).lineage_lifespan_p50).toEqual({ value: null, reason: NOT_FINISHED });
    });
});

describe('lineage sums are kept apart from the drained logs', () => {
    it('are not changed by emptying the death log and the checkpoint series, as the worker does', () => {
        const r = run();
        at(r, 10000, { born: [{ slot: 0, genomeId: 3, lineageId: 3 }] });
        at(r, 10010, { born: [{ slot: 1, genomeId: 4, lineageId: 3, cause: MATE, parentA: 3, parentB: 3 }] });
        at(r, 10020, { died: [{ slot: 1, genomeId: 4, lineageId: 3, ageTicks: 10 }] });
        at(r, 12000, { died: [{ slot: 0, genomeId: 3, lineageId: 3, ageTicks: 2000 }] });
        finish(r);
        const before = read(r);
        expect(before).toEqual({ child_survival: { value: 0 }, lineage_lifespan_p50: { value: 2000 } });
        drainObserverLogs(r.observer);
        expect(read(r)).toEqual(before);
    });
});
