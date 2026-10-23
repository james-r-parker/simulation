// Metric audit, combat family (fitness-and-selection.md T2): each metric of `metrics-combat.js` checked end to end
// against its definition in the Metrics table of evolution-evals.md and "## Metrics" of predator-prey.md, through the
// real `observe` path, on the smallest event sequence computable by hand. Counter-level edge cases are pinned in
// `observer-combat.test.js` (pruning, episode extension, hunter victims), `observer-alarm.test.js` (snapshot sharing,
// pooling), `observer-smoke.test.js` (ring growth) and `metrics-combat.test.js` (the `null` reasons on an empty
// observer, the counter arithmetic); they are not repeated here.

import { describe, expect, it } from 'vitest';
import { EVENT_TYPE, DEATH_CAUSE } from '../../js/sim/events.js';
import { HEARD_STRIDE } from '../../js/sim/world.js';
import { ESCAPE_TICKS, ALARM_RESPONSE_TICKS } from '../../js/evo/observer-combat.js';
import { computeMetrics } from '../../js/evo/metrics.js';
import { observe } from '../../js/evo/observer.js';
import { addBorn, nextTick, observed, pushCall, pushDied } from './helpers/observer-world.js';

const FORAGER = 0;
const PREDATOR = 1;
const { EATEN, STARVED } = DEATH_CAUSE;

/**
 * Runs `observe` for each tick in `from..to`, calling `onTick` first so it can set state and push events.
 * @param {{world: any, observer: any}} run the world and observer
 * @param {number} from the first tick
 * @param {number} to the last tick
 * @param {(tick: number) => void} [onTick] runs after the tick starts
 * @returns {void}
 */
function ticks({ world, observer }, from, to, onTick = () => {}) {
    for (let t = from; t <= to; t++) {
        nextTick(world, t);
        onTick(t);
        observe(observer, world);
    }
}

/**
 * @param {{world: any, observer: any}} run the world and observer
 * @param {string} name the metric without the `eval.` prefix
 * @returns {import('../../js/evo/metrics-stats.js').MetricResult} the metric
 */
function metric({ world, observer }, name) {
    return computeMetrics(observer, world)[`eval.${name}`];
}

describe('audit: eval.catch_rate', () => {
    // One hunter alive for ticks 1..500 = 500 hunter agent-ticks (a forager is not counted). Three deaths at tick 100:
    // eaten by the hunter (counts), eaten by a forager (does not), starved (does not).
    function run() {
        const r = observed();
        const hunter = addBorn(r.world, { spec: PREDATOR });
        const preyA = addBorn(r.world, { spec: FORAGER });
        const preyB = addBorn(r.world, { spec: FORAGER });
        const preyC = addBorn(r.world, { spec: FORAGER });
        observe(r.observer, r.world);
        const g = (/** @type {number} */ s) => r.world.genomeId[s];
        ticks(r, 1, 500, (t) => {
            if (t === 100) {
                pushDied(r.world, { slot: preyA, genomeId: g(preyA), cause: EATEN, by: g(hunter), spec: FORAGER });
                pushDied(r.world, { slot: preyB, genomeId: g(preyB), cause: EATEN, by: g(preyC), spec: FORAGER });
                pushDied(r.world, { slot: preyC, genomeId: g(preyC), cause: STARVED, spec: FORAGER });
                r.world.alive[preyA] = r.world.alive[preyB] = r.world.alive[preyC] = 0;
            }
        });
        return r;
    }

    it('counts eaten deaths by a canHunt killer per 1000 hunter agent-ticks: 1 in 500 is 2', () => {
        expect(metric(run(), 'catch_rate')).toEqual({ value: 2 });
    });

    it('is null with reason `no hunters` exactly when no canHunt agent was alive for a tick', () => {
        const r = observed();
        addBorn(r.world, { spec: FORAGER });
        observe(r.observer, r.world);
        ticks(r, 1, 5);
        expect(metric(r, 'catch_rate')).toEqual({ value: null, reason: 'no hunters' });
        r.world.spec[0] = PREDATOR; // from now the agent is a hunter: one agent-tick
        ticks(r, 6, 6);
        expect(metric(r, 'catch_rate')).toEqual({ value: 0 });
    });
});

describe('audit: eval.escape_rate', () => {
    // Prey A is bitten at tick 10 and 15 (one episode, resolves at 315, alive: escaped). B is bitten at 10 and 100 and
    // starves at 200 (caught). C is eaten at 50 (caught). D is bitten at 30 and unresolved at the run end (excluded),
    // as is a bite on the hunter. 1 escaped of 3 resolved.
    function run() {
        const r = observed();
        const hunter = addBorn(r.world, { spec: PREDATOR });
        const [a, b, c, d] = [0, 1, 2, 3].map(() => addBorn(r.world, { spec: FORAGER }));
        observe(r.observer, r.world);
        const bites = { 10: [a, b, hunter], 15: [a], 30: [d], 100: [b] };
        const g = (/** @type {number} */ s) => r.world.genomeId[s];
        ticks(r, 1, 320, (t) => {
            r.world.bittenTimer.fill(5);
            for (const slot of /** @type {Record<number, number[]>} */ (bites)[t] ?? []) {
                r.world.bittenTimer[slot] = 1;
            }
            if (t === 50) {
                pushDied(r.world, { slot: c, genomeId: g(c), cause: EATEN, by: g(hunter), spec: FORAGER });
                r.world.alive[c] = 0;
            }
            if (t === 200) {
                pushDied(r.world, { slot: b, genomeId: g(b), cause: STARVED, spec: FORAGER });
                r.world.alive[b] = 0;
            }
        });
        return r;
    }

    it('is the share of resolved episodes whose victim lives ESCAPE_TICKS after the last bite: 1 of 3', () => {
        expect(ESCAPE_TICKS).toBe(300);
        expect(metric(run(), 'escape_rate').value).toBeCloseTo(1 / 3, 12);
    });

    it('is null with reason `no resolved bite episode` while every episode is still open', () => {
        const r = observed();
        const prey = addBorn(r.world, { spec: FORAGER });
        observe(r.observer, r.world);
        ticks(r, 1, 1, () => (r.world.bittenTimer[prey] = 1));
        ticks(r, 2, ESCAPE_TICKS, () => (r.world.bittenTimer[prey] = 5));
        expect(metric(r, 'escape_rate')).toEqual({ value: null, reason: 'no resolved bite episode' });
        ticks(r, ESCAPE_TICKS + 1, ESCAPE_TICKS + 1);
        expect(metric(r, 'escape_rate')).toEqual({ value: 1 });
    });
});

describe('audit: eval.pack_kill_share', () => {
    // Four eaten deaths at tick 5 and a starved one: a pack kill (killer H1 with previous biter H2 of its lineage),
    // a kill with a previous biter of another lineage, a kill with none, and a kill by a forager. 1 of 4.
    function run() {
        const r = observed();
        const h1 = addBorn(r.world, { spec: PREDATOR });
        const h2 = addBorn(r.world, { spec: PREDATOR, lineageId: r.world.lineageId[h1] });
        const h3 = addBorn(r.world, { spec: PREDATOR });
        r.world.lineageId[h3] = 999;
        const prey = addBorn(r.world, { spec: FORAGER });
        observe(r.observer, r.world);
        const g = (/** @type {number} */ s) => r.world.genomeId[s];
        ticks(r, 1, 5, (t) => {
            if (t !== 5) {
                return;
            }
            const f = { cause: EATEN, spec: FORAGER };
            pushDied(r.world, { ...f, slot: 4, genomeId: 50, by: g(h1), prevBiter: g(h2) });
            pushDied(r.world, { ...f, slot: 5, genomeId: 51, by: g(h1), prevBiter: g(h3) });
            pushDied(r.world, { ...f, slot: 6, genomeId: 52, by: g(h1), prevBiter: 0 });
            pushDied(r.world, { ...f, slot: 7, genomeId: 53, by: g(prey), prevBiter: g(h2) });
            pushDied(r.world, { slot: 4, genomeId: 54, cause: STARVED, by: g(h1), prevBiter: g(h2) });
        });
        return r;
    }

    it('is the share of eaten deaths with a killer and a previous biter that are hunters of one lineage: 1 of 4', () => {
        expect(metric(run(), 'pack_kill_share')).toEqual({ value: 0.25 });
    });

    it('is null with reason `no eaten death` when only other deaths occur', () => {
        const r = observed();
        const slot = addBorn(r.world, { spec: FORAGER });
        observe(r.observer, r.world);
        ticks(r, 1, 1, () => pushDied(r.world, { slot, genomeId: r.world.genomeId[slot], cause: STARVED }));
        expect(metric(r, 'pack_kill_share')).toEqual({ value: null, reason: 'no eaten death' });
    });
});

describe('audit: eval.alarm_response', () => {
    // A hunter at (500, 500); a caller at (500, 750); hearers at (500, 720) and (500, 800) (distances to the hunter 220
    // and 300, bands 2 and 3); a control in band 2 at (780, 500) and one in band 3 at (800, 750), exactly callRadius
    // (300) from the caller; `far` at (500, 1100), 350 px from the caller. The call's loudness is set by hand on the two hearers, as the sim sets it within the radius.
    function scene() {
        const r = observed();
        const slots = {
            hunter: addBorn(r.world, { spec: PREDATOR, x: 500, y: 500 }),
            caller: addBorn(r.world, { x: 500, y: 750 }),
            hearer2: addBorn(r.world, { x: 500, y: 720 }),
            hearer3: addBorn(r.world, { x: 500, y: 800 }),
            control2: addBorn(r.world, { x: 780, y: 500 }),
            control3: addBorn(r.world, { x: 800, y: 750 }),
            far: addBorn(r.world, { x: 500, y: 1100 }),
        };
        observe(r.observer, r.world);
        for (const slot of [slots.hearer2, slots.hearer3]) {
            r.world.heard[slot * HEARD_STRIDE] = 0.5;
        }
        return { ...r, slots };
    }

    /**
     * @param {any} world the world
     * @param {Record<number, number>} bySlot speeds along x by slot
     * @returns {void}
     */
    function speeds(world, bySlot) {
        for (const [slot, speed] of Object.entries(bySlot)) {
            world.vx[Number(slot)] = speed;
        }
    }

    it('is the mean hearer change minus the matched control change over maxVelocity: (4 - 1) / 8', () => {
        // hearer3 has no matched control in this case only if control3 is not one: it is, so it is set to match.
        const r = scene();
        const { slots, world } = r;
        ticks(r, 1, 1, () => {
            speeds(world, { [slots.hearer2]: 1, [slots.control2]: 1, [slots.hearer3]: 1, [slots.control3]: 1 });
            world.alive[slots.control3] = 0; // band 3 has no control: hearer3 is unmatched and must not count
            pushCall(world, EVENT_TYPE.ALARM_CALLED, slots.caller);
        });
        ticks(r, 2, 1 + ALARM_RESPONSE_TICKS, () =>
            speeds(world, { [slots.hearer2]: 5, [slots.control2]: 2, [slots.hearer3]: 100 }),
        );
        expect(metric(r, 'alarm_response')).toEqual({ value: 0.375 });
    });

    it('averages over calls: a second call with no excess halves the value', () => {
        const r = scene();
        const { slots, world } = r;
        world.alive[slots.control3] = 0;
        ticks(r, 1, 1, () => {
            speeds(world, { [slots.hearer2]: 1, [slots.control2]: 1 });
            pushCall(world, EVENT_TYPE.ALARM_CALLED, slots.caller);
        });
        ticks(r, 2, 20, (t) => {
            speeds(world, { [slots.hearer2]: 5, [slots.control2]: 2 });
            if (t === 20) {
                pushCall(world, EVENT_TYPE.ALARM_CALLED, slots.caller);
            }
        });
        ticks(r, 21, 20 + ALARM_RESPONSE_TICKS);
        expect(metric(r, 'alarm_response')).toEqual({ value: 0.1875 });
    });

    it('treats an agent exactly callRadius from the caller as a control: the sim lets only d < callRadius hear', () => {
        // hearer3 (band 3) goes 1 -> 4, control3 (band 3, distance 300 = callRadius) 1 -> 2: (3 - 1) / 8
        const r = scene();
        const { slots, world } = r;
        world.alive[slots.hearer2] = world.alive[slots.control2] = 0; // leave band 2 out
        ticks(r, 1, 1, () => {
            speeds(world, { [slots.hearer3]: 1, [slots.control3]: 1 });
            pushCall(world, EVENT_TYPE.ALARM_CALLED, slots.caller);
        });
        ticks(r, 2, 1 + ALARM_RESPONSE_TICKS, () => speeds(world, { [slots.hearer3]: 4, [slots.control3]: 2 }));
        expect(world.config.callRadius).toBe(300);
        expect(metric(r, 'alarm_response')).toEqual({ value: 0.25 });
    });

    it('does not take an agent that heard another call, from outside this call radius, for a hearer', () => {
        // The call comes from `far`, 380 px from hearer2, whose loudness is from another call (hand-set).
        const r = scene();
        const { slots, world } = r;
        ticks(r, 1, 1, () => pushCall(world, EVENT_TYPE.ALARM_CALLED, slots.far));
        ticks(r, 2, 1 + ALARM_RESPONSE_TICKS, () => speeds(world, { [slots.hearer2]: 5 }));
        expect(r.observer.combat.alarm.matchedCalls).toBe(0);
    });

    it('is null with reason `no alarm call` without a call, and when no hearer has a matched control', () => {
        const r = scene();
        ticks(r, 1, 3);
        expect(metric(r, 'alarm_response')).toEqual({ value: null, reason: 'no alarm call' });
        r.world.alive[r.slots.control2] = 0;
        r.world.alive[r.slots.control3] = 0;
        ticks(r, 4, 4, () => pushCall(r.world, EVENT_TYPE.ALARM_CALLED, r.slots.caller));
        ticks(r, 5, 4 + ALARM_RESPONSE_TICKS);
        expect(metric(r, 'alarm_response')).toEqual({
            value: null,
            reason: 'no alarm call had a hearer with a matched control',
        });
    });
});

describe('audit: eval.smoke_escapes', () => {
    // Releases at tick 1. The observed bittenTimer is 1 on the tick of a bite and 1 + k, k ticks later, saturating at
    // 30: A (timer 5) lives, B (timer 5) dies, C (timer 29) lives; all three count. D (timer 30, not bitten) and
    // E (timer 1: the bite lands after the release in the same tick, as `signal` runs before `lifecycle`) do not.
    // F releases at tick 100 and is still pending at the run end.
    function run() {
        const r = observed();
        const [a, b, c, d, e, f] = [5, 5, 29, 30, 1, 5].map((bittenTimer) => addBorn(r.world, { bittenTimer }));
        observe(r.observer, r.world);
        const release = (/** @type {number[]} */ who) =>
            who.forEach((slot) => pushCall(r.world, EVENT_TYPE.SMOKE_RELEASED, slot));
        ticks(r, 1, 301, (t) => {
            if (t === 1) {
                release([a, b, c, d, e]);
            }
            if (t === 100) {
                release([f]);
            }
            if (t === 150) {
                pushDied(r.world, { slot: b, genomeId: r.world.genomeId[b], cause: STARVED });
                r.world.alive[b] = 0;
            }
        });
        return r;
    }

    it('is the share alive 300 ticks later of releases by a recently bitten agent: 2 of 3', () => {
        const r = run();
        expect(metric(r, 'smoke_escapes').value).toBeCloseTo(2 / 3, 12);
        expect(r.observer.combat.smoke.bittenReleases).toBe(3);
    });

    it('is null with reason `no smoke release after a bite` when no release is resolved', () => {
        const r = observed();
        const slot = addBorn(r.world, { bittenTimer: 30 });
        observe(r.observer, r.world);
        ticks(r, 1, 301, (t) => (t === 1 ? pushCall(r.world, EVENT_TYPE.SMOKE_RELEASED, slot) : undefined));
        expect(metric(r, 'smoke_escapes')).toEqual({ value: null, reason: 'no smoke release after a bite' });
    });
});
