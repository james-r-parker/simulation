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
import { seasonAt } from '../../js/sim/environment.js';
import { yearTicks } from '../../js/sim/eras.js';
import { calendarOf } from '../../js/app/ui/status-line.js';
import { noisePolicy, SMALL_CONFIG } from './helpers/host-harness.js';
import { FEATURES_OFF } from '../../scripts/lib/features-on.mjs';

const LOG = createSimLog(() => {}, { level: 'error' });

/** @param {string} w a word @returns {string} capitalised */
const capitalised = (w) => w[0].toUpperCase() + w.slice(1);

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
        expect(Object.keys(seen).sort()).toEqual(['config', 'log', 'observer', 'policyName']);
        expect(seen.log).toBe(LOG);
        expect(seen.policyName).toBeUndefined();
    });

    it('tells the policy factory which registered policy was asked for', () => {
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
            policyName: 'map-elites-v6',
        });
        expect(seen.policyName).toBe('map-elites-v6');
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
        const config = createConfig({ ...FEATURES_OFF, ...SMALL_CONFIG, seed: 3 });
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

describe('worldInfo calendar and switches', () => {
    it('sends one season in ticks (eraSeasonTicks)', () => {
        const base = worldInfo(small());
        expect(base).toMatchObject({ seasonLength: 36000, sexesEnabled: false });
        const run = buildRun({
            seed: 3,
            overrides: { ...SMALL_CONFIG, eraSeasonTicks: 500, sexesEnabled: true },
            createPolicy: noisePolicy,
            log: LOG,
        });
        expect(worldInfo(run)).toMatchObject({ seasonLength: 500, sexesEnabled: true });
    });

    it.each([
        ['default', {}],
        ['short', { eraSeasonTicks: 500 }],
    ])('gives a calendar that matches the sim season and year with %s eras', (_name, extra) => {
        const run = buildRun({
            seed: 3,
            overrides: { ...SMALL_CONFIG, ...extra },
            createPolicy: noisePolicy,
            log: LOG,
        });
        const info = worldInfo(run);
        const year = yearTicks(run.config);
        for (const tick of [0, 1, 899, 900, 1799, 2000, 3599, 3600, 7300, 10000]) {
            seasonAt(run.world, tick);
            const cal = calendarOf(
                { tick, season: run.world.season[0] },
                { seasonNames: info.seasonNames, seasonLength: info.seasonLength, seed: 3 },
            );
            expect(cal.year).toBe(Math.floor(tick / year) + 1);
            expect(info.seasonNames.map(capitalised)[Math.floor(((tick % year) / year) * 4)]).toBe(cal.season);
            expect(Math.floor(tick / info.seasonLength) % 4).toBe(run.world.season[0]);
        }
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
            biteArc: 1.571,
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

    it('passes the alarm and hunt call thresholds to the app, as it does smokeThreshold (T15d)', () => {
        const overrides = { ...SMALL_CONFIG, alarmThreshold: 0.3, huntCallThreshold: 0.7, smokeThreshold: 0.6 };
        const info = worldInfo(buildRun({ seed: 3, overrides, createPolicy: noisePolicy, log: LOG }));
        expect(info).toMatchObject({ alarmThreshold: 0.3, huntCallThreshold: 0.7, smokeThreshold: 0.6 });
    });

    it('carries the buffer offsets, the effect kinds, the flag bits and the cause codes', () => {
        const run = small();
        const layout = readyLayout(run);
        expect(layout).toMatchObject({ effectCapacity: 512, effectWords: 8, bytes: run.layout.bytes });
        expect(layout.effectKinds.SMOKE).toBe(6);
        expect(layout.flags.PREGNANT).toBe(1 << 13);
        expect(layout.flags.MALE).toBe(1 << 14);
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
