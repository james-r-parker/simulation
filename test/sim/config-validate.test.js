import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { DEFAULTS } from '../../js/sim/config-defaults.js';
import { validateConfig } from '../../js/sim/config-validate.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

describe('validateConfig unknown and missing keys', () => {
    it('rejects an unknown top-level key', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, bogus: 1 })).toThrow(/config\.bogus.*no such key/);
    });

    it('rejects childEnergy, which the share and minimum replaced', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, childEnergy: 600 })).toThrow(/config\.childEnergy.*no such key/);
    });

    it('rejects an unknown key inside a season', () => {
        const seasons = structuredClone(DEFAULTS.seasons);
        seasons[1].extra = 1;
        expect(() => createConfig({ ...SIMPLE_WORLD, seasons })).toThrow(/seasons\[1\]\.extra/);
    });

    it('rejects an unknown key inside a specialisation', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, specialisations: { scout: { speed: 1 } } })).toThrow(
            /specialisations\.scout\.speed/,
        );
    });

    it('rejects an unknown specialisation', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, specialisations: { medic: {} } })).toThrow(
            /specialisations\.medic/,
        );
    });

    it('rejects a missing key', () => {
        const config = /** @type {Record<string, any>} */ (structuredClone(DEFAULTS));
        delete config.seed;
        expect(() => validateConfig(config)).toThrow(/config\.seed.*missing/);
    });

    it('rejects a config that is not an object', () => {
        expect(() => validateConfig(/** @type {any} */ (null))).toThrow(/an object/);
    });
});

describe('validateConfig types and ranges', () => {
    it('rejects a string where a number is expected', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, worldWidth: '14400' })).toThrow(
            /worldWidth.*"14400".*finite number/,
        );
    });

    it('rejects NaN', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, foodSpawnRate: NaN })).toThrow(/foodSpawnRate/);
    });

    it('rejects a non-integer where an integer is expected', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, maxAgents: 10.5 })).toThrow(/maxAgents.*integer/);
    });

    it('rejects a non-boolean checkInvariants', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, checkInvariants: 1 })).toThrow(/checkInvariants.*boolean/);
    });

    it('rejects a seed above 2^32 - 1', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, seed: 2 ** 32 })).toThrow(/seed/);
    });

    it('rejects a world size below 1000', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, worldHeight: 999 })).toThrow(/worldHeight/);
    });

    it('rejects a probability above 1', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, damping: 1.5 })).toThrow(/damping.*<= 1/);
    });

    it('rejects a negative cost', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, passiveLoss: -0.1 })).toThrow(/passiveLoss/);
    });

    it('rejects a zero divisor', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, energyToSize: 0 })).toThrow(/energyToSize.*> 0/);
    });

    it.each([0.5, 0.8, 0.9])('accepts a huntSizeRatio of %s', (value) => {
        expect(() => createConfig({ ...SIMPLE_WORLD, huntSizeRatio: value })).not.toThrow();
    });

    it('rejects a huntSizeRatio below 0.5', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, huntSizeRatio: 0.49 })).toThrow(/huntSizeRatio/);
    });

    it.each([1, 0.9, Infinity])('rejects a mateSizeRatio of %s', (value) => {
        expect(() => createConfig({ ...SIMPLE_WORLD, mateSizeRatio: value })).toThrow(/mateSizeRatio/);
    });

    it('accepts a mateSizeRatio just above 1', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, mateSizeRatio: 1.001 })).not.toThrow();
    });

    it('rejects a negative mateRange and accepts 0', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, mateRange: -1 })).toThrow(/mateRange/);
        expect(() => createConfig({ ...SIMPLE_WORLD, mateRange: 0 })).not.toThrow();
    });

    it.each([0, 1, -0.1, 1.5])('rejects childEnergyShare %s', (value) => {
        expect(() => createConfig({ ...SIMPLE_WORLD, childEnergyShare: value })).toThrow(
            /childEnergyShare.*> 0 and < 1/,
        );
    });

    it('rejects a childEnergyMin of 0', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, childEnergyMin: 0 })).toThrow(/childEnergyMin.*> 0/);
    });

    it('rejects a seasons array of the wrong length', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, seasons: [] })).toThrow(/seasons.*exactly 4/);
    });

    it('names the key path of a bad season value', () => {
        const seasons = structuredClone(DEFAULTS.seasons);
        seasons[2].energyDrain = -1;
        expect(() => createConfig({ ...SIMPLE_WORLD, seasons })).toThrow(/seasons\[2\]\.energyDrain.*-1/);
    });

    it('rejects a specialisation that is not an object', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, specialisations: { scout: 3 } })).toThrow(
            /specialisations\.scout.*an object/,
        );
    });

    it('rejects a changed specialisation index', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, specialisations: { scout: { index: 0 } } })).toThrow(
            /scout\.index.*3/,
        );
    });

    it('rejects a non-boolean canHunt', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, specialisations: { scout: { canHunt: 'no' } } })).toThrow(
            /scout\.canHunt/,
        );
    });

    it('rejects a zero specialisation multiplier', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, specialisations: { scout: { moveCostMultiplier: 0 } } })).toThrow(
            /moveCostMultiplier/,
        );
    });
});

describe('validateConfig predator-prey keys', () => {
    it.each([
        ['antennaAngle', -0.1],
        ['antennaAngle', 3.2],
        ['biteArc', 0],
        ['biteArc', 3.2],
        ['antennaReach', 0],
        ['callRadius', 0],
        ['callTicks', 0],
        ['callTicks', 65536],
        ['callTicks', 1.5],
        ['alarmCost', -1],
        ['huntCallCost', -1],
        ['smokeCost', -1],
        ['smokeRadius', 0],
        ['smokeTicks', 0],
        ['smokeTicks', 65536],
        ['smokeCooldown', -1],
        ['smokeCooldown', 65536],
        ['smokeThreshold', 1.1],
        ['alarmThreshold', -0.1],
        ['alarmThreshold', 0.96],
        ['huntCallThreshold', -0.1],
        ['huntCallThreshold', 0.96],
        ['packWindow', 0],
        ['maxClouds', -1],
        ['maxClouds', 257],
    ])('rejects %s = %s', (key, value) => {
        expect(() => createConfig({ ...SIMPLE_WORLD, [key]: value })).toThrow(new RegExp(key));
    });

    it('accepts each key at its bounds', () => {
        expect(() =>
            createConfig({ ...SIMPLE_WORLD, antennaAngle: 0, alarmCost: 0, smokeCooldown: 0, maxClouds: 0 }),
        ).not.toThrow();
        expect(() =>
            createConfig({
                ...SIMPLE_WORLD,
                antennaAngle: Math.PI,
                biteArc: Math.PI,
                callTicks: 65535,
                maxClouds: 256,
            }),
        ).not.toThrow();
    });

    it.each(['biteMultiplier', 'turnMultiplier', 'sprintBoost'])('rejects a zero %s', (field) => {
        expect(() => createConfig({ ...SIMPLE_WORLD, specialisations: { predator: { [field]: 0 } } })).toThrow(
            new RegExp(field),
        );
    });

    it('defaults every specialisation multiplier to 1 except the predator', () => {
        const config = createConfig({ ...SIMPLE_WORLD });
        for (const [name, spec] of Object.entries(config.specialisations)) {
            const expected = name === 'predator' ? [8, 0.7, 1.6] : [1, 1, 1];
            expect([spec.biteMultiplier, spec.turnMultiplier, spec.sprintBoost]).toEqual(expected);
        }
    });
});

describe('validateConfig cross-key rules', () => {
    it('rejects initialAgents above maxAgents', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, maxAgents: 50, initialAgents: 60, minAgents: 1 })).toThrow(
            /initialAgents.*maxAgents/,
        );
    });

    it('rejects minAgents above maxAgents', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, maxAgents: 10, initialAgents: 5, minAgents: 11 })).toThrow(
            /minAgents/,
        );
    });

    it('rejects initialFood above maxFood', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, maxFood: 800, initialFood: 900 })).toThrow(/initialFood.*maxFood/);
    });

    it('rejects initialEnergy above maxEnergy', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, initialEnergy: 30000 })).toThrow(/initialEnergy.*maxEnergy/);
    });

    it('rejects minSize above baseSize', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, minSize: 30 })).toThrow(/minSize.*baseSize/);
    });

    it('rejects weight storage above 2^24 floats', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, maxAgents: 4096, rayCount: 64, brainHidden: 128 })).toThrow(
            /maxAgents.*weightCount/,
        );
    });

    it('rejects a hashCellSize not above the largest radius', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, maxEnergy: 25000, hashCellSize: 132 })).toThrow(/hashCellSize/);
    });

    it('accepts a hashCellSize just above the largest radius', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, maxEnergy: 25000, hashCellSize: 132.6 })).not.toThrow();
    });

    it('counts the food radius in the largest radius', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, flora: { grass: { radius: 10 } } })).toThrow(/hashCellSize/);
    });
});

describe('validateConfig temperature keys', () => {
    it.each([
        ['temperatureMax', 0],
        ['temperatureStart', -1],
        ['temperatureStart', 101],
        ['temperatureGainMove', -0.1],
        ['temperatureGainEat', -1],
        ['temperatureLossPassive', -0.1],
        ['temperatureSeasonSlope', -0.1],
        ['temperaturePassiveLossFactor', 0.9],
        ['temperatureColdStress', 0],
        ['temperatureEfficiencyColdSevere', 0],
        ['temperatureEfficiencyColdModerate', 1.1],
        ['temperatureEfficiencyHeatModerate', -0.1],
        ['temperatureEfficiencyHeatSevere', NaN],
    ])('rejects %s = %s', (key, value) => {
        expect(() => createConfig({ ...SIMPLE_WORLD, [key]: value })).toThrow(new RegExp(key));
    });

    it('accepts a start at either end and an efficiency of exactly 1', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, temperatureStart: 0 })).not.toThrow();
        expect(() => createConfig({ ...SIMPLE_WORLD, temperatureStart: 100 })).not.toThrow();
        expect(() => createConfig({ ...SIMPLE_WORLD, temperatureEfficiencyHeatSevere: 1 })).not.toThrow();
        expect(() => createConfig({ ...SIMPLE_WORLD, temperaturePassiveLossFactor: 1 })).not.toThrow();
    });

    it.each([
        ['temperatureColdStress', 40, /temperatureColdStress.*< temperatureColdModerate/],
        ['temperatureColdModerate', 66, /temperatureColdModerate.*<= temperatureOptimalMax/],
        ['temperatureOptimalMin', 30, /temperatureColdStress.*< temperatureOptimalMin/],
        ['temperatureOptimalMax', 70, /temperatureOptimalMax.*< temperatureHeatModerate/],
        ['temperatureHeatModerate', 86, /temperatureHeatModerate.*<= temperatureHeatStress/],
        ['temperatureHeatStress', 100, /temperatureHeatStress.*< temperatureMax/],
    ])('refuses %s = %s, which breaks the ordering', (key, value, pattern) => {
        expect(() => createConfig({ ...SIMPLE_WORLD, [key]: value })).toThrow(pattern);
    });

    it('accepts the equalities the ordering allows', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, temperatureColdModerate: 65 })).not.toThrow();
        expect(() => createConfig({ ...SIMPLE_WORLD, temperatureHeatModerate: 85 })).not.toThrow();
        expect(() => createConfig({ ...SIMPLE_WORLD, temperatureOptimalMin: 65 })).not.toThrow();
    });

    it('accepts a negative season temperatureModifier and refuses a non-finite or missing one', () => {
        const seasons = structuredClone(DEFAULTS.seasons);
        seasons[3].temperatureModifier = -40;
        expect(() => createConfig({ ...SIMPLE_WORLD, seasons })).not.toThrow();
        seasons[3].temperatureModifier = NaN;
        expect(() => createConfig({ ...SIMPLE_WORLD, seasons })).toThrow(/seasons\[3\]\.temperatureModifier/);
        seasons[3].temperatureModifier = Infinity;
        expect(() => createConfig({ ...SIMPLE_WORLD, seasons })).toThrow(/seasons\[3\]\.temperatureModifier/);
        delete seasons[3].temperatureModifier;
        expect(() => createConfig({ ...SIMPLE_WORLD, seasons })).toThrow(/seasons\[3\]\.temperatureModifier.*missing/);
    });
});

describe('validateConfig food patches and the floor', () => {
    it.each([
        ['foodPatchCount', -1],
        ['foodPatchCount', 1.5],
        ['foodPatchRadius', 0],
        ['foodPatchCapacity', 0],
        ['foodPatchDepletion', -0.1],
        ['foodPatchRegrow', 1.1],
        ['foodBackgroundShare', -0.1],
        ['floorTrigger', 1.5],
        ['foodRegrowPerArea', -1],
    ])('rejects %s of %s', (key, value) => {
        expect(() => createConfig({ ...SIMPLE_WORLD, [key]: value })).toThrow(new RegExp(`config\\.${key}`));
    });

    it('has patches off in the simple world, the floor at 40 and the guard at 8 by default', () => {
        const c = createConfig({ ...SIMPLE_WORLD });
        expect([c.foodPatchCount, c.minAgents, c.floorTrigger]).toEqual([0, 40, 8]);
    });

    it('rejects patches wider than the world', () => {
        expect(() =>
            createConfig({ ...SIMPLE_WORLD, foodPatchCount: 2, foodPatchRadius: 600, worldWidth: 1000 }),
        ).toThrow(/foodPatchRadius/);
        expect(() =>
            createConfig({ ...SIMPLE_WORLD, foodPatchCount: 0, foodPatchRadius: 600, worldWidth: 1000 }),
        ).not.toThrow();
    });
});
