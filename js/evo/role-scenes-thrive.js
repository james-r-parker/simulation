// The scripted foraging, living and sitting in the real sim (docs/designs/role-budget.md, "Cross-check against the sim"): a forager
// that steers to the nearest of a grid of food, a hunter that chases a prey, and a body that sits or walks until its energy is
// gone. Each reading carries the field name of the formula it checks, so `--check` compares field by field.

import { ENERGY_SOURCE, LOSS_CAUSE, addEnergy, removeEnergy } from '../sim/energy.js';
import { step } from '../sim/step.js';
import { ARENA_CENTRE, arenaConfig, stageArena } from './chase-arena.js';
import { foragerBrain, sitterBrain, walkerBrain } from './forage-oracles.js';
import { simChase } from './role-budget-check.js';
import { gapAtAwareness } from './role-budget-frame.js';
import { roleParams } from './role-budget-params.js';

/** The width of the arena of the idle scene: wide enough that a walk of a founder's range ends before the wall of rocks. */
const IDLE_WIDTH = 40000;
/** The items along a side of the grid of the foraging scene. */
const GRID_SIDE = 36;
/** The longest a scene runs, in ticks. */
const LIMIT = 80000;

/**
 * @param {Readonly<Record<string, any>>} config the default world's config
 * @param {number} width the arena's width
 * @param {{herds?: number}} [options] the herds to keep (none), which also drops the food patches so a herd flees rather than routes
 * @returns {Readonly<Record<string, any>>} the config with the world emptied: no food, herds, refuges or floor, no neighbours
 */
export function emptied(config, width, { herds = 0 } = {}) {
    return arenaConfig({
        ...config,
        worldWidth: width,
        worldHeight: 8000,
        maxAgents: 8,
        initialAgents: 0,
        minAgents: 0,
        initialFood: 0,
        maxFood: Math.max(config.maxFood, GRID_SIDE * GRID_SIDE),
        foodSpawnRate: 0,
        fertileZoneMax: 0,
        refugeCount: 0,
        herdCount: herds,
        herdDungZoneMax: 0,
        foodPatchCount: herds > 0 ? 0 : config.foodPatchCount,
        coldMarginWidth: 0,
        checkInvariants: false,
    });
}

/**
 * Sets a staged body's energy to `energy`, up or down.
 * @param {Record<string, any>} world the world
 * @param {number} slot the body
 * @param {number} energy the energy to hold
 * @returns {void}
 */
export function setEnergy(world, slot, energy) {
    const delta = energy - world.energy[slot];
    if (delta >= 0) {
        addEnergy(world, slot, delta, ENERGY_SOURCE.INITIAL);
    } else {
        removeEnergy(world, slot, -delta, LOSS_CAUSE.COST);
    }
}

/**
 * @param {{x: number, y: number}} centre the middle of the grid
 * @param {number} spacing the distance between neighbours
 * @param {number} side the items along a side
 * @returns {{x: number, y: number}[]} the food centres of a square grid
 */
function gridOf(centre, spacing, side) {
    const half = ((side - 1) * spacing) / 2;
    return Array.from({ length: side * side }, (_, i) => ({
        x: centre.x - half + (i % side) * spacing,
        y: centre.y - half + Math.floor(i / side) * spacing,
    }));
}

/** The meals a forager eats before the scene starts to measure: the items under it at the start (3 at the defaults) are eaten first. */
const SETTLE_MEALS = 4;

/**
 * @typedef {object} ForagingScene
 * @property {{firstMeal: number | null, settled: number | null, meals: number}} ticks the tick of the first meal, the tick of the
 *   `SETTLE_MEALS`th (null when not reached) and the meals eaten
 * @property {{netPerTick: number | null, energy: number}} outcome the net energy gained a tick from the settled meal to the end,
 *   and the energy at the end
 */

/**
 * @param {Record<string, any>} w the world after the run
 * @param {{settled: {tick: number, energy: number} | null, first: number | null, n: number}} run the settled meal, the first meal
 *   and the ticks played
 * @returns {ForagingScene} the readings
 */
function readForaging(w, { settled, first, n }) {
    const fed = settled !== null && n > settled.tick;
    return {
        ticks: { firstMeal: first, settled: settled === null ? null : settled.tick, meals: w.mealsTotal[0] },
        outcome: {
            netPerTick: fed ? (w.energy[0] - settled.energy) / (n - settled.tick) : null,
            energy: w.energy[0],
        },
    };
}

/**
 * @param {Readonly<Record<string, any>>} config the default world's config
 * @param {{spec: string, density: number, energy: number}} scene the spec, the grid's density and the start energy
 * @returns {ReturnType<typeof stageArena>} the arena: one body in a grid of food items of `foodEnergy` and `foodRadius`
 */
function stageGrid(config, { spec, density, energy }) {
    const world = emptied(config, 16000);
    const specs = /** @type {Record<string, any>} */ (world.specialisations);
    const foods = gridOf(ARENA_CENTRE, 1 / Math.sqrt(density), GRID_SIDE);
    const staged = stageArena(world, [{ spec: specs[spec].index, ...ARENA_CENTRE, angle: 0 }], { foods });
    const w = staged.world;
    for (let i = 0; i < w.foodAlive.length; i++) {
        if (w.foodAlive[i] === 1) {
            w.foodRadius[i] = world.foodRadius;
            w.foodValue[i] = world.foodEnergy;
        }
    }
    setEnergy(w, 0, energy);
    return staged;
}

/**
 * Plays the forager oracle in a grid of food at the spacing `1 / sqrt(density)`, each item holding `foodEnergy` and having
 * `foodRadius`, from `energy` until its energy passes `stop` (a grid is not the patch's random scatter), and reads the rate from
 * the fourth meal on.
 * @param {Readonly<Record<string, any>>} config the default world's config
 * @param {{spec: string, density: number, energy: number, stop: number, limit?: number}} scene the spec, the density of the
 *   grid in items per px2, the start energy, the energy to stop at and the most ticks to play
 * @returns {ForagingScene} the ticks and the net energy rate
 */
export function playForaging(config, { spec, density, energy, stop, limit = 3000 }) {
    const { world: w, policy } = stageGrid(config, { spec, density, energy });
    const brain = foragerBrain({ slot: 0 });
    const run = {
        settled: /** @type {{tick: number, energy: number} | null} */ (null),
        first: /** @type {number | null} */ (null),
        n: 0,
    };
    while (w.energy[0] <= stop && run.n < limit && w.alive[0] === 1) {
        step(w, policy, { brain });
        run.n += 1;
        run.first = run.first === null && w.mealsTotal[0] > 0 ? run.n : run.first;
        run.settled =
            run.settled === null && w.mealsTotal[0] >= SETTLE_MEALS
                ? { tick: run.n, energy: w.energy[0] }
                : run.settled;
    }
    return readForaging(w, run);
}

/**
 * Plays the scripted chase of Phase 1 (the oracle pursuer and the breaking evader, no start jitter) at the gap the prey first
 * sees the hunter, and reads what a kill returns. A hunter's chase is the Phase 1 scene; this reads it as a living.
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {{prey: string, gate: number, birth: number}} scene the prey, the split gate and the energy born with
 * @returns {{ticks: {killTick: number | null}, outcome: {net: number | null, chasesToGate: number | null}}} the kill tick, the
 *   net energy of the chase, and the chases it takes to climb from `birth` to `gate` at that net
 */
export function playLiving(config, { prey, gate, birth }) {
    const hunter = roleParams(config, 'predator');
    const distance = gapAtAwareness(hunter, roleParams(config, prey));
    const chase = simChase(config, { hunter: 'predator', prey, distance, bearing: 0, straight: false });
    const net = chase.net;
    return {
        ticks: { killTick: chase.killTick },
        outcome: { net, chasesToGate: net !== null && net > 0 ? (gate - birth) / net : null },
    };
}

/**
 * @param {Readonly<Record<string, any>>} config the default world's config
 * @param {{spec: string, energy: number, speed: number}} scene the spec, the energy it is born with and the speed it walks (0 to sit)
 * @returns {{ticks: {life: number}, outcome: {died: boolean, coldest: number}}} the ticks the body lives alone in an empty wide
 *   arena at that gait, until its energy is gone or `maxAgeTicks`, and the lowest temperature it reached
 */
export function playIdle(config, { spec, energy, speed }) {
    const arena = emptied(config, IDLE_WIDTH);
    const specs = /** @type {Record<string, any>} */ (arena.specialisations);
    const staged = stageArena(arena, [{ spec: specs[spec].index, ...ARENA_CENTRE, angle: 0 }]);
    const w = staged.world;
    setEnergy(w, 0, energy);
    const brain = speed === 0 ? sitterBrain({ slot: 0 }) : walkerBrain({ slot: 0, speed });
    let n = 0;
    let coldest = w.temperature[0];
    while (w.alive[0] === 1 && n < Math.min(LIMIT, arena.maxAgeTicks)) {
        step(w, staged.policy, { brain });
        n += 1;
        // a body that has just died has its slot freed, which zeroes its temperature
        coldest = w.alive[0] === 1 ? Math.min(coldest, w.temperature[0]) : coldest;
    }
    return { ticks: { life: n }, outcome: { died: w.alive[0] === 0, coldest } };
}
