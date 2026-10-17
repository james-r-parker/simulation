// Eval observer: reads each tick's events and the world arrays into per-slot counters, run totals, a death log and
// a checkpoint series. It runs outside `step` and allocates only when a log doubles or a birth is tracked.

import { checkpoint } from './observer-checkpoint.js';
import { applyEvents } from './observer-events.js';
import { createCellGrid } from './cell-grid.js';
import { createCombatCounters, observeCombat } from './observer-combat.js';
import { noteIntentEvents } from './observer-intent-events.js';
import { createIntentState, updateIntent } from './observer-intent.js';
import { createLog } from './growable-log.js';
import { CELL_SIZE, countCollisions, countTick } from './observer-tick.js';
import { STEP_PHASES } from '../sim/step.js';

export { checkpoint };

/** Per-slot arrays reset on `AgentBorn`, with their types. */
const SLOT_TYPES = {
    genomeId: Uint32Array,
    lineageId: Uint32Array,
    spec: Uint8Array,
    birthTick: Float64Array,
    ageTicks: Float64Array,
    foodEnergy: Float64Array,
    biteEnergy: Float64Array,
    children: Uint32Array,
    childrenFromSplit: Uint32Array,
    kills: Uint32Array,
    cellsVisited: Uint32Array,
    collisions: Uint32Array,
    distance: Float64Array,
    turnsTowardsFood: Uint32Array,
    speedSum: Float64Array,
    turnSum: Float64Array,
    samples: Uint32Array,
    generation: Uint32Array,
    archiveLineage: Uint8Array,
};

/** Death-log columns copied from the slot's counters; `fitness` is added separately. */
const DEATH_FIELDS = [
    'genomeId',
    'lineageId',
    'spec',
    'ageTicks',
    'foodEnergy',
    'biteEnergy',
    'children',
    'speedSum',
    'turnSum',
    'samples',
    'birthTick',
    'generation',
    'archiveLineage',
];

const SERIES_FIELDS = [
    'tick',
    'population',
    'lineagesAlive',
    'dominantLineage',
    'predatorShare',
    'diversity',
    'archiveAgents',
];

const BORN_CAUSES = 5;
const DEATH_CAUSES = 4;

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @param {Record<string, any>} rng the `eval` stream, `fork(createRng(config.seed), 'eval')`; kept as `observer.rng`
 * @returns {Record<string, any>} a fresh observer with every counter at zero
 */
export function createObserver(config, rng) {
    const n = config.maxAgents;
    const observer = {
        config,
        rng,
        slotArrays: Object.keys(SLOT_TYPES),
        ...createCellGrid(config, CELL_SIZE, n),
        slotOf: new Map(),
        ghosts: new Set(),
        deathFields: DEATH_FIELDS,
        ticks: 0,
        agentTicks: 0,
        births: new Float64Array(BORN_CAUSES),
        birthsAfterBurnIn: new Float64Array(BORN_CAUSES),
        deathsByCause: new Float64Array(DEATH_CAUSES),
        foodEnergyDead: 0,
        floorEpisodes: 0,
        lastFloorTick: -Infinity,
        deathCount: 0,
        deathsDrained: 0,
        deaths: createLog([...DEATH_FIELDS, 'fitness']),
        checkpointCount: 0,
        series: createLog(SERIES_FIELDS),
        dominantLineage: 0,
        combat: createCombatCounters(config),
        intent: createIntentState(config),
    };
    for (const [name, Type] of Object.entries(SLOT_TYPES)) {
        /** @type {Record<string, any>} */ (observer)[name] = new Type(n);
    }
    return observer;
}

/**
 * Feeds the observer one tick: call once right after `createWorld` (the initial births) and once after every `step`.
 * Order: combat and intent first (a dead agent's slot still holds its state), then the tick's deaths, then its
 * births, then floor records, then per-slot counters, then run totals.
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @param {((observer: any, slot: number, config: any) => number) | undefined} [fitness] the policy's fitness; the
 *   death log holds NaN without it
 * @returns {void}
 */
export function observe(observer, world, fitness) {
    observeCombat(observer.combat, world, observer.intent);
    updateIntent(observer.intent, world, observer.slotOf);
    noteIntentEvents(observer, world);
    applyEvents(observer, world, fitness);
    if (world.tick === 0) {
        return;
    }
    countTick(observer, world);
    observer.agentTicks += world.population;
    observer.ticks = world.tick;
}

/**
 * The `step` overrides an observed run passes: the physics phase unchanged, then `countCollisions`. The world is
 * only read, so an observed run steps bit for bit like an unobserved one.
 * @param {Record<string, any>} observer the observer
 * @returns {Readonly<Record<string, (world: any, policy: any) => void>>} overrides keyed by phase name
 */
export function observerPhases(observer) {
    const physics = STEP_PHASES.find((phase) => phase.name === 'physics');
    if (physics === undefined) {
        throw new Error('observerPhases: step has no physics phase');
    }
    return Object.freeze({
        physics(world, policy) {
            physics.run(world, policy);
            countCollisions(observer, world);
        },
    });
}
