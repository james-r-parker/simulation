// Builds one run for the host - config, observer, policy, world and the read-only helpers around them - steps it a
// tick the way the eval runner does, and describes it to the app (`ready.info`, `ready.layout`).

import { feedPolicy } from '../evo/feed-policy.js';
import { createObserver, observerPhases } from '../evo/observer.js';
import { SEASONS_PER_YEAR, yearTicks } from '../sim/eras.js';
import { DEATH_CAUSE, BORN_CAUSE } from '../sim/events.js';
import { configHash, createConfig, rulesHash } from '../sim/config.js';
import { createRng, fork } from '../sim/rng.js';
import { createWorld } from '../sim/spawn.js';
import { SNAPSHOT_FLAG } from '../sim/snapshot.js';
import { terrainRockCount } from '../sim/terrain.js';
import { step } from '../sim/step.js';
import {
    collectEffects,
    createEffectLog,
    EFFECT_CAPACITY,
    EFFECT_KIND,
    EFFECT_WORDS,
    primeEffects,
} from './effects.js';
import { createGenerations, noteBirths } from './generation.js';
import { createLiveStats, noteTick } from './live-stats.js';
import { workerLayout } from './inspect.js';

/** The names of the four seasons, in `world.season[0]` order. */
export const SEASON_NAMES = Object.freeze(['spring', 'summer', 'autumn', 'winter']);

/** The tick rate the app shows as 1x. */
export const BASE_TICKS_PER_SECOND = 60;

/**
 * @typedef {object} Run
 * @property {Readonly<Record<string, any>>} config the validated config
 * @property {Record<string, any>} world the world
 * @property {Record<string, any>} observer the eval observer
 * @property {Record<string, any>} policy the policy object
 * @property {Readonly<Record<string, (world: any, policy: any) => void>>} phases the observed `step` overrides
 * @property {import('./effects.js').EffectLog} effects the pending render effects
 * @property {import('./generation.js').Generations} generations generation depth per slot
 * @property {import('./live-stats.js').LiveStats} live the stats and ticker state
 * @property {Record<string, number>} layout the snapshot buffer layout
 * @property {{world: any, observer: any, policy: any, generations: any}} source the read-only view `writeInspect`
 *   and `collectStats` take
 * @property {number} seed the world seed
 * @property {string} configHash the hash of the whole config
 * @property {string} rulesHash the hash of the rules part of the config
 */

/**
 * Builds a run and feeds the observer and the policy the initial population, as the eval runner does.
 * @param {{seed: number, overrides: Record<string, any>, createPolicy: (options: Record<string, any>) => Record<string, any>,
 *   log: import('../sim/log.js').SimLog, policyName?: string}} options the seed, the config overrides, the policy
 *   factory, the log and the registered policy asked for (the factory's default when absent)
 * @returns {Run} the run, at tick 0
 */
export function buildRun({ seed, overrides, createPolicy, log, policyName }) {
    const config = createConfig({ ...overrides, seed });
    const observer = createObserver(config, fork(createRng(seed), 'eval'));
    const policy = createPolicy({ config, log, observer, policyName });
    const world = createWorld(config, policy.brain);
    feedPolicy({ policy, observer }, world);
    const generations = createGenerations(config);
    const effects = createEffectLog(config.maxAgents);
    primeEffects(effects, world);
    return {
        config,
        world,
        observer,
        policy,
        phases: observerPhases(observer),
        effects,
        generations,
        live: createLiveStats(),
        layout: workerLayout(config),
        source: { world, observer, policy, generations },
        seed,
        configHash: configHash(config),
        rulesHash: rulesHash(config),
    };
}

/**
 * Advances the run one tick. The order is the eval runner's (step, observe, the policy's hooks), with the read-only
 * helpers placed where the observer's map still holds the agents alive at the start of the tick.
 * @param {Run} run the run
 * @returns {void}
 */
export function tickOnce(run) {
    const { world, observer, policy } = run;
    step(world, policy.brain, run.phases);
    noteBirths(run.generations, world, observer.slotOf);
    collectEffects(run.effects, world, observer.slotOf);
    feedPolicy({ policy, observer }, world);
    noteTick(run.live, world, observer);
}

/**
 * @param {Run} run the run
 * @returns {number} bytes of a field buffer: the danger, attack and hunt grids back to back
 */
export function fieldBytes(run) {
    const { cols, rows } = run.world.pheromoneGrid;
    return cols * rows * 3 * 4;
}

/**
 * @param {Readonly<Record<string, any>>} config the config
 * @returns {Record<string, any>} the static terrain: the cold margin, the wall's x and the obstacle slots
 *   that hold its rocks (they are drawn from the snapshot's obstacles)
 */
function terrainInfo(config) {
    return {
        coldMarginWidth: config.coldMarginWidth,
        wallX: config.worldWidth / 2,
        rockFirst: 0,
        rockCount: terrainRockCount(config),
    };
}

/**
 * The output thresholds the app lights its indicators with (the inspector's firing lights).
 * @param {Record<string, any>} config the run's config
 * @returns {{smokeThreshold: number, alarmThreshold: number, huntCallThreshold: number}} the thresholds
 */
function callThresholds(config) {
    return {
        smokeThreshold: config.smokeThreshold,
        alarmThreshold: config.alarmThreshold,
        huntCallThreshold: config.huntCallThreshold,
    };
}

/**
 * The world and rule constants the app draws with.
 * @param {Run} run the run
 * @returns {Record<string, any>} `ready.info`
 */
export function worldInfo({ config, world }) {
    const { cols, rows } = world.pheromoneGrid;
    return {
        worldWidth: config.worldWidth,
        worldHeight: config.worldHeight,
        maxAgents: config.maxAgents,
        maxFood: config.maxFood,
        obstacleCount: terrainRockCount(config),
        maxClouds: config.maxClouds,
        maxVelocity: config.maxVelocity,
        maxEnergy: config.maxEnergy,
        maxAgeTicks: config.maxAgeTicks,
        seasonLength: yearTicks(config) / SEASONS_PER_YEAR,
        seasonNames: [...SEASON_NAMES],
        ticksPerSecond: BASE_TICKS_PER_SECOND,
        rayCount: config.rayCount,
        callRadius: config.callRadius,
        callTicks: config.callTicks,
        smokeRadius: config.smokeRadius,
        smokeTicks: config.smokeTicks,
        ...callThresholds(config),
        antennaReach: config.antennaReach,
        antennaAngle: config.antennaAngle,
        biteArc: config.biteArc,
        temperatureMax: config.temperatureMax,
        temperatureColdStress: config.temperatureColdStress,
        temperatureOptimalMin: config.temperatureOptimalMin,
        temperatureOptimalMax: config.temperatureOptimalMax,
        temperatureHeatStress: config.temperatureHeatStress,
        cols,
        rows,
        cellSize: config.pheromoneCellSize,
        pheromoneMax: config.pheromoneMax,
        patches: Array.from(world.patchX, (x, i) => ({
            x,
            y: world.patchY[i],
            radius: config.foodPatchRadius,
        })),
        terrain: terrainInfo(config),
        specs: Object.entries(config.specialisations).map(([name, s]) => ({
            index: s.index,
            name,
            canHunt: s.canHunt,
            visionRange: s.visionRange,
        })),
    };
}

/**
 * The buffer layout and the code tables the app needs, so it imports nothing from the sim.
 * @param {Run} run the run
 * @returns {Record<string, any>} `ready.layout`
 */
export function readyLayout(run) {
    return {
        ...run.layout,
        fieldBytes: fieldBytes(run),
        effectCapacity: EFFECT_CAPACITY,
        effectWords: EFFECT_WORDS,
        effectKinds: { ...EFFECT_KIND },
        flags: { ...SNAPSHOT_FLAG },
        deathCauses: { ...DEATH_CAUSE },
        bornCauses: { ...BORN_CAUSE },
    };
}
