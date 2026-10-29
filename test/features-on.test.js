import { describe, expect, it } from 'vitest';
import { BENCH_CONFIG, TRACKED_VARIANTS } from '../scripts/bench.mjs';
import { FEATURES_OFF, FEATURES_ON, unpinnedFeatureKeys } from '../scripts/lib/features-on.mjs';
import { cloneWithNoisePolicy } from '../js/sim/birth-policy.js';
import { createConfig } from '../js/sim/config.js';
import { createWorld } from '../js/sim/spawn.js';
import { step } from '../js/sim/step.js';
import { hashWorld } from '../js/sim/world-hash.js';

const SWITCHED_ON = [
    'satiationShare',
    'digestTicks',
    'handlingTicks',
    'terrainLayout',
    'obstacleCount',
    'specMutationRate',
    'specialisations',
    'foodPatchCount',
    'hebbianRate',
    'maxBirthsPerWindow',
    'capBirthsEnabled',
    'mateDistanceMax',
    'hashCellSize',
    // the T78 tunings (the E34 winner): FEATURES_OFF pins their old values, so FEATURES_ON restates them
    'mateRange',
    'reproductionCooldown',
    'childEnergyMin',
    // the predator package (fitness-and-selection T15d): FEATURES_OFF pins the old or neutral values, FEATURES_ON the tuned ones
    'predatorRescueMin',
    'predatorRescueInterval',
    'predatorKillEnergy',
    'huntSizeRatio',
    'biteArc',
    'huntCallCost',
    'alarmThreshold',
    'huntCallThreshold',
    // the E41 finalist split-300 (fitness-and-selection T48b)
    'splitDeliberateMin',
    // the E63 winner (fitness-and-selection T48g)
    'splitDeliberateShareMin',
    'temperatureGainEat',
];

describe('feature switch lists', () => {
    it('pin every FEATURE_RULES key, so a new feature key cannot slip into the frozen bench world', () => {
        expect(unpinnedFeatureKeys()).toEqual([]);
    });

    it('freeze the bench world with every feature key off', () => {
        for (const [key, value] of Object.entries(FEATURES_OFF)) {
            if (key === 'specialisations') {
                // the bench restates the predator's pre-T15d biteMultiplier as well, so it is a superset
                expect(BENCH_CONFIG.specialisations).toMatchObject(value);
            } else {
                expect(Object.entries(BENCH_CONFIG).find(([k]) => k === key)?.[1]).toEqual(value);
            }
        }
    });

    it('change only the switched-on keys, and the tracked defaults row uses them', () => {
        const changed = Object.keys(FEATURES_ON).filter((key) => FEATURES_ON[key] !== FEATURES_OFF[key]);
        expect(changed.sort()).toEqual([...SWITCHED_ON].sort());
        expect(TRACKED_VARIANTS.find((v) => v.suffix === 'defaults')?.overrides).toBe(FEATURES_ON);
    });

    it('read back FEATURES_OFF from createConfig, and make the code defaults the switch-on values', () => {
        const off = createConfig({ ...FEATURES_OFF });
        for (const [key, value] of Object.entries(FEATURES_OFF)) {
            if (key !== 'specialisations') {
                expect(off[key]).toEqual(value);
            }
        }
        expect(off.specialisations.predator.plantFoodValue).toBe(1);
        const defaults = createConfig({});
        for (const [key, value] of Object.entries(FEATURES_ON)) {
            if (key !== 'specialisations') {
                expect(defaults[key]).toEqual(value);
            }
        }
        expect(defaults.specialisations.predator.plantFoodValue).toBe(0);
        expect(defaults.minAgents).toBe(40);
    });

    it('switch the predator rescue on', () => {
        expect(FEATURES_ON.predatorRescueMin).toBe(3);
        expect(FEATURES_ON.predatorRescueInterval).toBe(450);
        const config = createConfig({ ...FEATURES_ON });
        expect(config.predatorRescueMin).toBe(3);
        expect(config.predatorRescueInterval).toBe(450);
    });

    it('set the tuned predator economy keys (T15d)', () => {
        expect(FEATURES_ON.predatorKillEnergy).toBe(150);
        const predator = createConfig({}).specialisations.predator;
        expect([predator.passiveLossMultiplier, predator.splitMinEnergyMultiplier, predator.biteMultiplier]).toEqual([
            0.6, 0.6, 8,
        ]);
    });

    it('keeps the bench world at the pre-T15d values of the keys the defaults change (T15d)', () => {
        const bench = createConfig({ ...BENCH_CONFIG });
        expect([bench.biteArc, bench.huntSizeRatio, bench.huntCallCost, bench.alarmCost]).toEqual([
            Math.PI / 4,
            1.05,
            4,
            4,
        ]);
        expect(bench.specialisations.predator.biteMultiplier).toBe(4);
        for (const key of ['predatorKillEnergy', 'predatorRescueMin', 'alarmThreshold', 'huntCallThreshold']) {
            expect(bench[key]).toBe(FEATURES_OFF[key]);
        }
    });

    it('set the tuned hunt, bite and call values (T15d), and keep FEATURES_OFF pinned at the old ones', () => {
        expect([FEATURES_ON.huntSizeRatio, FEATURES_ON.biteArc, FEATURES_ON.huntCallCost]).toEqual([0.8, 1.571, 10]);
        expect([FEATURES_OFF.alarmThreshold, FEATURES_OFF.huntCallThreshold]).toEqual([0, 0]);
        expect(BENCH_CONFIG.huntSizeRatio).toBe(1.05);
        expect(BENCH_CONFIG.huntCallCost).toBe(4);
    });

    it('set the call thresholds to 0.65 (T15d) and read them back from createConfig', () => {
        expect([FEATURES_ON.alarmThreshold, FEATURES_ON.huntCallThreshold]).toEqual([0.65, 0.65]);
        const config = createConfig({});
        expect([config.alarmThreshold, config.huntCallThreshold]).toEqual([0.65, 0.65]);
    });

    it('build a world that steps when on', () => {
        const config = createConfig({ ...FEATURES_ON, initialAgents: 40, minAgents: 40, maxAgents: 60 });
        const brain = cloneWithNoisePolicy();
        const world = createWorld(config, brain);
        for (let i = 0; i < 20; i++) {
            step(world, brain);
        }
        expect(hashWorld(world)).toMatch(/^[0-9a-f]{16}$/);
    });
});
