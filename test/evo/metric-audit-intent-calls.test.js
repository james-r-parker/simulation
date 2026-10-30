// Metric audit, intent family, part 2 (fitness-and-selection.md T3): the call, smoke, grouping and kin metrics of
// `metrics-intent.js` and `metrics-selection.js`, checked end to end against their definitions in the Metrics table of
// evolution-evals.md and "## Metrics" of world-balance.md, through the real `observe`, on the smallest scenes whose value
// is computable by hand. Meals, bites, kills and bite episodes are in `metric-audit-intent.test.js`. Counter-level
// edges are pinned elsewhere and not repeated: hearer sampling and the call queue (`observer-intent-calls.test.js`),
// the grouping and flee samples (`observer-intent-group.test.js`), the alarm credit (`observer-intent-alarms.test.js`),
// call and smoke classification (`observer-intent-events.test.js`).

import { describe, expect, it } from 'vitest';
import { EVENT_TYPE } from '../../js/sim/events.js';
import { HEARD_STRIDE } from '../../js/sim/world.js';
import { CH, FORAGER, PREDATOR, clearRays, seeThreat } from './helpers/intent-world.js';
import { auditArena, closeOn, metric, ticks } from './helpers/intent-audit.js';
import { addBorn, pushCall } from './helpers/observer-world.js';

const { ALARM_CALLED, PACK_CALLED, SMOKE_RELEASED } = EVENT_TYPE;

describe('audit: call, smoke and idle-signal metrics', () => {
    // 100 ticks, two agents. Forager C sees a threat on ticks 1..30, so its sighting is current through tick 60 (60 of
    // 100 alive ticks). Hunter H sees prey ahead on ticks 1..10, so it is current through tick 40 (40 of 100).
    //  - alarms by C at 5, 60 (30 ticks after the last sighting: still precise), 61 and 95;
    //  - smoke by C at 20 (threat), 70 (nothing), 80 (bittenTimer 29: bitten 28 ticks before), 85 (bittenTimer 1: a bite
    //    of the same tick, landed after the release) and 90 (bittenTimer 2: bitten 1 tick before);
    //  - hunt calls by H at 5, 40 (30 ticks after the last prey), 41 and 90.
    function signals(until = 100) {
        const r = auditArena();
        const c = addBorn(r.world, { spec: FORAGER });
        const h = addBorn(r.world, { spec: PREDATOR });
        r.start();
        const timers = new Map([
            [80, 29],
            [85, 1],
            [90, 2],
        ]);
        ticks(r, 1, until, (t) => {
            if (t <= 30) {
                seeThreat(r.world, c, 2);
            } else {
                r.world.inputs.fill(0, c * r.world.layout.rawInputCount, (c + 1) * r.world.layout.rawInputCount);
            }
            if (t <= 10) {
                closeOn(r.world, h, CH.PREY, t);
            } else {
                r.world.inputs.fill(0, h * r.world.layout.rawInputCount, (h + 1) * r.world.layout.rawInputCount);
            }
            r.world.bittenTimer[c] = timers.get(t) ?? 30;
            for (const at of [5, 60, 61, 95]) {
                if (t === at) {
                    pushCall(r.world, ALARM_CALLED, c);
                }
            }
            for (const at of [20, 70, 80, 85, 90]) {
                if (t === at) {
                    pushCall(r.world, SMOKE_RELEASED, c);
                }
            }
            for (const at of [5, 40, 41, 90]) {
                if (t === at) {
                    pushCall(r.world, PACK_CALLED, h);
                }
            }
        });
        return r;
    }

    it('reads alarm_precision as the precise share minus the caller base rate: (2 - 4 x 0.6) / 4', () => {
        // Two of four alarms follow a sighting within 30 ticks; a caller who called whatever it saw would have been
        // precise 60% of the time, so the lift is negative.
        const m = metric(signals(), 'alarm_precision');
        expect(m.value).toBeCloseTo(-0.1, 12);
    });

    it('reads hunt_call_precision as the precise share minus the caller base rate: (2 - 4 x 0.4) / 4', () => {
        expect(metric(signals(), 'hunt_call_precision').value).toBeCloseTo(0.1, 12);
    });

    it('reads smoke_precision as the share after a threat sighting or a bite 1 to 28 ticks before: 3 of 5', () => {
        // A bittenTimer of 1 is a bite of the release tick itself, after the release (`signal` runs before `feed`): it
        // is not "bitten before", so that release is idle.
        expect(metric(signals(), 'smoke_precision')).toEqual({ value: 0.6 });
    });

    it('reads idle_signals_per_1k as the calls and smoke that fail their rule per 1000 agent-ticks: 6 in 200', () => {
        // 2 alarms + 2 smoke releases + 2 hunt calls fail; 200 agent-ticks.
        expect(metric(signals(), 'idle_signals_per_1k')).toEqual({ value: 30 });
    });

    it('is null for each call metric with its reason exactly when there was none, and 0 idle with agent-ticks', () => {
        const none = signals(4);
        expect(metric(none, 'alarm_precision')).toEqual({ value: null, reason: 'no alarm call' });
        expect(metric(none, 'hunt_call_precision')).toEqual({ value: null, reason: 'no hunt call' });
        expect(metric(none, 'smoke_precision')).toEqual({ value: null, reason: 'no smoke release' });
        expect(metric(none, 'idle_signals_per_1k')).toEqual({ value: 0 });
        const empty = auditArena();
        addBorn(empty.world, { spec: FORAGER });
        empty.start();
        expect(metric(empty, 'idle_signals_per_1k')).toEqual({ value: null, reason: 'no agent-ticks' });
    });
});

describe('audit: eval.hunt_call_answer', () => {
    // Hunters of lineage 4: H1 calls (at 5, 30, 80, 90); H2 hears every call and makes one deliberate bite at tick 12;
    // H5 does not hear and bites deliberately at tick 40; H6 hears and bites at tick 75 with no prey in sight. H4 is
    // of lineage 9: it hears and bites deliberately at tick 90, which answers nothing. A call resolves once
    // `packWindow` (120) ticks old: the calls at 5, 30 and 80 by tick 200, the one at 90 not yet.
    function hunt() {
        const r = auditArena();
        const { world } = r;
        const h1 = addBorn(world, { spec: PREDATOR, lineageId: 4 });
        const h2 = addBorn(world, { spec: PREDATOR, lineageId: 4 });
        const h4 = addBorn(world, { spec: PREDATOR, lineageId: 9 });
        const h5 = addBorn(world, { spec: PREDATOR, lineageId: 4 });
        const h6 = addBorn(world, { spec: PREDATOR, lineageId: 4 });
        r.start();
        ticks(r, 1, 200, (t) => {
            for (const slot of [h2, h4, h5]) {
                closeOn(world, slot, CH.PREY, t);
            }
            world.heard[h2 * HEARD_STRIDE + 3] = 0.5;
            world.heard[h4 * HEARD_STRIDE + 3] = 0.5;
            world.heard[h6 * HEARD_STRIDE + 3] = 0.5;
            world.biteEnergy[h2] = t >= 12 ? 6 : 0;
            world.biteEnergy[h5] = t >= 40 ? 6 : 0;
            world.biteEnergy[h6] = t >= 75 ? 6 : 0;
            world.biteEnergy[h4] = t >= 90 ? 6 : 0;
            if ([5, 30, 80, 90].includes(t)) {
                pushCall(world, PACK_CALLED, h1);
            }
        });
        return r;
    }

    it('is the share of resolved calls followed by a deliberate bite from a hearing kin hunter: 1 of 3', () => {
        expect(metric(hunt(), 'hunt_call_answer')).toEqual({ value: 1 / 3 });
    });

    it('is null with reason `no resolved hunt call` until a call is packWindow ticks old', () => {
        const r = hunt();
        expect(r.observer.intent.calls.resolved).toBe(3);
        const young = auditArena();
        const caller = addBorn(young.world, { spec: PREDATOR });
        young.start();
        ticks(young, 1, 124, (t) => {
            if (t === 5) {
                pushCall(young.world, PACK_CALLED, caller);
            }
        });
        expect(metric(young, 'hunt_call_answer')).toEqual({ value: null, reason: 'no resolved hunt call' });
        ticks(young, 125, 125);
        expect(metric(young, 'hunt_call_answer')).toEqual({ value: 0 });
    });
});

describe('audit: grouping and kin metrics', () => {
    // Lineage 7: non-hunters T (500,500), K1 (600,500), K2 (500,800: exactly callRadius 300 from T, 316 from K1) and
    // K3 (1000,500: out of range of all); hunter Hn (550,500) and a dead D (510,500) are not counted, nor is L of
    // lineage 8 (520,520). At the sample on tick 10, T sees a threat at proximity 0.5 (threatened: 0.5 or more), K2 at
    // 0.4 (not), and K1 had one at tick 5, which is not a sample tick. L, alone in its lineage, is unthreatened.
    function group() {
        const r = auditArena();
        const { world } = r;
        const spots = [
            [500, 500],
            [600, 500],
            [500, 800],
            [1000, 500],
        ];
        const [t, k1, k2, k3] = spots.map(([x, y]) => addBorn(world, { spec: FORAGER, lineageId: 7, x, y }));
        addBorn(world, { spec: PREDATOR, lineageId: 7, x: 550, y: 500 });
        const l = addBorn(world, { spec: FORAGER, lineageId: 8, x: 520, y: 520 });
        const dead = addBorn(world, { spec: FORAGER, lineageId: 7, x: 510, y: 500 });
        r.start();
        world.alive[dead] = 0;
        return { r, t, k1, k2, k3, l };
    }

    it('is the kin mean around threatened agents minus around unthreatened ones: 2 - (1 + 1 + 0 + 0) / 4', () => {
        const { r, t, k1, k2 } = group();
        ticks(r, 1, 10, (tick) => {
            if (tick === 5) {
                seeThreat(r.world, k1, 4, 0.9);
            }
            if (tick === 6) {
                clearRays(r.world, k1);
            }
            if (tick === 10) {
                seeThreat(r.world, t, 4, 0.5);
                seeThreat(r.world, k2, 4, 0.4);
            }
        });
        expect(metric(r, 'group_cohesion_under_threat').value).toBeCloseTo(1.5, 12);
    });

    it('is null with its reason when the sample has no threatened or no unthreatened agent', () => {
        const calm = group();
        ticks(calm.r, 1, 10);
        expect(metric(calm.r, 'group_cohesion_under_threat')).toEqual({
            value: null,
            reason: 'no threatened agent in a grouping sample',
        });
        // A threat on a non-sample tick is not sampled, even with the run still going.
        const off = group();
        ticks(off.r, 1, 9, (tick) => {
            if (tick === 5) {
                seeThreat(off.r.world, off.t, 4, 0.9);
            }
        });
        expect(metric(off.r, 'group_cohesion_under_threat')).toEqual({
            value: null,
            reason: 'no threatened agent in a grouping sample',
        });
        // Every sampled agent threatened: nothing to compare with.
        const all = group();
        ticks(all.r, 1, 10, (tick) => {
            if (tick === 10) {
                for (const slot of [all.t, all.k1, all.k2, all.k3, all.l]) {
                    seeThreat(all.r.world, slot, 4, 0.9);
                }
            }
        });
        expect(metric(all.r, 'group_cohesion_under_threat')).toEqual({
            value: null,
            reason: 'no unthreatened agent in a grouping sample',
        });
    });

    it('reads kin_within_call_radius as the mean living same-lineage agents in range at each alarm: (3 + 0) / 2', () => {
        // T's alarm at tick 3 has K1, K2 (exactly 300 away) and the hunter Hn of lineage 7 in range, not K3, L or the
        // dead D; K3's alarm at tick 4 has nobody in range.
        const { r, t, k3 } = group();
        ticks(r, 1, 4, (tick) => {
            if (tick === 3) {
                pushCall(r.world, ALARM_CALLED, t);
            }
            if (tick === 4) {
                pushCall(r.world, ALARM_CALLED, k3);
            }
        });
        expect(metric(r, 'kin_within_call_radius')).toEqual({ value: 1.5 });
    });

    it('is null for kin_within_call_radius with reason `no alarm call` exactly when no alarm was called', () => {
        const { r, t } = group();
        ticks(r, 1, 4, (tick) => {
            if (tick === 3) {
                pushCall(r.world, SMOKE_RELEASED, t);
            }
        });
        expect(metric(r, 'kin_within_call_radius')).toEqual({ value: null, reason: 'no alarm call' });
    });
});
