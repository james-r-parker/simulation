import { describe, expect, it } from 'vitest';
import { createSimLog } from '../../js/sim/log.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { createConfig } from '../../js/sim/config.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { cloneWithNoisePolicy } from '../../js/sim/birth-policy.js';
import {
    BASE_TICKS_PER_SECOND,
    SEASON_NAMES,
    buildRun,
    fieldBytes,
    readyLayout,
    tickOnce,
    worldInfo,
} from '../../js/worker/host-world.js';
import { noisePolicy, SMALL_CONFIG } from './helpers/host-harness.js';

const LOG = createSimLog(() => {}, { level: 'error' });

/** @returns {import('../../js/worker/host-world.js').Run} a run of the small world at tick 0 */
function small() {
    return buildRun({ seed: 3, overrides: SMALL_CONFIG, createPolicy: noisePolicy, log: LOG });
}

describe('buildRun', () => {
    it('builds a world at tick 0 whose observer already tracks the initial population', () => {
        const run = small();
        expect(run.world.tick).toBe(0);
        expect(run.world.population).toBe(SMALL_CONFIG.initialAgents);
        expect(run.observer.slotOf.size).toBe(SMALL_CONFIG.initialAgents);
        expect(run.seed).toBe(3);
        expect(run.config.seed).toBe(3);
        expect(run.configHash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('caches the initial places so a first-tick death has one, without announcing the initial births', () => {
        const run = small();
        expect(run.effects.count).toBe(0);
        const slot = run.world.alive.indexOf(1);
        expect(run.effects.cacheGenome[slot]).toBe(run.world.genomeId[slot]);
    });

    it('passes the policy factory the config, the log and the observer', () => {
        /** @type {Record<string, any>} */
        let seen = {};
        buildRun({
            seed: 1,
            overrides: SMALL_CONFIG,
            createPolicy: (options) => {
                seen = options;
                return noisePolicy();
            },
            log: LOG,
        });
        expect(Object.keys(seen).sort()).toEqual(['config', 'log', 'observer']);
        expect(seen.log).toBe(LOG);
    });

    it('rejects an invalid config naming the key', () => {
        expect(() => buildRun({ seed: 1, overrides: { maxAgents: -1 }, createPolicy: noisePolicy, log: LOG })).toThrow(
            /maxAgents/,
        );
    });
});

describe('tickOnce', () => {
    it('steps the world exactly as the core does without the host', () => {
        const run = small();
        const config = createConfig({ ...SMALL_CONFIG, seed: 3 });
        const policy = cloneWithNoisePolicy();
        const reference = createWorld(config, policy);
        for (let t = 0; t < 120; t++) {
            tickOnce(run);
            step(reference, policy);
        }
        expect(hashWorld(run.world)).toBe(hashWorld(reference));
    });

    it('keeps generation depth, effects and ticker state current', () => {
        const overrides = {
            ...SMALL_CONFIG,
            maturityTicks: 100,
            reproductionCooldown: 100,
            pregnancyTicks: 100,
            mateMinEnergy: 100,
            splitMinEnergy: 400,
        };
        const run = buildRun({ seed: 3, overrides, createPolicy: noisePolicy, log: LOG });
        for (let t = 0; t < 1500; t++) {
            tickOnce(run);
        }
        const born = run.observer.births[1] + run.observer.births[2];
        expect(born).toBeGreaterThan(0);
        expect(Math.max(...run.generations.depth)).toBeGreaterThan(0);
        expect(run.effects.count + run.effects.dropped).toBeGreaterThan(0);
    });
});

describe('worldInfo patches', () => {
    it('is empty with no patches and lists each patch centre and radius when on', () => {
        expect(worldInfo(small()).patches).toEqual([]);
        const run = buildRun({
            seed: 3,
            overrides: { ...SMALL_CONFIG, foodPatchCount: 2, foodPatchRadius: 100 },
            createPolicy: noisePolicy,
            log: LOG,
        });
        const { patches } = worldInfo(run);
        expect(patches).toHaveLength(2);
        expect(patches[0]).toEqual({ x: run.world.patchX[0], y: run.world.patchY[0], radius: 100 });
    });
});

describe('worldInfo and readyLayout', () => {
    it('lists the constants the app draws with, and every specialisation', () => {
        const info = worldInfo(small());
        expect(info).toMatchObject({
            worldWidth: 1600,
            worldHeight: 1000,
            maxAgents: 40,
            rayCount: 8,
            ticksPerSecond: BASE_TICKS_PER_SECOND,
            seasonNames: [...SEASON_NAMES],
            biteArc: Math.PI / 4,
            cellSize: 100,
        });
        expect(info.cols * info.rows).toBe(16 * 10);
        expect(info.specs.map((/** @type {any} */ s) => s.name)).toEqual([
            'forager',
            'predator',
            'reproducer',
            'scout',
            'defender',
        ]);
        expect(info.specs[1]).toMatchObject({ index: 1, canHunt: true, visionRange: 350 });
    });

    it('carries the buffer offsets, the effect kinds, the flag bits and the cause codes', () => {
        const run = small();
        const layout = readyLayout(run);
        expect(layout).toMatchObject({ effectCapacity: 512, effectWords: 8, bytes: run.layout.bytes });
        expect(layout.effectKinds.SMOKE).toBe(6);
        expect(layout.flags.PREGNANT).toBe(1 << 13);
        expect(layout.deathCauses.EATEN).toBe(1);
        expect(layout.bornCauses.MATE).toBe(1);
        expect(layout.fieldBytes).toBe(fieldBytes(run));
        expect(fieldBytes(run)).toBe(16 * 10 * 3 * 4);
    });
});

describe('worldInfo terrain', () => {
    it('is open with no rocks by default and describes the static rocks in basins', () => {
        expect(worldInfo(small()).terrain).toEqual({
            layout: 'open',
            coldMarginWidth: 0,
            wallX: 0,
            rockFirst: SMALL_CONFIG.obstacleCount,
            rockCount: 0,
        });
        const run = buildRun({
            seed: 3,
            overrides: {
                ...SMALL_CONFIG,
                worldWidth: 6000,
                worldHeight: 4000,
                obstacleCount: 0,
                terrainLayout: 'basins',
            },
            createPolicy: noisePolicy,
            log: LOG,
        });
        const info = worldInfo(run);
        expect(info.terrain).toMatchObject({ layout: 'basins', coldMarginWidth: 600, wallX: 3000, rockFirst: 0 });
        expect(info.terrain.rockCount).toBeGreaterThan(0);
        expect(info.obstacleCount).toBe(info.terrain.rockCount);
        expect(run.world.obsX.length).toBe(info.obstacleCount);
    });
});
