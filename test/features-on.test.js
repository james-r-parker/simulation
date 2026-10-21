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
    'carcassesEnabled',
    'terrainLayout',
    'obstacleCount',
    'specMutationRate',
    'foodPatchCount',
    'foodAreaCapacity',
    'erasEnabled',
    'leakEnabled',
    'hebbianRate',
    'traitsEnabled',
    'sexesEnabled',
    'maxBirthsPerWindow',
    'mateDistanceMax',
    'hashCellSize',
];

describe('feature switch lists', () => {
    it('pin every FEATURE_RULES key, so a new feature key cannot slip into the frozen bench world', () => {
        expect(unpinnedFeatureKeys()).toEqual([]);
    });

    it('freeze the bench world with every feature key off', () => {
        for (const [key, value] of Object.entries(FEATURES_OFF)) {
            expect(BENCH_CONFIG[key]).toEqual(value);
        }
    });

    it('change only the switched-on keys, and the tracked defaults row uses them', () => {
        const changed = Object.keys(FEATURES_ON).filter((key) => FEATURES_ON[key] !== FEATURES_OFF[key]);
        expect(changed.sort()).toEqual([...SWITCHED_ON].sort());
        expect(TRACKED_VARIANTS.find((v) => v.suffix === 'defaults')?.overrides).toBe(FEATURES_ON);
    });

    it('match the createConfig defaults when off, and build a world that steps when on', () => {
        const defaults = createConfig({});
        for (const [key, value] of Object.entries(FEATURES_OFF)) {
            expect(defaults[key]).toEqual(value);
        }
        const config = createConfig({ ...FEATURES_ON, initialAgents: 40, minAgents: 40, maxAgents: 60 });
        const brain = cloneWithNoisePolicy();
        const world = createWorld(config, brain);
        for (let i = 0; i < 20; i++) {
            step(world, brain);
        }
        expect(hashWorld(world)).toMatch(/^[0-9a-f]{16}$/);
    });
});
