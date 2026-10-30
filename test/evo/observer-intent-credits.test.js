import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE, EVENT_TYPE } from '../../js/sim/events.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { HEARD_STRIDE } from '../../js/sim/world.js';
import { ESCAPE_TICKS, observeCombat } from '../../js/evo/observer-combat.js';
import { noteIntentEvents } from '../../js/evo/observer-intent-events.js';
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

describe('kill credits', () => {
    /**
     * Two hunters `a` (the killer) and `b` (the previous biter) of one lineage and a victim eaten at tick 2.
     * @param {{last: number, prev: number, spec?: number, killerGone?: boolean, previousGone?: boolean}} f the
     *   victim's bite records and the hunters' state
     * @returns {{intent: any, a: number, b: number}} the intent state and the hunters' slots
     */
    function eaten(f) {
        const arena = intentArena();
        const { world, intent } = arena;
        const a = addBorn(world, { spec: f.spec ?? PREDATOR, lineageId: 4 });
        const b = addBorn(world, { spec: f.spec ?? PREDATOR, lineageId: 4 });
        const victim = addBorn(world, { spec: FORAGER });
        start(arena);
        intent.lastBiteDeliberate[victim] = f.last;
        intent.prevBiteDeliberate[victim] = f.prev;
        tick(arena, 2, () => {
            world.alive[a] = f.killerGone ? 0 : 1;
            world.alive[b] = f.previousGone ? 0 : 1;
            pushDied(world, {
                slot: victim,
                genomeId: world.genomeId[victim],
                cause: DEATH_CAUSE.EATEN,
                by: world.genomeId[a],
                prevBiter: world.genomeId[b],
            });
        });
        return { intent, a, b };
    }

    it('credits deliberateKills to the killer only when the fatal bite was deliberate', () => {
        const yes = eaten({ last: 1, prev: 0 });
        expect([yes.intent.deliberateKills[yes.a], yes.intent.deliberateKills[yes.b]]).toEqual([1, 0]);
        const no = eaten({ last: 0, prev: 1 });
        expect([no.intent.deliberateKills[no.a], no.intent.convergedKills[no.a]]).toEqual([0, 0]);
    });

    it('credits convergedKills to the killer and the previous biter when both bites were deliberate', () => {
        const both = eaten({ last: 1, prev: 1 });
        expect([both.intent.convergedKills[both.a], both.intent.convergedKills[both.b]]).toEqual([1, 1]);
        expect(both.intent.deliberateKills[both.a]).toBe(1);
        const one = eaten({ last: 1, prev: 0 });
        expect([one.intent.convergedKills[one.a], one.intent.convergedKills[one.b]]).toEqual([0, 0]);
    });

    it('credits nobody for a gone killer, and the previous biter alone when only the killer is gone', () => {
        const killer = eaten({ last: 1, prev: 1, killerGone: true });
        expect([killer.intent.deliberateKills[killer.a], killer.intent.convergedKills[killer.a]]).toEqual([0, 0]);
        expect(killer.intent.convergedKills[killer.b]).toBe(1);
        const previous = eaten({ last: 1, prev: 1, previousGone: true });
        expect([previous.intent.convergedKills[previous.a], previous.intent.convergedKills[previous.b]]).toEqual([
            1, 0,
        ]);
    });

    it('credits a kill by a killer that is not a pack hunter as deliberate, and not as converged', () => {
        const lone = eaten({ last: 1, prev: 1, spec: FORAGER });
        expect([lone.intent.deliberateKills[lone.a], lone.intent.convergedKills[lone.a]]).toEqual([1, 0]);
    });

    it('credits nobody for a death with no known killer', () => {
        const arena = intentArena();
        const { world, intent } = arena;
        const victim = addBorn(world, { spec: FORAGER });
        start(arena);
        intent.lastBiteDeliberate[victim] = 1;
        tick(arena, 2, () =>
            pushDied(world, { slot: victim, genomeId: world.genomeId[victim], cause: DEATH_CAUSE.EATEN, by: 0 }),
        );
        expect(Array.from(intent.deliberateKills).reduce((a, b) => a + b, 0)).toBe(0);
    });
});

describe('huntCredits', () => {
    /**
     * Hunter `caller` calls at tick 1 (with prey ahead when `precise`); its kin `biter` hears it and bites
     * deliberately at tick 5; the window is 20 ticks.
     * @param {{precise: boolean, callerDies?: boolean}} f the scene
     * @returns {{intent: any, caller: number}} the intent state and the caller's slot
     */
    function hunt(f) {
        const arena = intentArena({ packWindow: 20 });
        const { world, intent } = arena;
        const caller = addBorn(world, { spec: PREDATOR, lineageId: 4 });
        const biter = addBorn(world, { spec: PREDATOR, lineageId: 4 });
        start(arena);
        for (let t = 1; t <= 21; t++) {
            tick(arena, t, () => {
                world.heard[biter * HEARD_STRIDE + 3] = 0.5;
                if (t === 1) {
                    pushCall(world, EVENT_TYPE.PACK_CALLED, caller);
                    if (f.precise) {
                        setRay(world, caller, 1, 0.6, CH.PREY);
                    }
                }
                intent.lastPrey[biter] = t - 1;
                intent.preyBits[biter] = 0xffff;
                intent.preyStart[biter] = 1;
                world.biteEnergy[biter] = t >= 5 ? 6 : 0;
                world.alive[caller] = f.callerDies && t === 21 ? 0 : 1;
            });
        }
        return { intent, caller };
    }

    it('credits the caller of a precise call that was answered, when the call resolves', () => {
        const { intent, caller } = hunt({ precise: true });
        expect([intent.calls.answeredCalls, intent.huntCredits[caller]]).toEqual([1, 1]);
    });

    it('credits nothing for an idle call, though it is answered', () => {
        const { intent, caller } = hunt({ precise: false });
        expect([intent.calls.answeredCalls, intent.huntCredits[caller]]).toEqual([1, 0]);
    });

    it('drops the credit of a caller that died before the call resolved', () => {
        const { intent, caller } = hunt({ precise: true, callerDies: true });
        expect([intent.calls.answeredCalls, intent.huntCredits[caller]]).toEqual([1, 0]);
    });
});

describe('alarmCredits', () => {
    /**
     * Forager `caller` sees a threat and calls at tick 1; its kin `victim` is bitten at tick 3 and, with `flee`,
     * sprints for 40 ticks from the threat it sees, then survives `ESCAPE_TICKS` unbitten.
     * @param {{flee: boolean, kinOfCaller?: boolean, callerDies?: boolean}} f the scene
     * @returns {{intent: any, caller: number, victim: number}} the intent state and the slots
     */
    function alarm(f) {
        const arena = intentArena({ callRadius: 100, packWindow: 20 });
        const { world, intent } = arena;
        const caller = addBorn(world, { spec: FORAGER, lineageId: 5, x: 100, y: 100 });
        const victim = addBorn(world, { spec: FORAGER, lineageId: f.kinOfCaller === false ? 6 : 5, x: 150, y: 100 });
        start(arena);
        for (let t = 1; t <= 3 + ESCAPE_TICKS; t++) {
            tick(arena, t, () => {
                clearRays(world, victim);
                clearRays(world, caller);
                if (t === 1) {
                    seeThreat(world, caller, 3);
                    pushCall(world, EVENT_TYPE.ALARM_CALLED, caller);
                }
                if (t === 3) {
                    seeThreat(world, victim, 2);
                }
                world.outputs[victim * OUTPUT_COUNT + OUTPUT_INDEX.SPRINT] = f.flee && t >= 3 && t <= 42 ? 1 : 0;
                world.bittenTimer[victim] = t === 3 ? 1 : 30;
                world.alive[caller] = f.callerDies && t > 100 ? 0 : 1;
            });
        }
        return { intent, caller, victim };
    }

    it('credits the caller of a precise alarm after which a kin is bitten and escapes with a response', () => {
        const { intent, caller, victim } = alarm({ flee: true });
        expect([intent.run.escapedResponded, intent.alarmCredits[caller], intent.alarmCredits[victim]]).toEqual([
            1, 1, 0,
        ]);
        expect(intent.alarmMatches[victim]).toBe(0);
    });

    it('credits nothing when the kin does not respond, is of another lineage, or the caller is gone', () => {
        expect(alarm({ flee: false }).intent.alarmCredits[0]).toBe(0);
        expect(alarm({ flee: true, kinOfCaller: false }).intent.alarmCredits[0]).toBe(0);
        const gone = alarm({ flee: true, callerDies: true });
        expect([gone.intent.run.escapedResponded, gone.intent.alarmCredits[gone.caller]]).toEqual([1, 0]);
    });

    it('credits nothing for an idle alarm, called with no threat in sight', () => {
        const arena = intentArena({ callRadius: 100, packWindow: 20 });
        const { world, intent } = arena;
        const caller = addBorn(world, { spec: FORAGER, lineageId: 5, x: 100, y: 100 });
        const victim = addBorn(world, { spec: FORAGER, lineageId: 5, x: 150, y: 100 });
        start(arena);
        tick(arena, 1, () => pushCall(world, EVENT_TYPE.ALARM_CALLED, caller));
        tick(arena, 2, () => {
            world.bittenTimer[victim] = 1;
        });
        expect(intent.alarmQueue.size).toBe(0);
        expect(intent.alarmMatches[victim]).toBe(0);
    });
});
