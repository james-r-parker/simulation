import v8 from 'node:v8';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { laneBases } from '../../js/sim/body-lanes.js';
import { createConfig } from '../../js/sim/config.js';
import { SPEC_NAMES } from '../../js/sim/specs.js';
import { EVENT_TYPE, createEventRing } from '../../js/sim/events.js';
import { createSimLog, drainEvents } from '../../js/sim/log.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';
import {
    SPRINT_REST_EFFORT,
    createSprintStore,
    resetSprintSlot,
    sprintEffort,
    stepSprintStore as stepStore,
} from '../../js/sim/sprint-store.js';
import { storeFactor } from './helpers/legacy-rules.js';

const FORAGER = 0;
const PREDATOR = 1;

/**
 * @param {Record<string, any>} [overrides] config overrides
 * @returns {Readonly<Record<string, any>>} a config with the store on
 */
const storeConfig = (overrides = {}) => createConfig({ sprintStoreEnabled: true, ...overrides });

/**
 * The step on a hand-built world: the `spent` effect reads the store from `world.sprintStore`, which a real world holds.
 * @param {import('../../js/sim/sprint-store.js').SprintStore} store the store
 * @param {Record<string, any>} w the arrays
 * @returns {void}
 */
function stepSprintStore(store, w) {
    w.sprintStore = store;
    stepStore(store, w);
}

/**
 * @param {number} n slots
 * @param {Readonly<Record<string, any>>} config the config the lanes come from
 * @returns {Record<string, any>} the arrays the step reads and writes, every slot alive and a forager with its lanes,
 *   with a tick and an event ring
 */
function bodies(n, config) {
    const { sprintDrain, sprintRefill } = laneBases(config, SPEC_NAMES[FORAGER]);
    return {
        config,
        lanes: {
            sprintDrain: new Float64Array(n).fill(sprintDrain),
            sprintRefill: new Float64Array(n).fill(sprintRefill),
        },
        alive: new Uint8Array(n).fill(1),
        spec: new Uint8Array(n),
        genomeId: new Uint32Array(n).map((_, slot) => 100 + slot),
        outputs: new Float32Array(n * OUTPUT_COUNT),
        sprintFactor: new Float64Array(n).fill(1),
        tick: 0,
        events: createEventRing(2 * n + 8),
        sprintStore: undefined,
    };
}

/**
 * Makes a body of another specialisation, its lanes at that specialisation's bases.
 * @param {ReturnType<typeof bodies>} w the arrays
 * @param {number} slot the body
 * @param {number} spec the specialisation
 */
function specAs(w, slot, spec) {
    const bases = laneBases(w.config, SPEC_NAMES[spec]);
    w.spec[slot] = spec;
    w.lanes.sprintDrain[slot] = bases.sprintDrain;
    w.lanes.sprintRefill[slot] = bases.sprintRefill;
}

/**
 * @param {ReturnType<typeof bodies>} w the arrays
 * @param {number} slot the body
 * @param {{sprint: number, thrust: number}} out its sprint and thrust outputs
 */
function drive(w, slot, { sprint, thrust }) {
    w.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.SPRINT] = sprint;
    w.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.THRUST] = thrust;
}

describe('createSprintStore', () => {
    it('starts every slot full, and the drain lane is priced per specialisation', () => {
        const config = storeConfig({
            sprintDrain: 0.01,
            specialisations: { predator: { sprintDrainMultiplier: 2 } },
        });
        const store = createSprintStore(config, 4);
        expect([...store.level]).toEqual([1, 1, 1, 1]);
        expect(laneBases(config, 'forager').sprintDrain).toBe(0.01);
        expect(laneBases(config, 'predator').sprintDrain).toBe(0.02);
        expect([store.restThrust, store.floor]).toEqual([0.2, 0.3]);
    });
});

// First in the file: the optimizing compiler inlines the effect readers only while their call sites have seen few shapes,
// and the tests below drive other worlds through the same code.
describe('stepSprintStore allocation', () => {
    it('allocates nothing', () => {
        v8.setFlagsFromString('--expose-gc');
        const gc = vm.runInNewContext('gc');
        const config = storeConfig();
        const store = createSprintStore(config, 500);
        const w = bodies(500, config);
        for (let slot = 0; slot < 500; slot++) {
            drive(w, slot, { sprint: slot % 2, thrust: 0 });
        }
        const passes = 300;
        const run = () => {
            for (let i = 0; i < passes; i++) {
                stepSprintStore(store, w);
            }
        };
        for (let warm = 0; warm < 5; warm++) {
            run(); // the optimizing compiler needs a few passes through the effect readers to inline them
        }
        let best = Infinity;
        for (let window = 0; window < 10; window++) {
            gc();
            const before = process.memoryUsage().heapUsed;
            run();
            best = Math.min(best, process.memoryUsage().heapUsed - before);
        }
        expect(best).toBeLessThan(passes * 4);
    });
});

describe('storeFactor', () => {
    const store = createSprintStore(storeConfig({ sprintFloor: 0.3 }), 4);

    it('is 1 at or above the floor, falls linearly under it and is 0 when empty', () => {
        store.level.set([1, 0.3, 0.15, 0]);
        expect([0, 1, 2, 3].map((slot) => storeFactor({ sprintStore: store }, slot))).toEqual([1, 1, 0.5, 0]);
    });
});

describe('stepSprintStore', () => {
    it('drains while sprinting and writes the factor of the store as the tick began', () => {
        const config = storeConfig({ sprintDrain: 0.1, sprintFloor: 0.3 });
        const store = createSprintStore(config, 1);
        const w = bodies(1, config);
        drive(w, 0, { sprint: 1, thrust: 1 });
        store.level[0] = 0.35;
        stepSprintStore(store, w);
        expect(w.sprintFactor[0]).toBe(1);
        expect(store.level[0]).toBeCloseTo(0.25, 12);
        stepSprintStore(store, w);
        expect(w.sprintFactor[0]).toBeCloseTo(0.25 / 0.3, 12);
        for (let t = 0; t < 5; t++) {
            stepSprintStore(store, w);
        }
        expect(store.level[0]).toBe(0);
        stepSprintStore(store, w);
        expect(w.sprintFactor[0]).toBe(0);
    });

    it('refills only while not sprinting and thrust is under sprintRestThrust, never above 1', () => {
        const config = storeConfig({ sprintRefill: 0.25, sprintRestThrust: 0.2 });
        const store = createSprintStore(config, 3);
        const w = bodies(3, config);
        store.level.set([0.5, 0.5, 0.9]);
        drive(w, 0, { sprint: 0, thrust: 0.1 });
        drive(w, 1, { sprint: 0, thrust: 0.2 });
        drive(w, 2, { sprint: -1, thrust: -1 });
        stepSprintStore(store, w);
        expect([...store.level]).toEqual([0.75, 0.5, 1]);
    });

    it('drains a specialisation by its multiplier', () => {
        const config = storeConfig({
            sprintDrain: 0.01,
            specialisations: { predator: { sprintDrainMultiplier: 0.5 } },
        });
        const store = createSprintStore(config, 2);
        const w = bodies(2, config);
        specAs(w, 1, PREDATOR);
        drive(w, 0, { sprint: 1, thrust: 1 });
        drive(w, 1, { sprint: 1, thrust: 1 });
        stepSprintStore(store, w);
        expect(1 - store.level[0]).toBeCloseTo(0.01, 12);
        expect(1 - store.level[1]).toBeCloseTo(0.005, 12);
    });

    it('drains and refills each body by its own lanes, so two bodies of one specialisation can differ', () => {
        const config = storeConfig({ sprintDrain: 0.1, sprintRefill: 0.1, sprintRestThrust: 0.5 });
        const store = createSprintStore(config, 4);
        const w = bodies(4, config);
        w.lanes.sprintDrain[1] = 0.05;
        w.lanes.sprintRefill[3] = 0.2;
        store.level.set([1, 1, 0.5, 0.5]);
        drive(w, 0, { sprint: 1, thrust: 1 });
        drive(w, 1, { sprint: 1, thrust: 1 });
        stepSprintStore(store, w);
        expect([...store.level].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([0.9, 0.95, 0.6, 0.7]);
    });

    it('leaves dead slots alone', () => {
        const config = storeConfig();
        const store = createSprintStore(config, 2);
        const w = bodies(2, config);
        w.alive[1] = 0;
        w.sprintFactor[1] = 7;
        drive(w, 1, { sprint: 1, thrust: 1 });
        stepSprintStore(store, w);
        expect([store.level[1], w.sprintFactor[1]]).toEqual([1, 7]);
    });

    it('matches a naive reference of the graded sprint over 1000 random ticks', () => {
        const config = storeConfig({ specialisations: { predator: { sprintDrainMultiplier: 2 } } });
        const n = 6;
        const store = createSprintStore(config, n);
        const w = bodies(n, config);
        for (let slot = 0; slot < n; slot++) {
            specAs(w, slot, slot % 2);
        }
        const ref = Array.from({ length: n }, () => 1);
        const rng = createRng(7);
        for (let t = 0; t < 1000; t++) {
            const expected = [];
            for (let slot = 0; slot < n; slot++) {
                const sprint = Math.fround(2 * nextFloat(rng) - 1);
                const thrust = nextFloat(rng);
                drive(w, slot, { sprint, thrust });
                const effort = sprint < 0.05 ? 0 : sprint;
                // The `spent` effect's factor is `1 + -1 x (1 - level / floor)`, which is `level / floor` to a rounding.
                const spent = ref[slot] >= config.sprintFloor ? 0 : 1 - ref[slot] / config.sprintFloor;
                expected.push((1 + -1 * spent) * effort);
                const drain = config.sprintDrain * (slot % 2 === 1 ? 2 : 1);
                if (effort > 0) {
                    ref[slot] = Math.max(0, ref[slot] - drain * effort);
                } else if (Math.fround(thrust) < config.sprintRestThrust) {
                    ref[slot] = Math.min(1, ref[slot] + config.sprintRefill);
                }
            }
            stepSprintStore(store, w);
            expect([...w.sprintFactor]).toEqual(expected);
            expect([...store.level]).toEqual(ref);
        }
    });

    it.each([
        [0, 0, 1],
        [0.5, 0.5, 1 - 0.1 * 0.5],
        [1, 1, 0.9],
        [0.04, 0, 1],
    ])(
        'at SPRINT %f writes the factor %f and drains the store to %f (effort 0, 0.5 and 1, and a trace)',
        (sprint, factor, left) => {
            const config = storeConfig({ sprintDrain: 0.1, sprintRestThrust: 0.2 });
            const store = createSprintStore(config, 1);
            const w = bodies(1, config);
            drive(w, 0, { sprint, thrust: 0.5 });
            stepSprintStore(store, w);
            expect(w.sprintFactor[0]).toBeCloseTo(factor, 6);
            expect(store.level[0]).toBeCloseTo(left, 6);
        },
    );

    it('refills only at effort 0: a trace of effort under SPRINT_REST_EFFORT does not block it', () => {
        const config = storeConfig({ sprintRefill: 0.1, sprintRestThrust: 0.2 });
        const store = createSprintStore(config, 2);
        const w = bodies(2, config);
        store.level.set([0.5, 0.5]);
        drive(w, 0, { sprint: SPRINT_REST_EFFORT / 2, thrust: 0 });
        drive(w, 1, { sprint: 0.3, thrust: 0 });
        stepSprintStore(store, w);
        expect(store.level[0]).toBeCloseTo(0.6, 9);
        expect(store.level[1]).toBeLessThan(0.5);
    });
});

describe('SprintSpent', () => {
    it('is pushed once, when a store first falls under the floor in a sprint, and logged at debug', () => {
        const config = storeConfig({ sprintDrain: 0.1, sprintFloor: 0.3 });
        const store = createSprintStore(config, 2);
        const w = bodies(2, config);
        specAs(w, 1, PREDATOR);
        drive(w, 1, { sprint: 1, thrust: 1 });
        store.level[1] = 0.45;
        for (let t = 0; t < 4; t++) {
            w.tick = t;
            stepSprintStore(store, w);
        }
        expect(w.events.count).toBe(1);
        expect([...w.events.data.slice(0, 5)]).toEqual([EVENT_TYPE.SPRINT_SPENT, 1, 1, 101, PREDATOR]);
        /** @type {Record<string, any>[]} */
        const records = [];
        drainEvents(
            /** @type {any} */ (w),
            createSimLog((r) => records.push(r), { level: 'debug' }),
        );
        expect(records).toEqual([
            expect.objectContaining({ level: 'debug', event: 'SprintSpent', tick: 1, slot: 1, genomeId: 101, spec: 1 }),
        ]);
    });
});

describe('resetSprintSlot', () => {
    it('fills the store and the factor of a slot being born into', () => {
        const store = createSprintStore(storeConfig(), 2);
        const factor = new Float64Array([0.2, 0.4]);
        store.level.set([0, 0.1]);
        resetSprintSlot(store, factor, 1);
        expect([...store.level]).toEqual([0, 1]);
        expect([...factor]).toEqual([0.2, 1]);
    });
});

describe('the sprint store keys', () => {
    it('are off by default and validated', () => {
        const config = createConfig({});
        expect(config.sprintStoreEnabled).toBe(false);
        expect(config.specialisations.predator.sprintDrainMultiplier).toBe(1);
        expect(() => createConfig({ sprintFloor: 0 })).toThrow(/sprintFloor/);
        expect(() => createConfig({ sprintDrain: 0 })).toThrow(/sprintDrain/);
        expect(() => createConfig({ sprintRefill: -0.1 })).toThrow(/sprintRefill/);
        expect(() => createConfig({ specialisations: { scout: { sprintDrainMultiplier: 0 } } })).toThrow(
            /sprintDrainMultiplier/,
        );
    });
});

describe('sprintEffort', () => {
    it('is the graded effort with the store on and the all-or-nothing sprint with it off', () => {
        const on = bodies(1, storeConfig());
        on.sprintStore = createSprintStore(storeConfig(), 1);
        const off = bodies(1, createConfig({}));
        for (const [sprint, graded, whole] of [
            [-0.5, 0, 0],
            [0.03, 0, 1],
            [0.5, 0.5, 1],
            [1, 1, 1],
        ]) {
            drive(on, 0, { sprint, thrust: 0 });
            drive(off, 0, { sprint, thrust: 0 });
            expect(sprintEffort(on, 0)).toBeCloseTo(graded, 6);
            expect(sprintEffort(off, 0)).toBe(whole);
        }
    });
});
