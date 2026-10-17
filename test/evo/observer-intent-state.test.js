import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { createIntentState, resetIntentSlot } from '../../js/evo/observer-intent-state.js';

const config = createConfig({ maxAgents: 6, initialAgents: 0, minAgents: 0 });

describe('createIntentState', () => {
    it('sizes every per-slot array from maxAgents, with no sighting and no counts', () => {
        const intent = createIntentState(config);
        for (const name of ['lastFood', 'foodBits', 'deliberateFood', 'respondedEscape', 'episodeOpen']) {
            expect(intent[name].length, name).toBe(6);
        }
        expect(intent.lastThreat[0]).toBe(-Infinity);
        expect(intent.deliberateFood[5]).toBe(0);
        expect(Object.values(intent.run).every((v) => v === 0)).toBe(true);
    });

    it('holds the nine counters of the design', () => {
        const intent = createIntentState(config);
        for (const name of [
            'deliberateFood',
            'chanceFood',
            'deliberateBite',
            'chanceBite',
            'respondedEscape',
            'preciseSignal',
            'idleSignal',
            'undefendedBite',
            'unseenBite',
        ]) {
            expect(ArrayBuffer.isView(intent[name]), name).toBe(true);
        }
    });
});

describe('resetIntentSlot', () => {
    it('touches only its slot', () => {
        const intent = createIntentState(config);
        intent.chanceBite[1] = 4;
        intent.chanceBite[2] = 4;
        resetIntentSlot(intent, 1);
        expect([intent.chanceBite[1], intent.chanceBite[2]]).toEqual([0, 4]);
    });
});
