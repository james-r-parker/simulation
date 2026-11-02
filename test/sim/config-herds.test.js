import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { DEFAULTS } from '../../js/sim/config-defaults.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

describe('herd config', () => {
    it('uses the plan defaults and raises event storage for herd events', () => {
        expect(DEFAULTS).toMatchObject({
            eventCapacity: 8192,
            herdCount: 6,
            herdSize: 8,
            herdRadius: 80,
            herdWalkSpeed: 1.5,
            herdRunSpeed: 6.5,
            herdStartleRadius: 200,
            herdStampedeTicks: 360,
            herdLifeTicks: 144000,
            herdBirthTicks: 12000,
            herdStoreMax: 3000,
            herdCalfEnergy: 500,
            herdBirthEnergy: 1500,
            herdGrazeTicks: 30,
            herdAssimilation: 0.3,
            herdLeaveShare: 0.4,
            herdCarcassTicks: 12000,
            herdStayTicks: 6000,
            herdWary: 1,
            herdDungTicks: 900,
            herdDungSize: 60,
            herdDungZoneMax: 30,
            herdSeedChance: 0.5,
            herdSeedTicks: 24000,
            herdSeedMinDistance: 800,
            trampleDamage: 400,
        });
        expect(() => createConfig()).not.toThrow();
    });

    it('bounds event capacity by agents, patches, animals and groups', () => {
        const config = {
            ...SIMPLE_WORLD,
            herdCount: 8,
            herdSize: 32,
            maxAgents: 500,
            floraPatchMax: 256,
        };
        expect(() => createConfig({ ...config, eventCapacity: 5807 })).toThrow(/eventCapacity.*5808/);
        expect(() => createConfig({ ...config, eventCapacity: 5808 })).not.toThrow();
    });

    it('requires active herds to fit the wall, refuge, speed and hash limits', () => {
        expect(() => createConfig({ herdRadius: 91 })).toThrow(/wallGapWidth/);
        expect(() => createConfig({ refugeSizeMax: 80, herdRadius: 80 })).toThrow(/refugeSizeMax/);
        expect(() => createConfig({ herdRunSpeed: 8.1 })).toThrow(/herd speeds/);
        expect(() => createConfig({ herdWalkSpeed: 7, herdRunSpeed: 6.5 })).toThrow(/herd speeds/);
        expect(() => createConfig({ herdRadius: 140, wallGapWidth: 400 })).toThrow(/hashCellSize.*herdRadius/);
    });

    it('keeps calf and birth stores within the herd energy budget', () => {
        expect(() => createConfig({ herdCalfEnergy: 1600 })).toThrow(/herdBirthEnergy/);
        expect(() => createConfig({ herdBirthEnergy: 3001 })).toThrow(/herdBirthEnergy/);
    });

    it('bounds the wary instinct weight', () => {
        expect(createConfig({ herdWary: 0 }).herdWary).toBe(0);
        expect(createConfig({ herdWary: 4 }).herdWary).toBe(4);
        expect(() => createConfig({ herdWary: -0.1 })).toThrow(/herdWary/);
        expect(() => createConfig({ herdWary: 4.1 })).toThrow(/herdWary/);
    });

    it('bounds dung zones by the fertile-zone pool for active herds', () => {
        expect(() => createConfig({ herdDungZoneMax: 101 })).toThrow(/herdDungZoneMax.*fertileZoneMax/);
        expect(() => createConfig({ herdCount: 0, fertileZoneMax: 0 })).not.toThrow();
        expect(() => createConfig({ herdCount: 0, herdDungZoneMax: 101 })).not.toThrow();
        expect(() => createConfig({ herdDungZoneMax: 0 })).not.toThrow();
    });
});
