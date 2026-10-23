import { describe, expect, it } from 'vitest';
import {
    ALARM_MATCH_CAP,
    createAlarmQueue,
    creditAlarms,
    matchAlarms,
    pruneAlarms,
    pushAlarm,
} from '../../js/evo/observer-intent-alarms.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';
import { FORAGER, intentArena } from './helpers/intent-world.js';
import { addBorn, nextTick } from './helpers/observer-world.js';

/**
 * A world with a caller at (100, 100) and a kin at (150, 100) of one lineage, `callRadius` 100, `packWindow` 20.
 * @returns {{world: any, intent: any, caller: number, kin: number}}
 */
function pair() {
    const { world, intent } = intentArena({ callRadius: 100, packWindow: 20 });
    const caller = addBorn(world, { spec: FORAGER, lineageId: 5, x: 100, y: 100 });
    const kin = addBorn(world, { spec: FORAGER, lineageId: 5, x: 150, y: 100 });
    return { world, intent, caller, kin };
}

describe('createAlarmQueue', () => {
    it('starts empty', () => {
        expect(createAlarmQueue().size).toBe(0);
    });
});

describe('matchAlarms', () => {
    it('notes a kin of the lineage bitten one to packWindow ticks after the call, inside callRadius', () => {
        const { world, intent, caller, kin } = pair();
        nextTick(world, 1);
        pushAlarm(intent.alarmQueue, world, caller);
        for (const [tick, count] of [
            [1, 0],
            [2, 1],
            [21, 1],
            [22, 0],
        ]) {
            nextTick(world, tick);
            matchAlarms(intent, world, kin);
            expect([tick, intent.alarmMatches[kin]]).toEqual([tick, count]);
        }
    });

    it('skips the caller itself, another lineage and a kin outside callRadius', () => {
        const { world, intent, caller, kin } = pair();
        const stranger = addBorn(world, { spec: FORAGER, lineageId: 6, x: 120, y: 100 });
        const far = addBorn(world, { spec: FORAGER, lineageId: 5, x: 201, y: 100 });
        nextTick(world, 1);
        pushAlarm(intent.alarmQueue, world, caller);
        nextTick(world, 2);
        for (const slot of [caller, stranger, far]) {
            matchAlarms(intent, world, slot);
            expect(intent.alarmMatches[slot]).toBe(0);
        }
        matchAlarms(intent, world, kin);
        expect(intent.alarmMatches[kin]).toBe(1);
    });

    it('keeps the oldest ALARM_MATCH_CAP alarms', () => {
        const { world, intent, kin } = pair();
        const callers = [];
        for (let i = 0; i < ALARM_MATCH_CAP + 2; i++) {
            callers.push(addBorn(world, { spec: FORAGER, lineageId: 5, x: 100, y: 100 }));
        }
        nextTick(world, 1);
        for (const caller of callers) {
            pushAlarm(intent.alarmQueue, world, caller);
        }
        nextTick(world, 2);
        matchAlarms(intent, world, kin);
        expect(intent.alarmMatches[kin]).toBe(ALARM_MATCH_CAP);
        const from = kin * ALARM_MATCH_CAP;
        const ids = Array.from(intent.alarmMatchId.subarray(from, from + ALARM_MATCH_CAP));
        expect(ids).toEqual(callers.slice(0, ALARM_MATCH_CAP).map((s) => world.genomeId[s]));
    });
});

describe('creditAlarms', () => {
    it('credits a caller still in its slot and drops one that died or whose slot was reused', () => {
        const { world, intent, caller, kin } = pair();
        const gone = addBorn(world, { spec: FORAGER, lineageId: 5, x: 100, y: 100 });
        const reused = addBorn(world, { spec: FORAGER, lineageId: 5, x: 100, y: 100 });
        nextTick(world, 1);
        for (const slot of [caller, gone, reused]) {
            pushAlarm(intent.alarmQueue, world, slot);
        }
        nextTick(world, 2);
        matchAlarms(intent, world, kin);
        world.alive[gone] = 0;
        world.genomeId[reused] = 999;
        creditAlarms(intent, world, kin);
        expect([caller, gone, reused].map((s) => intent.alarmCredits[s])).toEqual([1, 0, 0]);
        expect(intent.alarmMatches[kin]).toBe(0);
        creditAlarms(intent, world, kin);
        expect(intent.alarmCredits[caller]).toBe(1);
    });
});

describe('alarm queue against a naive list', () => {
    it('matches the same alarms through growth, compaction and pruning', () => {
        const { world, intent } = intentArena({ callRadius: 60, packWindow: 15, maxAgents: 40 });
        const rng = createRng(3);
        const slots = [];
        for (let i = 0; i < 40; i++) {
            const x = nextFloat(rng) * 200;
            const y = nextFloat(rng) * 200;
            slots.push(addBorn(world, { spec: FORAGER, lineageId: 1 + (i % 3), x, y }));
        }
        /** @type {{tick: number, id: number, lineage: number, x: number, y: number}[]} */
        const naive = [];
        for (let tick = 1; tick <= 400; tick++) {
            nextTick(world, tick);
            const victim = slots[Math.floor(nextFloat(rng) * 40)];
            const expected = naive
                .filter((a) => tick - a.tick >= 1 && tick - a.tick <= 15 && a.lineage === world.lineageId[victim])
                .filter((a) => a.id !== world.genomeId[victim])
                .filter((a) => (world.x[victim] - a.x) ** 2 + (world.y[victim] - a.y) ** 2 <= 60 * 60)
                .slice(0, ALARM_MATCH_CAP)
                .map((a) => a.id);
            matchAlarms(intent, world, victim);
            const from = victim * ALARM_MATCH_CAP;
            const got = Array.from(intent.alarmMatchId.subarray(from, from + intent.alarmMatches[victim]));
            expect(got).toEqual(expected);
            for (let k = Math.floor(nextFloat(rng) * 6); k > 0; k--) {
                const caller = slots[Math.floor(nextFloat(rng) * 40)];
                pushAlarm(intent.alarmQueue, world, caller);
                const { x, y, genomeId, lineageId } = world;
                naive.push({ tick, id: genomeId[caller], lineage: lineageId[caller], x: x[caller], y: y[caller] });
            }
            pruneAlarms(intent.alarmQueue, tick, 15);
            while (naive.length > 0 && naive[0].tick + 15 <= tick) {
                naive.shift();
            }
            expect(intent.alarmQueue.size).toBe(naive.length);
        }
        expect(intent.alarmQueue.tick.length).toBeGreaterThan(16);
    });
});
