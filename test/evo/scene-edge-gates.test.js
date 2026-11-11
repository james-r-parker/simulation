// The two share detectors of the low-density edge (low-density-edge.md, T6): the unreached-mate share and the split-gate
// shares, on real worlds with state planted in the slots, and the gate order against the sim's own predicates.

import { describe, expect, it } from 'vitest';
import { readyBeforeGate, splitGateOpen } from '../../js/sim/reproduction.js';
import { SEX } from '../../js/sim/sex.js';
import { UNPROVEN_KIDS_BRAKE } from '../../js/sim/proof.js';
import {
    GATES,
    createEdgeGates,
    edgeGateMetrics,
    firstClosedGate,
    sampleEdgeGates,
} from '../../js/evo/scene-edge-gates.js';
import { directionOf, intendedOf, namesOf } from './helpers/metric-registry.js';
import { huntRun, FORAGER, PREDATOR } from './helpers/hunt-scene.js';

const TICK = 5000;
const OVER = {
    maxAgents: 40,
    maxFood: 4,
    splitMateScarceTicks: 100,
    splitClonalMax: 3,
    splitMinEnergy: 900,
    splitDeliberateMin: 50,
    splitDeliberateShareMin: 0.5,
    splitMaxPerLife: 2,
    maxBirthsPerWindow: 1,
    birthWindowTicks: 1000,
    mateMinEnergy: 100,
    mateRange: 100,
};

/**
 * @param {Record<string, any>} [extra] more config overrides
 * @returns {{world: any, spawn: (spec?: number) => number}} a world at `TICK` and a spawn of mature, rich, rested prey
 *   that are open to every split gate and have seen no mate for a long while
 */
function setup(extra = {}) {
    const { world, spawn } = huntRun({ over: { ...OVER, ...extra } });
    world.tick = TICK;
    return {
        world,
        spawn(spec = FORAGER) {
            const slot = spawn(spec);
            open(world, slot);
            return slot;
        },
    };
}

/**
 * Plants the state of a prey no split gate holds.
 * @param {any} world the world
 * @param {number} slot the prey
 * @returns {void}
 */
function open(world, slot) {
    world.ageTicks[slot] = 100;
    world.cooldown[slot] = 0;
    world.pregnancy[slot] = 0;
    world.energy[slot] = 1500;
    world.mateSeenAt[slot] = 0;
    world.clonalDepth[slot] = 0;
    world.deliberateIntake[slot] = 100;
    world.mealsTotal[slot] = 4;
    world.mealsDeliberate[slot] = 4;
    world.proven[slot] = 0;
    world.unprovenKids[slot] = 0;
    world.splitsDone[slot] = 0;
    world.birthRing.fill(0);
}

/** The plants that close one gate each. */
const CLOSE = {
    seen: (/** @type {any} */ w, /** @type {number} */ s) => (w.mateSeenAt[s] = TICK - 10),
    clonal: (/** @type {any} */ w, /** @type {number} */ s) => (w.clonalDepth[s] = 3),
    energy: (/** @type {any} */ w, /** @type {number} */ s) => (w.energy[s] = 100),
    merit: (/** @type {any} */ w, /** @type {number} */ s) => (w.deliberateIntake[s] = 10),
    meritShare: (/** @type {any} */ w, /** @type {number} */ s) => (w.mealsDeliberate[s] = 1),
    meritNoMeals: (/** @type {any} */ w, /** @type {number} */ s) => {
        w.mealsTotal[s] = 0;
        w.mealsDeliberate[s] = 0;
    },
    proof: (/** @type {any} */ w, /** @type {number} */ s) => {
        w.proven[s] = 1;
        w.unprovenKids[s] = UNPROVEN_KIDS_BRAKE;
    },
    cap: (/** @type {any} */ w, /** @type {number} */ s) => (w.splitsDone[s] = 2),
    budget: (/** @type {any} */ w, /** @type {number} */ s) => (w.birthRing[s] = TICK),
};

describe('firstClosedGate', () => {
    it('is null for a prey no gate holds', () => {
        const { world, spawn } = setup();
        expect(firstClosedGate(world, spawn())).toBeNull();
    });

    it('names the gate that holds a prey, for each of the six', () => {
        const { world, spawn } = setup();
        const cases = /** @type {const} */ ([
            ['seen', 'seen'],
            ['clonal', 'clonal'],
            ['energy', 'energy'],
            ['merit', 'merit'],
            ['meritShare', 'merit'],
            ['meritNoMeals', 'merit'],
            ['proof', 'proof'],
            ['cap', 'other'],
            ['budget', 'other'],
        ]);
        for (const [plant, gate] of cases) {
            const slot = spawn();
            CLOSE[plant](world, slot);
            expect(firstClosedGate(world, slot), plant).toBe(gate);
        }
    });

    it('names the first closed gate in the doc order when several hold a prey', () => {
        const { world, spawn } = setup();
        const slot = spawn();
        const order = /** @type {const} */ (['proof', 'merit', 'energy', 'clonal', 'seen']);
        const expected = ['proof', 'merit', 'energy', 'clonal', 'seen'];
        order.forEach((plant, i) => {
            CLOSE[plant](world, slot);
            expect(firstClosedGate(world, slot), `after ${plant}`).toBe(expected[i]);
        });
        CLOSE.cap(world, slot);
        expect(firstClosedGate(world, slot)).toBe('seen');
        expect(GATES).toEqual(['seen', 'clonal', 'energy', 'merit', 'proof', 'other']);
    });

    it('agrees with the sim: open exactly when readyBeforeGate and splitGateOpen both let a mature prey split', () => {
        const { world, spawn } = setup();
        const slot = spawn();
        const plants = Object.values(CLOSE);
        for (let mask = 0; mask < 1 << plants.length; mask++) {
            open(world, slot);
            plants.forEach((plant, i) => (mask >> i) & 1 && plant(world, slot));
            const simOpen = readyBeforeGate(world, slot) && splitGateOpen(world, slot);
            expect(firstClosedGate(world, slot) === null, `mask ${mask}`).toBe(simOpen);
        }
    });
});

describe('the split-gate shares', () => {
    it('are shares of the mature, rested, not-pregnant prey, sum to the blocked share, and leave the open prey out', () => {
        const { world, spawn } = setup();
        // Ten eligible prey: 1 seen, 2 clonal, 1 energy, 1 merit, 1 proof, 1 other, 3 open.
        const gated = /** @type {const} */ (['seen', 'clonal', 'clonal', 'energy', 'merit', 'proof', 'cap']);
        for (const plant of gated) {
            CLOSE[plant](world, spawn());
        }
        for (let i = 0; i < 3; i++) {
            spawn();
        }
        // Not eligible: immature, pregnant, resting, and a hunter (which is no prey).
        CLOSE.energy(world, spawn());
        const young = spawn();
        world.ageTicks[young] = 5;
        const carrying = spawn();
        world.pregnancy[carrying] = 3;
        const resting = spawn();
        world.cooldown[resting] = 3;
        spawn(PREDATOR);
        const gates = createEdgeGates(40);
        sampleEdgeGates(gates, world);
        const m = edgeGateMetrics(gates);
        const names = /** @type {Record<string, string>} */ ({
            seen: 'eval.edge_split_blocked_share.seen',
            clonal: 'eval.edge_split_blocked_share.clonal',
            energy: 'eval.edge_split_blocked_share.energy',
            merit: 'eval.edge_split_blocked_share.merit',
            proof: 'eval.edge_split_blocked_share.proof',
            other: 'eval.edge_split_blocked_share.other',
        });
        const share = (/** @type {string} */ g) => /** @type {any} */ (m)[names[g]].value;
        expect(share('seen')).toBeCloseTo(1 / 11, 12);
        expect(share('clonal')).toBeCloseTo(2 / 11, 12);
        expect(share('energy')).toBeCloseTo(2 / 11, 12);
        expect(share('merit')).toBeCloseTo(1 / 11, 12);
        expect(share('proof')).toBeCloseTo(1 / 11, 12);
        expect(share('other')).toBeCloseTo(1 / 11, 12);
        const blocked = GATES.reduce((sum, g) => sum + share(g), 0);
        expect(blocked).toBeCloseTo(8 / 11, 12);
    });

    it('pool the prey of several edge checkpoints', () => {
        const { world, spawn } = setup();
        CLOSE.seen(world, spawn());
        const gates = createEdgeGates(40);
        sampleEdgeGates(gates, world);
        const second = spawn();
        sampleEdgeGates(gates, world);
        expect(second).toBeGreaterThan(0);
        // First sample: 1 of 1 held by seen. Second: 1 of 2.
        expect(edgeGateMetrics(gates)['eval.edge_split_blocked_share.seen']).toEqual({ value: 2 / 3 });
    });

    it('read only as many prey as the list holds', () => {
        const { world, spawn } = setup();
        for (let i = 0; i < 5; i++) {
            CLOSE.clonal(world, spawn());
        }
        const gates = createEdgeGates(3);
        sampleEdgeGates(gates, world);
        expect(edgeGateMetrics(gates)['eval.edge_split_blocked_share.clonal']).toEqual({ value: 1 });
        expect(gates.eligible).toBe(3);
    });
});

describe('the unreached-mate share', () => {
    /**
     * @param {any} world the world
     * @param {number} slot an agent
     * @param {{x: number, y: number, sex?: number}} at its place and sex
     * @returns {void}
     */
    function place(world, slot, { x, y, sex }) {
        world.x[slot] = x;
        world.y[slot] = y;
        if (sex !== undefined) {
            world.sex[slot] = sex;
        }
    }

    it('counts a ready female that saw a mate in the latest sense and has none within reach', () => {
        const { world, spawn } = setup();
        const female = spawn();
        const male = spawn();
        place(world, female, { x: 100, y: 100, sex: SEX.FEMALE });
        place(world, male, { x: 400, y: 100, sex: SEX.MALE });
        world.mateSeenAt[female] = TICK - 1;
        const gates = createEdgeGates(40);
        sampleEdgeGates(gates, world);
        // The only ready female is `female` (the male is not a female): 1 of 1.
        expect(edgeGateMetrics(gates)['eval.edge_mate_unreached_share']).toEqual({ value: 1 });
    });

    it('does not count a female with a possible mate inside size + size + mateRange', () => {
        const { world, spawn } = setup();
        const female = spawn();
        const male = spawn();
        const reach = world.size[female] + world.size[male] + world.config.mateRange;
        place(world, female, { x: 100, y: 100, sex: SEX.FEMALE });
        place(world, male, { x: 100 + reach - 1, y: 100, sex: SEX.MALE });
        world.mateSeenAt[female] = TICK - 1;
        const gates = createEdgeGates(40);
        sampleEdgeGates(gates, world);
        expect(edgeGateMetrics(gates)['eval.edge_mate_unreached_share']).toEqual({ value: 0 });
        // One unit past the reach it is unreached.
        place(world, male, { x: 100 + reach + 1, y: 100 });
        const past = createEdgeGates(40);
        sampleEdgeGates(past, world);
        expect(edgeGateMetrics(past)['eval.edge_mate_unreached_share']).toEqual({ value: 1 });
    });

    it('counts a mate that is no possible mate (immature, same sex) or no prey at all (a hunter) as none in reach', () => {
        const { world, spawn } = setup();
        const female = spawn();
        place(world, female, { x: 100, y: 100, sex: SEX.FEMALE });
        world.mateSeenAt[female] = TICK - 1;
        const kid = spawn();
        place(world, kid, { x: 110, y: 100, sex: SEX.MALE });
        world.ageTicks[kid] = 5;
        const hunter = spawn(PREDATOR);
        place(world, hunter, { x: 105, y: 100, sex: SEX.MALE });
        const sister = spawn();
        place(world, sister, { x: 110, y: 110, sex: SEX.FEMALE });
        const gates = createEdgeGates(40);
        sampleEdgeGates(gates, world);
        // Ready females: `female` and `sister`; only `female` saw a mate this sense.
        expect(edgeGateMetrics(gates)['eval.edge_mate_unreached_share']).toEqual({ value: 1 / 2 });
    });

    it('leaves a ready female that saw no mate in the numerator, and a female that is not ready out of the whole', () => {
        const { world, spawn } = setup();
        const blind = spawn();
        place(world, blind, { x: 100, y: 100, sex: SEX.FEMALE });
        world.mateSeenAt[blind] = TICK - 2;
        const tired = spawn();
        place(world, tired, { x: 300, y: 300, sex: SEX.FEMALE });
        world.mateSeenAt[tired] = TICK - 1;
        world.cooldown[tired] = 5;
        const gates = createEdgeGates(40);
        sampleEdgeGates(gates, world);
        expect(edgeGateMetrics(gates)['eval.edge_mate_unreached_share']).toEqual({ value: 0 });
    });
});

describe('the share detectors with nothing to read', () => {
    const NO_CHECKPOINT = 'no edge checkpoint (a 1000-tick checkpoint after burn-in with 1 to 99 prey)';

    it('read null with a reason when no edge checkpoint was sampled', () => {
        const m = edgeGateMetrics(createEdgeGates(40));
        expect(Object.keys(m)).toHaveLength(7);
        for (const result of Object.values(m)) {
            expect(result).toEqual({ value: null, reason: NO_CHECKPOINT });
        }
    });

    it('read null with a reason when no ready female or no eligible prey stood at the checkpoints', () => {
        const { world, spawn } = setup();
        const kid = spawn();
        world.ageTicks[kid] = 1;
        const gates = createEdgeGates(40);
        sampleEdgeGates(gates, world);
        const m = edgeGateMetrics(gates);
        expect(m['eval.edge_mate_unreached_share']).toEqual({
            value: null,
            reason: 'no ready prey female at an edge checkpoint',
        });
        expect(m['eval.edge_split_blocked_share.seen']).toEqual({
            value: null,
            reason: 'no mature, rested, not-pregnant prey at an edge checkpoint',
        });
    });
});

describe('the registry entries of the share detectors', () => {
    it('are the names the module produces, all watch metrics whose intended direction is lower', () => {
        const names = namesOf('js/evo/scene-edge-gates.js');
        expect(names).toEqual(Object.keys(edgeGateMetrics(createEdgeGates(1))).sort());
        for (const name of names) {
            expect(directionOf(name), name).toBe('watch');
            expect(intendedOf(name), name).toBe('lower');
        }
    });
});
