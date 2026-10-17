import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE, EVENT_TYPE } from '../../js/sim/events.js';
import { HEARD_STRIDE } from '../../js/sim/world.js';
import { ESCAPE_TICKS, observeCombat } from '../../js/evo/observer-combat.js';
import { noteIntentEvents } from '../../js/evo/observer-intent-events.js';
import { intentMetrics } from '../../js/evo/metrics-intent.js';
import { resetIntentSlot } from '../../js/evo/observer-intent-state.js';
import { updateIntent } from '../../js/evo/observer-intent.js';
import { CH, FORAGER, PREDATOR, clearRays, intentArena, seeThreat, setRay } from './helpers/intent-world.js';
import { addBorn, nextTick, pushCall, pushDied } from './helpers/observer-world.js';

/**
 * Observes one tick the way `observe` does before it reassigns slots.
 * @param {{world: any, observer: any}} arena the arena
 * @param {number} at the tick
 * @param {() => void} [before] sets up the tick after the clock moves and the event ring clears
 * @returns {void}
 */
function tick(arena, at, before) {
    const { world, observer } = arena;
    nextTick(world, at);
    before?.();
    observeCombat(observer.combat, world, observer.intent);
    updateIntent(observer.intent, world, observer.slotOf);
    noteIntentEvents(observer, world);
}

/**
 * @param {any} arena the arena
 * @returns {void}
 */
function start(arena) {
    for (let slot = 0; slot < arena.world.alive.length; slot++) {
        if (arena.world.alive[slot] === 1) {
            arena.observer.slotOf.set(arena.world.genomeId[slot], slot);
        }
    }
    observeCombat(arena.observer.combat, arena.world, arena.intent);
}

describe('call and smoke precision', () => {
    it('counts an alarm precise with a threat sighting in the window and idle without', () => {
        const arena = intentArena();
        const { world, intent } = arena;
        const a = addBorn(world, { spec: FORAGER });
        const b = addBorn(world, { spec: FORAGER });
        start(arena);
        tick(arena, 1, () => {
            seeThreat(world, a, 3);
            pushCall(world, EVENT_TYPE.ALARM_CALLED, a);
            pushCall(world, EVENT_TYPE.ALARM_CALLED, b);
        });
        expect([intent.run.alarms, intent.run.alarmsPrecise, intent.run.idleSignals]).toEqual([2, 1, 1]);
        expect([intent.preciseSignal[a], intent.idleSignal[a], intent.preciseSignal[b], intent.idleSignal[b]]).toEqual([
            1, 0, 0, 1,
        ]);
    });

    it('counts a threat sighting 30 ticks old as current and 31 as stale', () => {
        const arena = intentArena();
        const { world, intent } = arena;
        const a = addBorn(world, { spec: FORAGER });
        start(arena);
        tick(arena, 1, () => seeThreat(world, a, 3));
        tick(arena, 31, () => {
            clearRays(world, a);
            pushCall(world, EVENT_TYPE.ALARM_CALLED, a);
        });
        expect(intent.run.alarmsPrecise).toBe(1);
        tick(arena, 32, () => pushCall(world, EVENT_TYPE.ALARM_CALLED, a));
        expect([intent.run.alarms, intent.run.alarmsPrecise]).toEqual([2, 1]);
    });

    it('counts a hunt call precise with prey ahead and idle without', () => {
        const arena = intentArena();
        const { world, intent } = arena;
        const a = addBorn(world, { spec: PREDATOR });
        const b = addBorn(world, { spec: PREDATOR });
        start(arena);
        tick(arena, 1, () => {
            setRay(world, a, 1, 0.6, CH.SMALLER);
            setRay(world, b, 8, 0.6, CH.SMALLER);
            pushCall(world, EVENT_TYPE.PACK_CALLED, a);
            pushCall(world, EVENT_TYPE.PACK_CALLED, b);
        });
        expect([intent.run.huntCalls, intent.run.huntCallsPrecise, intent.idleSignal[b]]).toEqual([2, 1, 1]);
    });

    it('counts smoke precise when bitten with no threat on the rays, or with a threat, and idle otherwise', () => {
        const arena = intentArena();
        const { world, intent } = arena;
        const bitten = addBorn(world, { spec: FORAGER, bittenTimer: 3 });
        const seen = addBorn(world, { spec: FORAGER, bittenTimer: 30 });
        const idle = addBorn(world, { spec: FORAGER, bittenTimer: 30 });
        start(arena);
        tick(arena, 1, () => {
            seeThreat(world, seen, 3);
            for (const slot of [bitten, seen, idle]) {
                pushCall(world, EVENT_TYPE.SMOKE_RELEASED, slot);
            }
        });
        expect([intent.run.smokes, intent.run.smokesPrecise, intent.run.idleSignals]).toEqual([3, 2, 1]);
        expect([intent.idleSignal[idle], intent.preciseSignal[bitten], intent.preciseSignal[seen]]).toEqual([1, 1, 1]);
    });
});

describe('call precision as lift over the caller base rate', () => {
    /**
     * Two foragers see a threat on tick 1 only, so it stays current for ticks 1 to 31 of a 39-tick run (base rate
     * 31 / 39). `spam` calls on every tick; `only` calls on the ticks the threat is current.
     * @param {string} type an `EVENT_TYPE` name of a call
     * @param {(world: any, slot: number) => void} cue shows the agent the cue on tick 1
     * @returns {{arena: any, spam: number, only: number}} the arena after the run
     */
    function run(type, cue) {
        const arena = intentArena();
        const { world } = arena;
        const spam = addBorn(world, { spec: type === 'ALARM_CALLED' ? FORAGER : PREDATOR });
        const only = addBorn(world, { spec: type === 'ALARM_CALLED' ? FORAGER : PREDATOR });
        start(arena);
        for (let t = 1; t <= 39; t++) {
            tick(arena, t, () => {
                if (t === 1) {
                    cue(world, spam);
                    cue(world, only);
                } else {
                    clearRays(world, spam);
                    clearRays(world, only);
                }
                pushCall(world, EVENT_TYPE[/** @type {'ALARM_CALLED'} */ (type)], spam);
                if (t <= 31) {
                    pushCall(world, EVENT_TYPE[/** @type {'ALARM_CALLED'} */ (type)], only);
                }
            });
        }
        return { arena, spam, only };
    }

    const base = 31 / 39;

    it('scores an alarm spammer about 0 and a cue-only caller 1 minus its base rate', () => {
        const { arena, spam, only } = run('ALARM_CALLED', (world, slot) => seeThreat(world, slot, 3));
        const { intent } = arena;
        expect([intent.alarmCalls[spam], intent.alarmCalls[only], intent.run.alarmsPrecise]).toEqual([39, 31, 62]);
        expect(intent.threatCueTicks[spam] / intent.aliveTicks[spam]).toBeCloseTo(base, 10);
        const lift = intentMetrics(arena.observer)['eval.alarm_precision'].value ?? NaN;
        // spammer: 31 precise - 39 * base = 0; cue-only: 31 - 31 * base = 31 * (1 - base)
        expect(lift).toBeCloseTo((31 * (1 - base)) / 70, 10);
    });

    it('scores a hunt-call spammer about 0 the same way, with prey ahead as the cue', () => {
        const { arena } = run('PACK_CALLED', (world, slot) => setRay(world, slot, 1, 0.6, CH.SMALLER));
        const { intent } = arena;
        expect(intent.run.huntCalls).toBe(70);
        const lift = intentMetrics(arena.observer)['eval.hunt_call_precision'].value ?? NaN;
        expect(lift).toBeCloseTo((62 - 70 * base) / 70, 10);
    });

    it('keeps the calls of a reused slot in the run, so a slot reset does not change the lift', () => {
        const { arena, spam } = run('ALARM_CALLED', (world, slot) => seeThreat(world, slot, 3));
        const before = intentMetrics(arena.observer)['eval.alarm_precision'].value;
        resetIntentSlot(arena.intent, spam);
        expect(arena.intent.run.alarmsBase).toBeCloseTo(39 * base, 10);
        expect(intentMetrics(arena.observer)['eval.alarm_precision'].value).toBeCloseTo(before ?? NaN, 10);
    });
});

describe('kin around an alarm caller', () => {
    it('counts living agents of the caller lineage within callRadius, not the caller', () => {
        const arena = intentArena({ callRadius: 100 });
        const { world, intent } = arena;
        const caller = addBorn(world, { spec: FORAGER, lineageId: 5, x: 100, y: 100 });
        addBorn(world, { spec: FORAGER, lineageId: 5, x: 150, y: 100 });
        addBorn(world, { spec: PREDATOR, lineageId: 5, x: 100, y: 190 });
        addBorn(world, { spec: FORAGER, lineageId: 5, x: 100, y: 300 });
        addBorn(world, { spec: FORAGER, lineageId: 6, x: 110, y: 100 });
        start(arena);
        tick(arena, 1, () => pushCall(world, EVENT_TYPE.ALARM_CALLED, caller));
        expect(intent.run.kinNearSum).toBe(2);
    });
});

describe('eaten deaths', () => {
    /**
     * Two hunters of one lineage and a victim; the victim's bite records are set, then it is eaten at tick 2.
     * @param {number} last the victim's `lastBiteDeliberate`
     * @param {number} prev its `prevBiteDeliberate`
     * @returns {any} the intent state
     */
    function eaten(last, prev) {
        const arena = intentArena();
        const { world, intent } = arena;
        const a = addBorn(world, { spec: PREDATOR, lineageId: 4 });
        const b = addBorn(world, { spec: PREDATOR, lineageId: 4 });
        const victim = addBorn(world, { spec: FORAGER });
        start(arena);
        intent.lastBiteDeliberate[victim] = last;
        intent.prevBiteDeliberate[victim] = prev;
        tick(arena, 2, () =>
            pushDied(world, {
                slot: victim,
                genomeId: world.genomeId[victim],
                cause: DEATH_CAUSE.EATEN,
                by: world.genomeId[a],
                prevBiter: world.genomeId[b],
            }),
        );
        return intent;
    }

    it('counts a pack kill as convergent only when both bites were deliberate', () => {
        const both = eaten(1, 1).run;
        expect([both.huntKillsDeliberate, both.packKillsConvergent]).toEqual([1, 1]);
        const one = eaten(1, 0).run;
        expect([one.huntKillsDeliberate, one.packKillsConvergent]).toEqual([1, 0]);
        const none = eaten(0, 1).run;
        expect([none.huntKillsDeliberate, none.packKillsConvergent]).toEqual([0, 0]);
    });

    it('reads the fatal bite of the killer, found by genome id, when it lands on the death tick', () => {
        const arena = intentArena();
        const { world, intent } = arena;
        const hunter = addBorn(world, { spec: PREDATOR });
        const victim = addBorn(world, { spec: FORAGER });
        start(arena);
        for (let t = 1; t <= 6; t++) {
            tick(arena, t, () => {
                setRay(world, hunter, 0, t / 20, CH.SMALLER);
                world.vx[hunter] = 0.5 * world.config.maxVelocity;
                if (t === 6) {
                    world.lastBiteTick[victim] = 6;
                    pushDied(world, {
                        slot: victim,
                        genomeId: world.genomeId[victim],
                        cause: DEATH_CAUSE.EATEN,
                        by: world.genomeId[hunter],
                    });
                }
            });
        }
        expect([intent.lastBiteDeliberate[victim], intent.run.huntKillsDeliberate]).toEqual([1, 1]);
    });

    it('counts a kill by a killer that is gone as chance', () => {
        const arena = intentArena();
        const { world, intent } = arena;
        const hunter = addBorn(world, { spec: PREDATOR });
        const victim = addBorn(world, { spec: FORAGER });
        start(arena);
        intent.lastBiteDeliberate[victim] = 1;
        tick(arena, 1, () => {
            world.lastBiteTick[victim] = 1;
            world.alive[hunter] = 0;
            pushDied(world, {
                slot: victim,
                genomeId: world.genomeId[victim],
                cause: DEATH_CAUSE.EATEN,
                by: world.genomeId[hunter],
            });
        });
        expect(intent.lastBiteDeliberate[victim]).toBe(0);
    });
});

describe('hunt-call answers', () => {
    /**
     * Hunter `caller` calls at tick 1; hunters `kin` (same lineage, hears), `stranger` (other lineage, hears) and
     * `deaf` (same lineage, does not hear) each get a closing prey history and one of them bites at tick 5.
     * @param {'kin' | 'stranger' | 'deaf'} who the biter
     * @returns {any} the hunt-call queue after the window
     */
    function answer(who) {
        const arena = intentArena({ packWindow: 20 });
        const { world, intent } = arena;
        const slots = {
            caller: addBorn(world, { spec: PREDATOR, lineageId: 4 }),
            kin: addBorn(world, { spec: PREDATOR, lineageId: 4 }),
            stranger: addBorn(world, { spec: PREDATOR, lineageId: 9 }),
            deaf: addBorn(world, { spec: PREDATOR, lineageId: 4 }),
        };
        start(arena);
        tick(arena, 1, () => {
            world.heard[slots.kin * HEARD_STRIDE + 3] = 0.5;
            world.heard[slots.stranger * HEARD_STRIDE + 3] = 0.5;
            pushCall(world, EVENT_TYPE.PACK_CALLED, slots.caller);
        });
        for (let t = 2; t <= 21; t++) {
            tick(arena, t, () => {
                world.heard[slots.kin * HEARD_STRIDE + 3] = 0.5;
                world.heard[slots.stranger * HEARD_STRIDE + 3] = 0.5;
                intent.lastPrey[slots[who]] = t - 1;
                intent.preyBits[slots[who]] = 0xffff;
                intent.preyStart[slots[who]] = 1;
                world.biteEnergy[slots[who]] = t >= 5 ? 6 : 0;
            });
        }
        return intent.calls;
    }

    it('answers a call when a kin hunter that heard it bites deliberately', () => {
        const calls = answer('kin');
        expect([calls.resolved, calls.answeredCalls]).toEqual([1, 1]);
    });

    it('does not answer it for a non-kin hearer, or a kin hunter that did not hear', () => {
        expect(answer('stranger').answeredCalls).toBe(0);
        expect(answer('deaf').answeredCalls).toBe(0);
        expect(answer('deaf').resolved).toBe(1);
    });
});

describe('noteEscape through observeCombat', () => {
    /**
     * A forager bitten at tick 1 that sprints at tick 1 (a response) or never.
     * @param {boolean} flee whether it responds
     * @returns {any} the intent state after the episode escapes
     */
    function escape(flee) {
        const arena = intentArena();
        const { world, intent } = arena;
        const slot = addBorn(world, { spec: FORAGER });
        start(arena);
        for (let t = 1; t <= 1 + ESCAPE_TICKS; t++) {
            tick(arena, t, () => {
                clearRays(world, slot);
                if (t === 1) {
                    seeThreat(world, slot, 2);
                }
                world.outputs[slot * 8 + 2] = flee && t <= 40 ? 1 : 0;
                world.bittenTimer[slot] = t === 1 ? 1 : 30;
            });
        }
        return intent;
    }

    it('credits an escaped episode that responded', () => {
        const intent = escape(true);
        expect([intent.run.escapedResponded, intent.respondedEscape[0]]).toEqual([1, 1]);
    });

    it('credits nothing for an escape with no response', () => {
        expect(escape(false).run.escapedResponded).toBe(0);
    });
});
