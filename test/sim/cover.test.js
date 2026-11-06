import { describe, expect, it } from 'vitest';
import { cloneWithNoisePolicy } from '../../js/sim/birth-policy.js';
import { createConfig } from '../../js/sim/config.js';
import { COVER_LOG_TICKS, COVER_TOTALS, assertCover, ringIndexAt, stepCover } from '../../js/sim/cover.js';
import { EVENT_TYPE, EVENT_STRIDE, clearEvents } from '../../js/sim/events.js';
import { assertInvariants } from '../../js/sim/invariants.js';
import { createSimLog, drainEvents } from '../../js/sim/log.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { refugeCentresOf, ringRadius } from '../../js/sim/terrain.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { addBlob, lifeWorld } from './helpers/life-world.js';

const BASINS = { worldWidth: 4000, worldHeight: 2000, refugeCount: 2, refugeCluster: 1, wallGaps: 1 };
const ON = { coverConceals: true, coverFoodFree: true };

/**
 * @param {Record<string, any>} over config overrides
 * @returns {any} a world with two rings and no agents
 */
function ringWorld(over = {}) {
    return lifeWorld({ ...BASINS, ...over });
}

/**
 * @param {any} world the world
 * @param {number} ring the ring index
 * @param {number} offset px from the ring centre along x
 * @returns {number} a new agent standing there
 */
function blobAt(world, ring, offset = 0) {
    const centres = refugeCentresOf(world);
    return addBlob(world, { x: centres[2 * ring] + offset, y: centres[2 * ring + 1] });
}

describe('stepCover', () => {
    it('writes the ring index plus one for an agent inside, 0 outside and for a dead slot', () => {
        const world = ringWorld(ON);
        const first = blobAt(world, 0);
        const second = blobAt(world, 1, 10);
        const outside = addBlob(world, { x: 5, y: 5 });
        const dead = blobAt(world, 0);
        world.alive[dead] = 0;
        stepCover(world);
        expect([...world.coverRing.subarray(0, 4)]).toEqual([1, 2, 0, 0]);
        expect([first, second, outside, dead]).toEqual([0, 1, 2, 3]);
    });

    it('treats the ring radius as inside and just past it as outside', () => {
        const world = ringWorld({ coverConceals: true });
        const edge = ringRadius(world.config);
        const inside = blobAt(world, 0, edge - 1);
        const past = blobAt(world, 0, edge + 1);
        stepCover(world);
        expect([world.coverRing[inside], world.coverRing[past]]).toEqual([1, 0]);
    });

    it('does nothing with both switches off', () => {
        const world = ringWorld();
        blobAt(world, 0);
        stepCover(world);
        expect(world.coverRing.every((b) => b === 0)).toBe(true);
        expect(world.coverCentres).toBeNull();
        expect(world.events.count).toBe(0);
    });

    it('counts the agents in rings now and in total', () => {
        const world = ringWorld({ coverFoodFree: true });
        blobAt(world, 0);
        blobAt(world, 1);
        addBlob(world, { x: 5, y: 5 });
        stepCover(world);
        stepCover(world);
        expect(world.coverTotals[COVER_TOTALS.IN_RINGS]).toBe(2);
        expect(world.coverTotals[COVER_TOTALS.AGENT_TICKS]).toBe(4);
    });

    it('answers ringIndexAt from the cached centres and keeps them between calls', () => {
        const world = ringWorld(ON);
        const centres = refugeCentresOf(world);
        expect(ringIndexAt(world, centres[2], centres[3])).toBe(1);
        const cached = world.coverCentres;
        expect(ringIndexAt(world, 5, 5)).toBe(-1);
        expect(world.coverCentres).toBe(cached);
    });

    it('finds no ring in a world without refuges', () => {
        const world = ringWorld({ ...ON, refugeCount: 0 });
        addBlob(world, { x: 500, y: 500 });
        stepCover(world);
        expect(world.coverRing[0]).toBe(0);
    });
});

describe('cover events', () => {
    /**
     * @param {any} world the world
     * @returns {Record<string, any>[]} the records the log makes of the world's events
     */
    function drain(world) {
        const records = [];
        drainEvents(
            world,
            createSimLog((r) => records.push(r), { level: 'debug' }),
        );
        return records;
    }

    it('logs CoverConfig once, at tick 0, with the switches and the geometry', () => {
        const world = ringWorld(ON);
        clearEvents(world.events);
        stepCover(world);
        const [record] = drain(world);
        expect(record).toMatchObject({
            level: 'info',
            event: 'CoverConfig',
            tick: 0,
            coverConceals: true,
            coverFoodFree: true,
            refugeCount: 2,
            aperturePx: 2 * world.config.refugeSizeMax,
            interiorRadius: ringRadius(world.config),
        });
        clearEvents(world.events);
        world.tick = 1;
        stepCover(world);
        expect(world.events.count).toBe(0);
    });

    it('logs CoverTotals every COVER_LOG_TICKS at debug', () => {
        const world = ringWorld(ON);
        blobAt(world, 0);
        world.coverTotals[COVER_TOTALS.CONCEALED_HITS] = 7;
        world.coverTotals[COVER_TOTALS.FOOD_REJECTED] = 3;
        clearEvents(world.events);
        world.tick = COVER_LOG_TICKS;
        stepCover(world);
        expect(world.events.data[0]).toBe(EVENT_TYPE.COVER_TOTALS);
        expect(world.events.count * EVENT_STRIDE).toBe(EVENT_STRIDE);
        expect(drain(world)).toEqual([
            {
                level: 'debug',
                event: 'CoverTotals',
                tick: COVER_LOG_TICKS,
                agentsInRings: 1,
                agentTicksInRings: 1,
                concealedHits: 7,
                foodRejected: 3,
            },
        ]);
    });
});

describe('assertCover', () => {
    it('accepts bytes up to refugeCount and rejects a higher one', () => {
        const world = ringWorld(ON);
        world.coverRing[0] = 2;
        expect(() => assertCover(world)).not.toThrow();
        world.coverRing[0] = 3;
        expect(() => assertCover(world)).toThrow(/cover.*slot 0.*refugeCount 2/);
        expect(() => assertInvariants(world)).toThrow(/cover/);
    });
});

describe('the sense phase', () => {
    it('fills the ring bytes before the rays read them and survives a wiped cover state', () => {
        const overrides = {
            ...BASINS,
            ...ON,
            worldHeight: 2400,
            maxAgents: 40,
            initialAgents: 30,
            minAgents: 10,
            maturityTicks: 20,
            checkInvariants: true,
        };
        const policy = cloneWithNoisePolicy();
        const whole = createWorld(createConfig({ ...overrides }), policy);
        const split = createWorld(createConfig({ ...overrides }), policy);
        for (let t = 0; t < 200; t++) {
            step(whole, policy);
        }
        for (let t = 0; t < 100; t++) {
            step(split, policy);
        }
        // A world restored from a snapshot has no cover state: the derived rows start empty and the centres unread.
        split.coverRing.fill(0);
        split.coverCentres = null;
        for (let t = 0; t < 100; t++) {
            step(split, policy);
        }
        expect(hashWorld(split)).toBe(hashWorld(whole));
    });
});
