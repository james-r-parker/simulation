import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { DEFAULTS } from '../../js/sim/config-defaults.js';
import { validateConfig } from '../../js/sim/config-validate.js';

describe('validateConfig unknown and missing keys', () => {
    it('rejects an unknown top-level key', () => {
        expect(() => createConfig({ bogus: 1 })).toThrow(/config\.bogus.*no such key/);
    });

    it('rejects childEnergy, which the share and minimum replaced', () => {
        expect(() => createConfig({ childEnergy: 600 })).toThrow(/config\.childEnergy.*no such key/);
    });

    it('rejects an unknown key inside a season', () => {
        const seasons = structuredClone(DEFAULTS.seasons);
        seasons[1].extra = 1;
        expect(() => createConfig({ seasons })).toThrow(/seasons\[1\]\.extra/);
    });

    it('rejects an unknown key inside a specialisation', () => {
        expect(() => createConfig({ specialisations: { scout: { speed: 1 } } })).toThrow(
            /specialisations\.scout\.speed/,
        );
    });

    it('rejects an unknown specialisation', () => {
        expect(() => createConfig({ specialisations: { medic: {} } })).toThrow(/specialisations\.medic/);
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
        expect(() => createConfig({ worldWidth: '14400' })).toThrow(/worldWidth.*"14400".*finite number/);
    });

    it('rejects NaN', () => {
        expect(() => createConfig({ foodSpawnRate: NaN })).toThrow(/foodSpawnRate/);
    });

    it('rejects a non-integer where an integer is expected', () => {
        expect(() => createConfig({ maxAgents: 10.5 })).toThrow(/maxAgents.*integer/);
    });

    it('rejects a non-boolean checkInvariants', () => {
        expect(() => createConfig({ checkInvariants: 1 })).toThrow(/checkInvariants.*boolean/);
    });

    it('rejects a seed above 2^32 - 1', () => {
        expect(() => createConfig({ seed: 2 ** 32 })).toThrow(/seed/);
    });

    it('rejects a world size below 1000', () => {
        expect(() => createConfig({ worldHeight: 999 })).toThrow(/worldHeight/);
    });

    it('rejects a probability above 1', () => {
        expect(() => createConfig({ damping: 1.5 })).toThrow(/damping.*<= 1/);
    });

    it('rejects a negative cost', () => {
        expect(() => createConfig({ passiveLoss: -0.1 })).toThrow(/passiveLoss/);
    });

    it('rejects a zero divisor', () => {
        expect(() => createConfig({ energyToSize: 0 })).toThrow(/energyToSize.*> 0/);
    });

    it('rejects a huntSizeRatio below 1', () => {
        expect(() => createConfig({ huntSizeRatio: 0.9 })).toThrow(/huntSizeRatio/);
    });

    it('rejects a negative mateRange and accepts 0', () => {
        expect(() => createConfig({ mateRange: -1 })).toThrow(/mateRange/);
        expect(() => createConfig({ mateRange: 0 })).not.toThrow();
    });

    it.each([0, 1, -0.1, 1.5])('rejects childEnergyShare %s', (value) => {
        expect(() => createConfig({ childEnergyShare: value })).toThrow(/childEnergyShare.*> 0 and < 1/);
    });

    it('rejects a childEnergyMin of 0', () => {
        expect(() => createConfig({ childEnergyMin: 0 })).toThrow(/childEnergyMin.*> 0/);
    });

    it('rejects a seasonLength below 4', () => {
        expect(() => createConfig({ seasonLength: 3 })).toThrow(/seasonLength/);
    });

    it('rejects a seasons array of the wrong length', () => {
        expect(() => createConfig({ seasons: [] })).toThrow(/seasons.*exactly 4/);
    });

    it('names the key path of a bad season value', () => {
        const seasons = structuredClone(DEFAULTS.seasons);
        seasons[2].energyDrain = -1;
        expect(() => createConfig({ seasons })).toThrow(/seasons\[2\]\.energyDrain.*-1/);
    });

    it('rejects a specialisation that is not an object', () => {
        expect(() => createConfig({ specialisations: { scout: 3 } })).toThrow(/specialisations\.scout.*an object/);
    });

    it('rejects a changed specialisation index', () => {
        expect(() => createConfig({ specialisations: { scout: { index: 0 } } })).toThrow(/scout\.index.*3/);
    });

    it('rejects a non-boolean canHunt', () => {
        expect(() => createConfig({ specialisations: { scout: { canHunt: 'no' } } })).toThrow(/scout\.canHunt/);
    });

    it('rejects a zero specialisation multiplier', () => {
        expect(() => createConfig({ specialisations: { scout: { moveCostMultiplier: 0 } } })).toThrow(
            /moveCostMultiplier/,
        );
    });
});

describe('validateConfig cross-key rules', () => {
    it('rejects initialAgents above maxAgents', () => {
        expect(() => createConfig({ maxAgents: 50, initialAgents: 60, minAgents: 1 })).toThrow(
            /initialAgents.*maxAgents/,
        );
    });

    it('rejects minAgents above maxAgents', () => {
        expect(() => createConfig({ maxAgents: 10, initialAgents: 5, minAgents: 11 })).toThrow(/minAgents/);
    });

    it('rejects initialFood above maxFood', () => {
        expect(() => createConfig({ initialFood: 900 })).toThrow(/initialFood.*maxFood/);
    });

    it('rejects obstacleMinRadius above obstacleMaxRadius', () => {
        expect(() => createConfig({ obstacleMinRadius: 130 })).toThrow(/obstacleMinRadius/);
    });

    it('rejects initialEnergy above maxEnergy', () => {
        expect(() => createConfig({ initialEnergy: 30000 })).toThrow(/initialEnergy.*maxEnergy/);
    });

    it('rejects minSize above baseSize', () => {
        expect(() => createConfig({ minSize: 30 })).toThrow(/minSize.*baseSize/);
    });

    it('rejects weight storage above 2^24 floats', () => {
        expect(() => createConfig({ maxAgents: 4096, rayCount: 64, brainHidden: 128 })).toThrow(
            /maxAgents.*weightCount/,
        );
    });

    it('rejects a hashCellSize not above the largest radius', () => {
        expect(() => createConfig({ hashCellSize: 125 })).toThrow(/hashCellSize/);
    });

    it('accepts a hashCellSize just above the largest radius', () => {
        expect(() => createConfig({ hashCellSize: 125.5 })).not.toThrow();
    });

    it('counts the food radius in the largest radius', () => {
        expect(() => createConfig({ highFoodRadius: 200 })).toThrow(/hashCellSize/);
    });
});
