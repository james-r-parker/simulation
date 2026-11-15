// Honest alarm (honest-budgets Phase 5): a call is seen only when a threat is on the caller's rays at call time.

import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX, RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { signalAll } from '../../js/sim/calls.js';
import { ENERGY_SOURCE, addEnergy } from '../../js/sim/energy.js';
import { HEARD_STRIDE } from '../../js/sim/world.js';
import { addAgent, rebuild, senseWorld } from './helpers/sense-world.js';

const CH_THREAT = 2;

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {{w: ReturnType<typeof senseWorld>, a: number}} a world with one forager ready to call
 */
function caller(over = {}) {
    const w = senseWorld({ callRadius: 300, callTicks: 10, alarmCost: 4, ...over });
    const a = addAgent(w, 500, 500, 20);
    addEnergy(w, a, 100, ENERGY_SOURCE.INITIAL);
    w.outputs[a * OUTPUT_COUNT + OUTPUT_INDEX.ALARM] = 1;
    return { w, a };
}

/**
 * @param {ReturnType<typeof senseWorld>} w the world
 * @param {number} slot the agent
 * @param {number} ray the ray index
 * @param {number} value the threat value
 * @returns {void}
 */
function setThreat(w, slot, ray, value) {
    w.inputs[slot * w.layout.rawInputCount + ray * RAY_CHANNELS + CH_THREAT] = value;
}

describe('alarmSeen', () => {
    it('is set when a threat is on any of the rays at call time', () => {
        const { w, a } = caller();
        setThreat(w, a, w.config.rayCount - 1, 0.4);
        signalAll(w, rebuild(w));
        expect([w.alarmTimer[a], w.alarmSeen[a]]).toEqual([10, 1]);
    });

    it('stays 0 for a call with no threat in view, which still pays, lays danger and is heard', () => {
        const { w, a } = caller();
        const b = addAgent(w, 500, 450, 20);
        addEnergy(w, b, 100, ENERGY_SOURCE.INITIAL);
        signalAll(w, rebuild(w));
        expect([w.alarmTimer[a], w.alarmSeen[a], w.energy[a]]).toEqual([10, 0, 96]);
        expect(w.danger.some((/** @type {number} */ v) => v > 0)).toBe(true);
        expect(w.heard[b * HEARD_STRIDE]).toBeGreaterThan(0);
    });

    it('is read again at the next call', () => {
        const { w, a } = caller({ callTicks: 1 });
        setThreat(w, a, 0, 1);
        signalAll(w, rebuild(w));
        expect(w.alarmSeen[a]).toBe(1);
        setThreat(w, a, 0, 0);
        signalAll(w, rebuild(w));
        expect(w.alarmSeen[a]).toBe(0);
    });
});
