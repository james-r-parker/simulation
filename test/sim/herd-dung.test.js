import { describe, expect, it } from 'vitest';
import { FOOD_ORIGIN } from '../../js/sim/carcass.js';
import { addFertileZone, ZONE_ORIGIN } from '../../js/sim/environment.js';
import { addDungZone, ageHerdSeeds, dropHerdDung, loadHerdSeed } from '../../js/sim/herd-dung.js';
import { createConfig } from '../../js/sim/config.js';
import { EVENT_STRIDE, EVENT_TYPE, clearEvents } from '../../js/sim/events.js';
import { createWorld, spawnFoodItem } from '../../js/sim/spawn.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';
import { testPolicy } from './helpers/test-policy.js';

/** @param {Record<string, unknown>} overrides @returns {ReturnType<typeof createWorld>} */
function build(overrides = {}) {
    return createWorld(
        createConfig({
            ...SIMPLE_WORLD,
            worldWidth: 2000,
            worldHeight: 1200,
            maxAgents: 2,
            initialAgents: 0,
            minAgents: 0,
            maxFood: 4,
            initialFood: 0,
            foodPatchCount: 0,
            floraPatchMax: 2,
            fertileZoneMax: 3,
            herdCount: 1,
            herdSize: 2,
            herdDungZoneMax: 2,
            ...overrides,
        }),
        testPolicy,
    );
}

describe('herd dung zones', () => {
    it('replaces the oldest dung at its cap without crowding out a death zone', () => {
        const world = build({ herdDungZoneMax: 1 });
        addFertileZone(world, 100, 100, 25);
        const firstDung = addDungZone(world, 200, 200);
        world.zoneFertility[firstDung] = world.zoneInitial[firstDung] * 0.8;
        const replacement = addDungZone(world, 300, 300);
        expect(replacement).toBe(firstDung);
        expect(world.zoneOrigin[0]).toBe(ZONE_ORIGIN.DEATH);
        expect(world.zoneOrigin[firstDung]).toBe(ZONE_ORIGIN.DUNG);
        expect([world.zoneX[firstDung], world.zoneY[firstDung]]).toEqual([300, 300]);
    });

    it('uses only the available zone slot and allows dung to be disabled', () => {
        const world = build({ herdDungZoneMax: 0 });
        expect(addDungZone(world, 10, 20)).toBe(-1);
        expect(Array.from(world.zoneAlive)).toEqual([0, 0, 0]);
    });

    it('drops on age intervals only while the herd store is above half', () => {
        const world = build({ herdDungTicks: 10, herdDungZoneMax: 2 });
        world.herdAge[0] = 9;
        world.herdStore[0] = world.config.herdStoreMax / 2 + 1;
        world.herdX[0] = 400;
        world.herdY[0] = 500;
        world.herdAge[1] = 9;
        world.herdStore[1] = world.config.herdStoreMax / 2;
        dropHerdDung(world);
        expect(world.zoneAlive[0]).toBe(1);
        expect(world.zoneOrigin[0]).toBe(ZONE_ORIGIN.DUNG);
        expect([world.zoneX[0], world.zoneY[0], world.zoneInitial[0]]).toEqual([400, 500, 3]);
        expect(world.zoneAlive[1]).toBe(0);
    });

    it('spawns grass within a dung zone and tags only that food origin', () => {
        const world = build({ fertileZoneSpawnChance: 1 });
        world.zoneAlive[0] = 1;
        world.zoneOrigin[0] = ZONE_ORIGIN.DUNG;
        world.zoneX[0] = 500;
        world.zoneY[0] = 400;
        world.zoneFertility[0] = 2;
        world.zoneInitial[0] = 3;
        const slot = spawnFoodItem(world);
        expect(world.foodOrigin[slot]).toBe(FOOD_ORIGIN.DUNG_ZONE);
        expect(world.foodSpecies[slot]).toBe(0);
        expect(world.foodPatch[slot]).toBe(-1);
        expect(Math.hypot(world.foodX[slot] - 500, world.foodY[slot] - 400)).toBeLessThanOrEqual(
            world.config.fertileZoneRadius,
        );
    });

    it('loads and ages a seed only from a live pollinated patch item', () => {
        const world = build({ herdSeedChance: 1, herdSeedTicks: 2 });
        world.patchAlive[0] = 1;
        world.patchSerial[0] = 1;
        world.patchSpecies[0] = 3;
        world.foodAlive[0] = 1;
        world.foodPatch[0] = 0;
        world.foodPatchSerial[0] = 1;
        world.foodSpecies[0] = 3;
        loadHerdSeed(world, 0, 0);
        expect([world.herdSeedPatch[0], world.herdSeedSerial[0], world.herdSeedTicks[0]]).toEqual([1, 1, 2]);
        ageHerdSeeds(world);
        expect(world.herdSeedTicks[0]).toBe(1);
        world.patchSerial[0]++;
        ageHerdSeeds(world);
        expect([world.herdSeedPatch[0], world.herdSeedSerial[0], world.herdSeedTicks[0]]).toEqual([0, 0, 0]);
    });

    it('plants a valid carried seed on a sufficiently distant dung drop', () => {
        const world = build({ herdSeedMinDistance: 600, herdDungTicks: 1 });
        world.patchAlive[0] = 1;
        world.patchSerial[0] = 1;
        world.patchSpecies[0] = 3;
        world.patchX[0] = 100;
        world.patchY[0] = 100;
        world.herdAge[0] = 0;
        world.herdStore[0] = world.config.herdStoreMax;
        world.herdX[0] = 800;
        world.herdY[0] = 100;
        world.herdSeedPatch[0] = 1;
        world.herdSeedSerial[0] = 1;
        world.herdSeedTicks[0] = 20;
        clearEvents(world.events);
        dropHerdDung(world);
        expect(world.patchAlive[1]).toBe(1);
        expect([world.patchX[1], world.patchY[1]]).toEqual([800, 100]);
        expect([world.herdSeedPatch[0], world.herdSeedSerial[0], world.herdSeedTicks[0]]).toEqual([0, 0, 0]);
        expect(world.events.data[0]).toBe(EVENT_TYPE.HERD_SEEDED);
        expect(Array.from(world.events.data.slice(0, EVENT_STRIDE)).slice(2, 9)).toEqual([0, 0, 0, 1, 3, 800, 100]);
    });

    it('retains a seed through the source cooldown and consumes a too-near attempt', () => {
        const world = build({ herdSeedMinDistance: 600, herdDungTicks: 1 });
        world.patchAlive[0] = 1;
        world.patchSerial[0] = 1;
        world.patchSpecies[0] = 3;
        world.patchX[0] = 100;
        world.patchY[0] = 100;
        world.patchSeedTick[0] = world.tick;
        world.herdAge[0] = 0;
        world.herdStore[0] = world.config.herdStoreMax;
        world.herdX[0] = 800;
        world.herdY[0] = 100;
        world.herdSeedPatch[0] = 1;
        world.herdSeedSerial[0] = 1;
        world.herdSeedTicks[0] = 20;
        clearEvents(world.events);
        dropHerdDung(world);
        expect(world.herdSeedPatch[0]).toBe(1);
        expect(world.events.data[2]).toBe(3);
        world.patchSeedTick[0] = -world.config.seedCooldownTicks;
        world.herdX[0] = 400;
        world.herdY[0] = 100;
        world.tick = 1;
        clearEvents(world.events);
        dropHerdDung(world);
        expect(world.patchAlive[1]).toBe(0);
        expect(world.herdSeedPatch[0]).toBe(0);
        expect(world.events.data[0]).toBe(EVENT_TYPE.SEEDING_REFUSED);
        expect(world.events.data[3]).toBe(2);
        expect(world.events.data[4]).toBe(1);
    });
});
