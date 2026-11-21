import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { signalAll } from '../../js/sim/calls.js';
import { createConfig } from '../../js/sim/config.js';
import { ENERGY_SOURCE, addEnergy } from '../../js/sim/energy.js';
import { addAgent, rebuild, senseWorld } from './helpers/sense-world.js';
import { setSpec } from './helpers/body.js';

const FORAGER = 0;
const SCOUT = 3;
const BASE = {
    callRadius: 300,
    callTicks: 10,
    alarmCost: 4,
    huntCallCost: 6,
    smokeCost: 20,
    smokeCooldown: 50,
};

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {ReturnType<typeof senseWorld>}
 */
function build(over = {}) {
    return senseWorld({ ...BASE, ...over });
}

/**
 * The scout's `body` overrides (its call radius and alarm cost are body entries), as config overrides.
 * @param {Record<string, number>} body the lane multipliers
 * @returns {Record<string, any>}
 */
function scoutBody(body) {
    const base = createConfig().specialisations;
    return { specialisations: { ...base, scout: { ...base.scout, body } } };
}

/**
 * @param {ReturnType<typeof senseWorld>} w the world
 * @param {{x?: number, y?: number, spec?: number, energy?: number}} [a] agent options
 * @returns {number} the slot
 */
function agent(w, { x = 500, y = 500, spec = FORAGER, energy = 100 } = {}) {
    const slot = addAgent(w, x, y, 20);
    setSpec(w, slot, spec); // a birth writes the lanes at the spec's bases
    addEnergy(w, slot, energy, ENERGY_SOURCE.INITIAL);
    return slot;
}

describe('scout call multipliers (prey-guilds T9)', () => {
    it('scales alarmCost by scoutAlarmCostMultiplier for scouts only', () => {
        const w = build(scoutBody({ alarmCost: 0.5 }));
        const scout = agent(w, { x: 500, y: 500, spec: SCOUT, energy: 100 });
        const forager = agent(w, { x: 900, y: 500, spec: FORAGER, energy: 100 });
        w.outputs[scout * OUTPUT_COUNT + OUTPUT_INDEX.ALARM] = 1;
        w.outputs[forager * OUTPUT_COUNT + OUTPUT_INDEX.ALARM] = 1;

        signalAll(w, rebuild(w));

        expect(w.energy[scout]).toBe(98);
        expect(w.energy[forager]).toBe(96);
    });

    it('allows a scout with low energy to call when scoutAlarmCostMultiplier makes the cost affordable', () => {
        const w = build(scoutBody({ alarmCost: 0 }));
        const scout = agent(w, { x: 500, y: 500, spec: SCOUT, energy: 1 });
        w.outputs[scout * OUTPUT_COUNT + OUTPUT_INDEX.ALARM] = 1;

        signalAll(w, rebuild(w));

        expect(w.alarmTimer[scout]).toBe(BASE.callTicks);
        expect(w.energy[scout]).toBe(1);
    });

    it('scales callRadius by scoutCallRadiusMultiplier for scouts only', () => {
        const w = build(scoutBody({ callRadius: 1.5 }));
        const scout = agent(w, { x: 500, y: 500, spec: SCOUT });
        const hearerNearScout = agent(w, { x: 850, y: 500, spec: FORAGER });
        const forager = agent(w, { x: 1500, y: 500, spec: FORAGER });
        const hearerNearForager = agent(w, { x: 1850, y: 500, spec: FORAGER });
        w.outputs[scout * OUTPUT_COUNT + OUTPUT_INDEX.ALARM] = 1;
        w.outputs[forager * OUTPUT_COUNT + OUTPUT_INDEX.ALARM] = 1;

        signalAll(w, rebuild(w));

        expect(w.heard[hearerNearScout * 6]).toBeCloseTo(1 - 350 / 450, 5);
        expect(w.heard[hearerNearForager * 6]).toBe(0);
    });
});
