import { agePollen } from './pollination.js';
import { stepToxin } from './toxin.js';
import { ageMycelium } from './mycelium.js';
// One simulation tick: the phases in order, per-phase overrides, and the tick and phase added to any failure.
import { refreshFruiting } from './fruiting.js';
import { signalAll } from './calls.js';
import { applyCosts } from './energy.js';
import { clearEvents } from './events.js';
import { decayFertileZones, updateSeason } from './environment.js';
import { feed } from './feeding.js';
import { ageFood, spawnFood } from './food.js';
import { advanceEra } from './eras.js';
import { regrowPatches } from './food-patches.js';
import { assertInvariants } from './invariants.js';
import { forwardAll } from './brain.js';
import { sampleInputActivity } from './input-activity.js';
import { actAll, integrate, resolveContacts } from './physics.js';
import { fillFloor, reap } from './population.js';
import { updatePheromones } from './pheromones.js';
import { meritPhase } from './merit-phase.js';
import { tallyReady } from './merit-tally.js';
import { advancePregnancies, mate, splitAll } from './reproduction.js';
import { senseAll } from './sensors.js';
import { ageSmoke } from './smoke.js';
import { buildHash } from './spatial-hash.js';
import { stepHerds } from './herd-motion.js';
import { grazeHerds } from './herd-graze.js';
import { ageAndReproduceHerds } from './herd-life.js';
import { dropHerdDung } from './herd-dung.js';

/** @typedef {import('./world.js').World} World */
/** @typedef {(world: World, policy: any) => void} PhaseRun */

/**
 * @param {World} world the world
 * @returns {void}
 */
function environment(world) {
    updateSeason(world);
    advanceEra(world);
    stepHerds(world);
}

/**
 * @param {World} world the world
 * @returns {void}
 */
function hash(world) {
    buildHash(world.hash, world);
}

/**
 * @param {World} world the world
 * @returns {void}
 */
function sense(world) {
    senseAll(world, world.hash);
}

/**
 * @param {World} world the world
 * @returns {void}
 */
function brain(world) {
    forwardAll(world);
    sampleInputActivity(world.inputActivity, world);
}

/**
 * @param {World} world the world
 * @returns {void}
 */
function signal(world) {
    signalAll(world, world.hash);
}

/**
 * @param {World} world the world
 * @returns {void}
 */
function physics(world) {
    actAll(world);
    integrate(world);
    buildHash(world.hash, world);
    resolveContacts(world, world.hash);
}

/**
 * @param {World} world the world
 * @param {any} policy the brain policy
 * @returns {void}
 */
function lifecycle(world, policy) {
    agePollen(world);
    stepToxin(world);
    feed(world, world.hash);
    mate(world, policy);
    applyCosts(world);
    advancePregnancies(world, policy);
    tallyReady(world);
    splitAll(world, policy);
    reap(world, policy);
    fillFloor(world, policy);
}

/**
 * @param {World} world the world
 * @returns {void}
 */
function field(world) {
    ageMycelium(world);
    regrowPatches(world);
    refreshFruiting(world);
    spawnFood(world);
    grazeHerds(world);
    dropHerdDung(world);
    ageAndReproduceHerds(world);
    ageFood(world);
    decayFertileZones(world);
    updatePheromones(world);
    ageSmoke(world);
}

/**
 * @param {World} world the world
 * @returns {void}
 */
function merit(world) {
    meritPhase(world);
}

/**
 * @param {World} world the world
 * @returns {void}
 */
function invariants(world) {
    if (world.config.checkInvariants) {
        assertInvariants(world);
    }
}

/**
 * @param {string} name the phase name
 * @param {PhaseRun} run the phase body
 * @returns {Readonly<{name: string, run: PhaseRun}>}
 */
function phase(name, run) {
    return Object.freeze({ name, run });
}

/** The tick's phases in execution order; the bench and the anti-exploit suite call or replace `run` directly. */
export const STEP_PHASES = Object.freeze([
    phase('environment', environment),
    phase('hash', hash),
    phase('sense', sense),
    phase('brain', brain),
    phase('signal', signal),
    phase('physics', physics),
    phase('lifecycle', lifecycle),
    phase('field', field),
    phase('merit', merit),
    phase('invariants', invariants),
]);

/**
 * Advances the world by one tick. Clears the event ring, runs each phase (or its override), then increments `tick`.
 * A failing phase is rethrown as an `Error` naming the tick and phase, with the original as `cause`.
 * @param {World} world the world
 * @param {any} policy the brain policy
 * @param {Readonly<Record<string, PhaseRun>>} [overrides] replacement `run` functions keyed by phase name
 * @returns {void}
 */
export function step(world, policy, overrides) {
    clearEvents(world.events);
    for (let i = 0; i < STEP_PHASES.length; i++) {
        const { name, run } = STEP_PHASES[i];
        const replacement = overrides === undefined ? undefined : overrides[name];
        try {
            (replacement === undefined ? run : replacement)(world, policy);
        } catch (cause) {
            const detail = cause instanceof Error ? cause.message : String(cause);
            throw new Error(`tick ${world.tick}, phase ${name}: ${detail}`, { cause });
        }
    }
    world.tick += 1;
}
