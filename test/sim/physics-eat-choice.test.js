// eat-choice (docs/designs/eat-choice.md): G1b, a grazing forager moves at `grazeThrust`; G2, a full store slows.
import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { actAll } from '../../js/sim/physics.js';
import { allocateWorld } from '../../js/sim/world.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

const FORAGER = 0;
const PREDATOR = 1;

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {any} a world with no agents and no handling slow-down
 */
function setup(over = {}) {
    return allocateWorld(
        createConfig({ ...SIMPLE_WORLD, maxAgents: 8, initialAgents: 0, minAgents: 0, handlingTicks: 0, ...over }),
    );
}

/**
 * Places an agent facing +x with full thrust and turn.
 * @param {any} w the world
 * @param {number} slot the slot
 * @param {{ spec: number, bite: number, energy?: number }} a the agent
 * @returns {number} the slot
 */
function put(w, slot, a) {
    w.alive[slot] = 1;
    w.size[slot] = 25;
    w.spec[slot] = a.spec;
    w.energy[slot] = a.energy ?? 100;
    w.temperature[slot] = w.config.temperatureStart;
    const o = slot * OUTPUT_COUNT;
    w.outputs[o + OUTPUT_INDEX.THRUST] = 1;
    w.outputs[o + OUTPUT_INDEX.TURN] = 0.5;
    w.outputs[o + OUTPUT_INDEX.BITE] = a.bite;
    return slot;
}

/**
 * @param {Record<string, any>} over config overrides
 * @param {{ spec: number, bite: number, energy?: number }} a the agent
 * @returns {{ thrust: number, turn: number }} the thrust (the speed gained from rest) and turn rate of one `actAll`
 */
function act(over, a) {
    const w = setup(over);
    put(w, 0, a);
    actAll(w);
    return { thrust: Math.hypot(w.vx[0], w.vy[0]), turn: w.turnRate[0] };
}

describe('actAll: grazeThrust (eat-choice G1b)', () => {
    it('leaves thrust unchanged at grazeThrust 1, biting or not', () => {
        const free = act({}, { spec: FORAGER, bite: 0 });
        expect(act({ grazeThrust: 1 }, { spec: FORAGER, bite: 1 })).toEqual(free);
    });

    it("scales a biting forager's thrust by grazeThrust, and not its turn", () => {
        const free = act({ grazeThrust: 0.3 }, { spec: FORAGER, bite: 0 });
        const grazing = act({ grazeThrust: 0.3 }, { spec: FORAGER, bite: 0.2 });
        expect(grazing.thrust).toBeCloseTo(free.thrust * 0.3, 6);
        expect(grazing.turn).toBe(free.turn);
    });

    it("leaves a hunter's thrust alone while it bites", () => {
        const free = act({ grazeThrust: 0.3 }, { spec: PREDATOR, bite: 0 });
        expect(act({ grazeThrust: 0.3 }, { spec: PREDATOR, bite: 1 })).toEqual(free);
    });

    it('refuses a grazeThrust outside 0 to 1', () => {
        expect(() => createConfig({ grazeThrust: 1.1 })).toThrow('grazeThrust');
        expect(() => createConfig({ grazeThrust: -0.1 })).toThrow('grazeThrust');
        expect(createConfig().grazeThrust).toBe(1);
    });
});

describe('actAll: fatSlowShare (eat-choice G2)', () => {
    /**
     * @param {number} spec the specialisation
     * @returns {number} its full store
     */
    function full(spec) {
        return setup().maxEnergyBySpec[spec];
    }

    it('leaves thrust and turn unchanged at fatSlowShare 0, at any store', () => {
        for (const spec of [FORAGER, PREDATOR]) {
            const empty = act({}, { spec, bite: 0, energy: 1 });
            expect(act({ fatSlowShare: 0 }, { spec, bite: 0, energy: full(spec) })).toEqual(empty);
        }
    });

    it('slows thrust and turn by 1 - fatSlowShare at a full store, for a forager and a hunter alike', () => {
        for (const spec of [FORAGER, PREDATOR]) {
            const free = act({}, { spec, bite: 0, energy: full(spec) });
            const fat = act({ fatSlowShare: 0.4 }, { spec, bite: 0, energy: full(spec) });
            expect(fat.thrust).toBeCloseTo(free.thrust * 0.6, 6);
            expect(fat.turn).toBeCloseTo(free.turn * 0.6, 6);
        }
    });

    it('slows in proportion to the store share', () => {
        const spec = FORAGER;
        const free = act({}, { spec, bite: 0, energy: full(spec) / 4 });
        const fat = act({ fatSlowShare: 0.4 }, { spec, bite: 0, energy: full(spec) / 4 });
        expect(fat.thrust).toBeCloseTo(free.thrust * 0.9, 6);
    });

    it('refuses a fatSlowShare below 0 or at 1', () => {
        expect(() => createConfig({ fatSlowShare: 1 })).toThrow('fatSlowShare');
        expect(() => createConfig({ fatSlowShare: -0.1 })).toThrow('fatSlowShare');
        expect(createConfig().fatSlowShare).toBe(0);
    });
});
