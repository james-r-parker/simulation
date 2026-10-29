import { afterEach, describe, expect, it, vi } from 'vitest';
import { OUTPUT_COUNT } from '../../js/sim/brain-layout.js';
import { detCos, detSin } from '../../js/sim/det-math.js';
import { createConfig } from '../../js/sim/config.js';
import { terrainRockCount } from '../../js/sim/terrain.js';
import { EVENT_STRIDE } from '../../js/sim/events.js';
import { HEARD_STRIDE, TIMER_CAP, allocAgent, allocateWorld, freeAgent, removeFood } from '../../js/sim/world.js';
import { FEATURES_OFF } from '../../scripts/lib/features-on.mjs';

const SMALL = {
    maxAgents: 8,
    initialAgents: 0,
    minAgents: 0,
    rayCount: 4,
    brainHidden: 3,
    maxFood: 10,
    initialFood: 0,
    fertileZoneMax: 3,
};

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {ReturnType<typeof allocateWorld>}
 */
function smallWorld(over = {}) {
    return allocateWorld(createConfig({ ...FEATURES_OFF, ...SMALL, ...over }));
}

/**
 * @param {ReturnType<typeof allocateWorld>} world
 * @param {number} slot
 */
function fillSlot(world, slot) {
    for (const { array, stride } of world.agentRows) {
        array.fill(1, slot * stride, (slot + 1) * stride);
    }
    world.alive[slot] = 1;
}

describe('allocateWorld', () => {
    it('tabulates the vision range by specialisation index and allocates the ray scratch', () => {
        const w = smallWorld();
        for (const s of Object.values(w.config.specialisations)) {
            expect(w.visionBySpec[s.index]).toBe(s.visionRange);
        }
        expect(w.rayScratch.length).toBeGreaterThan(0);
        expect(w.brainScratch.length).toBe(Math.max(w.config.brainHidden, w.layout.outputCount));
    });

    it('tabulates the bite, turn and sprint multipliers and the antenna by specialisation', () => {
        const w = smallWorld({ antennaAngle: 0.5 });
        expect(Array.from(w.biteBySpec)).toEqual([1, 8, 1, 1, 1]);
        expect(Array.from(w.turnBySpec)).toEqual([1, 0.7, 1, 1, 1]);
        expect(Array.from(w.sprintBySpec)).toEqual([1, 1.6, 1, 1, 1]);
        expect(w.antennaCos).toEqual(new Float64Array([detCos(0.5)]));
        expect(smallWorld({ biteArc: 0.5 }).biteCos).toEqual(new Float64Array([detCos(0.5)]));
        expect(w.antennaSin).toEqual(new Float64Array([detSin(0.5)]));
    });

    it('allocates the call, bite, cloud and hunt arrays with their types and sizes', () => {
        const w = smallWorld({ maxClouds: 5 });
        for (const name of ['alarmTimer', 'huntTimer', 'smokeTimer']) {
            expect([w[name].length, w[name]]).toEqual([8, expect.any(Uint16Array)]);
        }
        for (const name of ['lastBiteTick', 'prevBiter', 'prevBiteTick']) {
            expect([w[name].length, w[name]]).toEqual([8, expect.any(Uint32Array)]);
        }
        expect([w.heard.length, w.heard]).toEqual([8 * HEARD_STRIDE, expect.any(Float32Array)]);
        expect([w.cloudX.length, w.cloudY.length, w.cloudTtl.length]).toEqual([5, 5, 5]);
        expect(w.cloudTtl).toBeInstanceOf(Uint16Array);
        expect(w.cloudCount).toBe(0);
        expect(w.hunt).toBeInstanceOf(Float32Array);
        expect(w.hunt.length).toBe(w.danger.length);
    });

    it('sizes the agent arrays from the config', () => {
        const w = smallWorld();
        const { inputCount, weightCount } = w.layout;
        expect(w.alive.length).toBe(8);
        expect(w.inputs.length).toBe(8 * inputCount);
        expect(w.outputs.length).toBe(8 * OUTPUT_COUNT);
        expect(w.weights.length).toBe(8 * weightCount);
        expect(w.fatherWeights.length).toBe(8 * weightCount);
        expect(w.hidden.length).toBe(9 * 3);
        expect(w.weights).toBeInstanceOf(Float32Array);
        expect(w.energy).toBeInstanceOf(Float64Array);
        expect(w.genomeId).toBeInstanceOf(Uint32Array);
    });

    it('sizes food, obstacle, zone and pheromone arrays', () => {
        const w = smallWorld();
        expect(w.foodValue.length).toBe(10);
        expect(w.obsX.length).toBe(terrainRockCount(w.config));
        expect(w.zoneAlive.length).toBe(3);
        expect(w.danger.length).toBe(
            Math.ceil(w.config.worldWidth / w.config.pheromoneCellSize) *
                Math.ceil(w.config.worldHeight / w.config.pheromoneCellSize),
        );
    });

    it('allocates an event ring with the configured capacity', () => {
        const w = smallWorld();
        expect(w.events.capacity).toBe(w.config.eventCapacity);
        expect(w.events.data.length).toBe(w.config.eventCapacity * EVENT_STRIDE);
        expect(w.events.count).toBe(0);
    });

    it('allocates the contact list from maxContacts', () => {
        const w = smallWorld();
        expect(w.contacts.length).toBe(2 * w.config.maxContacts);
        expect(w.contactCount).toBe(0);
    });

    it('starts with zeroed scalars and unset rng', () => {
        const w = smallWorld();
        expect([w.tick, w.nextId, w.population, w.foodCount]).toEqual([0, 1, 0, 0]);
        expect(w.rng).toBeNull();
        expect(w.birthOptions).toEqual({ cause: 0, rng: null });
        expect(w.ledger.length).toBe(2);
        expect(w.point.length).toBe(2);
        expect(w.season.length).toBe(2);
    });

    it('builds the ray tables with ray 0 straight ahead', () => {
        const w = smallWorld();
        expect(w.rayCos.length).toBe(4);
        expect(w.rayCos[0]).toBe(1);
        expect(w.raySin[0]).toBe(0);
        expect(w.rayCos[1]).toBeCloseTo(0, 12);
        expect(w.raySin[1]).toBeCloseTo(1, 12);
    });

    it('exports the timer cap', () => {
        expect(TIMER_CAP).toBe(30);
    });
});

describe('allocAgent and freeAgent', () => {
    it('takes slots in order and counts the population', () => {
        const w = smallWorld();
        expect([allocAgent(w), allocAgent(w), allocAgent(w)]).toEqual([0, 1, 2]);
        expect(w.population).toBe(3);
        expect(w.alive[1]).toBe(1);
    });

    it('reuses the lowest freed slot', () => {
        const w = smallWorld();
        for (let i = 0; i < 4; i++) {
            allocAgent(w);
        }
        freeAgent(w, 2);
        freeAgent(w, 1);
        expect(w.population).toBe(2);
        expect(allocAgent(w)).toBe(1);
        expect(allocAgent(w)).toBe(2);
    });

    it('throws naming maxAgents when full', () => {
        const w = smallWorld();
        for (let i = 0; i < 8; i++) {
            allocAgent(w);
        }
        expect(() => allocAgent(w)).toThrow(/maxAgents \(8\)/);
    });

    it('zeroes every row of the freed slot and leaves neighbours untouched', () => {
        const w = smallWorld();
        for (let i = 0; i < 3; i++) {
            allocAgent(w);
            fillSlot(w, i);
        }
        w.hidden.fill(9, 8 * 3);
        freeAgent(w, 1);
        for (const { array, stride } of w.agentRows) {
            expect([...array.subarray(stride, 2 * stride)].every((/** @type {number} */ v) => v === 0)).toBe(true);
            expect([...array.subarray(0, stride)].every((/** @type {number} */ v) => v === 1)).toBe(true);
            expect([...array.subarray(2 * stride, 3 * stride)].every((/** @type {number} */ v) => v === 1)).toBe(true);
        }
        expect(w.hidden.subarray(3, 6).every((/** @type {number} */ v) => v === 0)).toBe(true);
        expect(w.hidden.subarray(8 * 3).every((/** @type {number} */ v) => v === 9)).toBe(true);
        expect(w.alive[1]).toBe(0);
    });

    it('throws when freeing a dead slot', () => {
        const w = smallWorld();
        expect(() => freeAgent(w, 3)).toThrow(/slot 3 is not alive/);
    });
});

describe('removeFood', () => {
    it('zeroes the food slot and decrements the count', () => {
        const w = smallWorld();
        for (const slot of [0, 1]) {
            w.foodAlive[slot] = 1;
            w.foodX[slot] = 5;
            w.foodValue[slot] = 3;
            w.foodAge[slot] = 2;
        }
        w.foodCount = 2;
        removeFood(w, 0);
        expect([w.foodAlive[0], w.foodX[0], w.foodValue[0], w.foodAge[0]]).toEqual([0, 0, 0, 0]);
        expect(w.foodValue[1]).toBe(3);
        expect(w.foodCount).toBe(1);
    });

    it('throws on a dead food slot', () => {
        expect(() => removeFood(smallWorld(), 0)).toThrow(/not alive/);
    });
});

describe('allocateWorld platform check', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('refuses a big-endian platform', () => {
        const config = createConfig({ ...FEATURES_OFF, ...SMALL });
        vi.stubGlobal(
            'Uint16Array',
            class {
                constructor() {
                    /** @type {ArrayBuffer} */
                    this.buffer = Uint8Array.of(0x01, 0x02).buffer;
                }
            },
        );
        expect(() => allocateWorld(config)).toThrow(
            'allocateWorld requires a little-endian platform; this one is big-endian',
        );
    });
});

describe('freeAgent new rows', () => {
    it('zeroes the timers, heard row and bite bookkeeping of the freed slot only', () => {
        const w = smallWorld();
        allocAgent(w);
        allocAgent(w);
        for (const name of ['alarmTimer', 'huntTimer', 'smokeTimer', 'lastBiteTick', 'prevBiter', 'prevBiteTick']) {
            w[name].fill(3);
        }
        w.heard.fill(0.5);
        freeAgent(w, 0);
        for (const name of ['alarmTimer', 'huntTimer', 'smokeTimer', 'lastBiteTick', 'prevBiter', 'prevBiteTick']) {
            expect([name, w[name][0], w[name][1]]).toEqual([name, 0, 3]);
        }
        expect(Array.from(w.heard.subarray(0, HEARD_STRIDE))).toEqual(new Array(HEARD_STRIDE).fill(0));
        expect(w.heard[HEARD_STRIDE]).toBe(0.5);
    });
});

describe('freeAgent hidden row', () => {
    it('zeroes the freed slot hidden row and leaves the other rows and the scratch row', () => {
        const w = smallWorld();
        const h = w.layout.hidden;
        for (let slot = 0; slot < 8; slot++) {
            allocAgent(w);
        }
        w.hidden.fill(1);
        freeAgent(w, 6);
        expect(Array.from(w.hidden.subarray(6 * h, 7 * h))).toEqual(new Array(h).fill(0));
        expect(w.hidden.subarray(0, 6 * h).every((/** @type {number} */ v) => v === 1)).toBe(true);
        expect(w.hidden.subarray(7 * h).every((/** @type {number} */ v) => v === 1)).toBe(true);
    });
});
