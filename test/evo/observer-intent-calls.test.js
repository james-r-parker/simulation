import { describe, expect, it } from 'vitest';
import {
    answerHuntCall,
    createHuntCalls,
    pushHuntCall,
    resolveHuntCalls,
    sampleHearers,
} from '../../js/evo/observer-intent-calls.js';
import { HEARD_STRIDE } from '../../js/sim/world.js';
import { PREDATOR, intentArena } from './helpers/intent-world.js';
import { addBorn, nextTick } from './helpers/observer-world.js';

describe('hunt-call queue', () => {
    it('resolves a call once packWindow ticks old, answered or not', () => {
        const calls = createHuntCalls();
        pushHuntCall(calls, 10, 1);
        pushHuntCall(calls, 12, 1);
        answerHuntCall(calls, 1, 15, 20);
        resolveHuntCalls(calls, 29, 20);
        expect([calls.resolved, calls.answeredCalls]).toEqual([0, 0]);
        resolveHuntCalls(calls, 30, 20);
        expect([calls.resolved, calls.answeredCalls]).toEqual([1, 0]);
        resolveHuntCalls(calls, 32, 20);
        expect([calls.resolved, calls.answeredCalls]).toEqual([2, 1]);
        expect(calls.size).toBe(0);
    });

    it('ignores an answer after the window, for a resolved call, or for an unknown call', () => {
        const calls = createHuntCalls();
        pushHuntCall(calls, 10, 1);
        answerHuntCall(calls, 0, 31, 20);
        answerHuntCall(calls, 5, 12, 20);
        resolveHuntCalls(calls, 30, 20);
        answerHuntCall(calls, 0, 30, 20);
        expect(calls.answeredCalls).toBe(0);
    });

    it('grows past its first capacity and keeps every call in order', () => {
        const calls = createHuntCalls();
        for (let i = 0; i < 40; i++) {
            pushHuntCall(calls, i, i);
        }
        answerHuntCall(calls, 33, 34, 100);
        resolveHuntCalls(calls, 1000, 100);
        expect([calls.resolved, calls.answeredCalls, calls.size]).toEqual([40, 1, 0]);
    });
});

describe('sampleHearers', () => {
    it('notes only the hunters of the caller lineage that hear a hunt call, once the call is a tick old', () => {
        const { world, intent } = intentArena();
        const kin = addBorn(world, { spec: PREDATOR, lineageId: 7 });
        const stranger = addBorn(world, { spec: PREDATOR, lineageId: 8 });
        pushHuntCall(intent.calls, 1, 7);
        for (const slot of [kin, stranger]) {
            world.heard[slot * HEARD_STRIDE + 3] = 0.5;
        }
        nextTick(world, 1);
        sampleHearers(intent, world);
        expect([intent.heardCall[kin], intent.heardCall[stranger]]).toEqual([0, 0]);
        nextTick(world, 2);
        sampleHearers(intent, world);
        expect([intent.heardCall[kin], intent.heardCall[stranger]]).toEqual([1, 0]);
        expect(intent.calls.sampled).toBe(1);
    });
});
