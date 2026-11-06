// realistic-keepers.md with provisionEnabled and juvenileDependency on: real worlds run
// with the invariants checked every tick (provision totals equal, energy conserved), and a replay reaches the same world hash.

import { describe, expect, it } from 'vitest';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { cloneWithNoisePolicy } from '../../js/sim/birth-policy.js';
import { createConfig } from '../../js/sim/config.js';
import { ENERGY_SOURCE, addEnergy } from '../../js/sim/energy.js';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { spawnAgent, createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';
import { HUNTER, PREY, hunterBrain, stillBrain } from './helpers/predator-arena.js';
import { imbalance } from './helpers/life-world.js';

const TIMEOUT_MS = scaleTimeout(60_000);
const SWITCHES_ON = { provisionEnabled: true, juvenileDependency: true };
const YOUNG = 2;

/** The golden "busy" world: a crowded 2400 x 1600 map where mating, splits, bites, the floor and immigrants all happen. */
const BUSY = {
    worldWidth: 2400,
    worldHeight: 1600,
    maxAgents: 150,
    minAgents: 30,
    maturityTicks: 200,
    reproductionCooldown: 150,
    pregnancyTicks: 200,
    mateMinEnergy: 100,
    splitMinEnergy: 900,
    wallGaps: 2,
    refugeCount: 0,
    coldMarginWidth: 0,
};

/**
 * Runs the busy world with the switches on, checking every invariant on every tick.
 * @returns {{hash: string, imbalance: number}} the world hash after the last tick, and the energy ledger imbalance
 */
function runBusy() {
    const policy = cloneWithNoisePolicy();
    const world = createWorld(createConfig({ ...BUSY, ...SWITCHES_ON, checkInvariants: true }), policy);
    for (let t = 0; t < 3000; t++) {
        step(world, policy);
    }
    return { hash: hashWorld(world), imbalance: imbalance(world) };
}

/** @type {import('../../js/sim/spawn.js').Policy} */
const ARENA_POLICY = {
    initSpec: (_world, slot) => (slot === PREY ? 0 : 1),
    initBrain() {},
};

/**
 * A hunter that chases and kills a still prey with its young hunter beside it, provisioning on and the invariants checked
 * every tick.
 * @returns {Record<string, any>} the world after 500 ticks
 */
function runFamily() {
    const config = createConfig({
        ...SIMPLE_WORLD,
        ...SWITCHES_ON,
        huntSizeRatio: 1.01,
        worldWidth: 8000,
        worldHeight: 4000,
        maxAgents: 8,
        initialAgents: 0,
        minAgents: 0,
        initialFood: 0,
        foodSpawnRate: 0,
        fertileZoneMax: 0,
        provisionRange: 600,
        provisionShare: 0.5,
        checkInvariants: true,
    });
    const world = createWorld(config, ARENA_POLICY);
    for (let i = 0; i < 3; i++) {
        spawnAgent(world, ARENA_POLICY, BORN_CAUSE.INITIAL);
    }
    world.x.set([2000, 2300, 2000], 0);
    world.y.set([2000, 2000, 2060], 0);
    world.angle.fill(0, 0, 3);
    world.parentA[YOUNG] = world.genomeId[HUNTER];
    world.parentB[YOUNG] = world.genomeId[HUNTER];
    addEnergy(world, HUNTER, 2500 - world.energy[HUNTER], ENERGY_SOURCE.INITIAL);
    const brain = (/** @type {Record<string, any>} */ w) => {
        hunterBrain(w);
        stillBrain(w);
    };
    for (let t = 0; t < 500; t++) {
        step(world, ARENA_POLICY, { brain });
    }
    return world;
}

describe('provisioning and the juvenile dependency on', () => {
    it(
        'runs the busy world with invariants every tick and replays to the same world hash',
        () => {
            const first = runBusy();
            expect(first.hash).toBe(runBusy().hash);
            expect(Math.abs(first.imbalance)).toBeLessThan(1e-3);
        },
        TIMEOUT_MS,
    );

    it(
        'moves energy from a hunter to its young when it kills and eats, conserving it',
        () => {
            const world = runFamily();
            expect(world.alive[PREY]).toBe(0);
            expect(world.provisionTotals[0]).toBeGreaterThan(0);
            expect(world.provisionTotals[1]).toBe(world.provisionTotals[0]);
            expect(world.energy[YOUNG]).toBeGreaterThan(0);
            expect(Math.abs(imbalance(world))).toBeLessThan(1e-6);
            expect(hashWorld(world)).toBe(hashWorld(runFamily()));
        },
        TIMEOUT_MS,
    );
});
