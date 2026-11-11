// Is food the brake on the population (carrying-capacity.md, Detectors)? Read at the 1000-tick checkpoints from
// `BURN_IN_TICKS`, from the alive count, the edible food slots, the starvation deaths and the food energy taken so far.
//
// - `eval.cap_share` (lower): the share of checkpoints with the population at `maxAgents` less `splitCapMargin` or more.
// - `eval.food_standing_share` (watch): the mean over checkpoints of the edible food slots (alive and not toxic) over `maxFood`.
// - `eval.density_starve_slope` (higher): the elasticity of the starvation deaths per agent in a checkpoint window with
//   respect to the population at the window's start, at the season means. A world that food holds starves more per head as
//   it fills, so it is positive; 0 is no density dependence.
// - `eval.density_intake_slope` (lower): the same elasticity for the food energy taken per agent (`foodEnergy`, the plant
//   and carcass meals; a bite is not counted); negative when food per head falls with crowding.
//
// Inside each season the least-squares slope of the per-agent rate on the population is multiplied by the mean population
// over the mean rate, which makes it scale-free (the `trend` power bar is an absolute 0.10, so a raw slope of about 1e-3
// would always pass it). The seasons' elasticities are averaged, since the season and the time since the start are
// confounded (sim-notes 2026-11-06, T66). A season needs `MIN_SEASON_WINDOWS` windows with a population that varies and a
// mean rate above 0; a season with a mean rate of 0 is skipped, and the metric is null when no season qualifies.
//
// The checkpoint is one pass over the agent slots and the food slots every 1000 ticks, and a death adds two numbers to the
// run's totals; nothing is allocated per tick. The scene reads the world and writes only itself, so no hash can move.

import { DEATH_CAUSE } from '../sim/events.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { createLog, ensureRoom } from './growable-log.js';
import { mean, none, ok } from './metrics-stats.js';

/** The fewest windows with a varying population a season needs for its slope to count. */
export const MIN_SEASON_WINDOWS = 5;

/** Ticks between the checkpoints (the 1000-tick checkpoint every scene shares). */
const CHECKPOINT_TICKS = 1000;

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} an empty capacity scene: the checkpoint series (population, edible food slots, season, and
 *   the running totals of starvation deaths and food energy taken), the totals, and the two limits it reads
 */
export function createCapacityScene(config) {
    return {
        log: createLog(['pop', 'edible', 'season', 'starved', 'intake']),
        rows: 0,
        starved: 0,
        intakeDead: 0,
        capAt: config.maxAgents - config.splitCapMargin,
        maxFood: config.maxFood,
    };
}

/**
 * Adds a death to the run's totals: a starvation death, and the food energy the agent took in over its life.
 * @param {Record<string, any>} scene the capacity scene
 * @param {{cause: number, foodEnergy: number}} death the `AGENT_DIED` cause and the agent's lifetime `foodEnergy`
 * @returns {void}
 */
export function noteCapacityDeath(scene, { cause, foodEnergy }) {
    scene.starved += cause === DEATH_CAUSE.STARVED ? 1 : 0;
    scene.intakeDead += foodEnergy;
}

/**
 * @param {Record<string, any>} world the world
 * @returns {number} the food slots alive and not toxic
 */
function edibleSlots(world) {
    let edible = 0;
    for (let slot = 0; slot < world.foodAlive.length; slot++) {
        edible += world.foodAlive[slot] === 1 && world.foodTox[slot] === 0 ? 1 : 0;
    }
    return edible;
}

/**
 * @param {Record<string, any>} scene the capacity scene
 * @param {Record<string, any>} world the world
 * @returns {number} the food energy taken since the start: the dead agents' lives and the living agents' so far
 */
function intakeSoFar(scene, world) {
    let intake = scene.intakeDead;
    for (let slot = 0; slot < world.alive.length; slot++) {
        intake += world.alive[slot] === 1 ? world.foodEnergy[slot] : 0;
    }
    return intake;
}

/**
 * Takes the checkpoint at the world's tick, if it is a 1000-tick checkpoint at or after burn-in. Call it after the tick's
 * deaths are noted.
 * @param {Record<string, any>} scene the capacity scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleCapacity(scene, world) {
    if (world.tick < BURN_IN_TICKS || world.tick % CHECKPOINT_TICKS !== 0) {
        return;
    }
    const row = scene.rows++;
    ensureRoom(scene.log, row);
    const { log } = scene;
    log.pop[row] = world.population;
    log.edible[row] = edibleSlots(world);
    log.season[row] = world.season[0];
    log.starved[row] = scene.starved;
    log.intake[row] = intakeSoFar(scene, world);
}

/**
 * The least-squares slope of `y` on `x`.
 * @param {readonly number[]} x the regressor
 * @param {readonly number[]} y the response, as long as `x`
 * @returns {number | null} the slope; null with fewer than 2 points or no spread in `x`
 */
export function olsSlope(x, y) {
    if (x.length < 2) {
        return null;
    }
    const mx = mean(x);
    const my = mean(y);
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < x.length; i++) {
        sxy += (x[i] - mx) * (y[i] - my);
        sxx += (x[i] - mx) * (x[i] - mx);
    }
    return sxx === 0 ? null : sxy / sxx;
}

/**
 * Fits the elasticity of `y` with respect to `x` inside each season (the least-squares slope times mean `x` over mean `y`)
 * and averages the fits.
 * @param {{x: ArrayLike<number>, y: ArrayLike<number>, season: ArrayLike<number>}} windows one entry per window: the
 *   population at its start, the per-agent rate in it, and the season it started in
 * @returns {number | null} the mean elasticity over the seasons with at least `MIN_SEASON_WINDOWS` windows, a slope and a
 *   mean `y` above 0 (a season with mean 0 is skipped); null when no season qualifies
 */
export function withinSeasonSlope({ x, y, season }) {
    /** @type {Map<number, {x: number[], y: number[]}>} */
    const groups = new Map();
    for (let i = 0; i < x.length; i++) {
        const group = groups.get(season[i]) ?? { x: [], y: [] };
        group.x.push(x[i]);
        group.y.push(y[i]);
        groups.set(season[i], group);
    }
    const slopes = [];
    for (const group of groups.values()) {
        const slope = group.x.length < MIN_SEASON_WINDOWS ? null : olsSlope(group.x, group.y);
        const meanRate = mean(group.y);
        if (slope !== null && meanRate > 0) {
            slopes.push((slope * mean(group.x)) / meanRate);
        }
    }
    return slopes.length === 0 ? null : mean(slopes);
}

/**
 * Builds the windows between consecutive checkpoints: a window whose start had nobody alive has no per-agent rate and is
 * left out.
 * @param {Record<string, any>} scene the capacity scene
 * @param {'starved' | 'intake'} column the running total to difference
 * @returns {{x: number[], y: number[], season: number[]}} the windows, for `withinSeasonSlope`
 */
function windowsOf(scene, column) {
    const { log, rows } = scene;
    /** @type {{x: number[], y: number[], season: number[]}} */
    const windows = { x: [], y: [], season: [] };
    for (let row = 1; row < rows; row++) {
        const start = log.pop[row - 1];
        if (start > 0) {
            windows.x.push(start);
            windows.y.push((log[column][row] - log[column][row - 1]) / start);
            windows.season.push(log.season[row - 1]);
        }
    }
    return windows;
}

/**
 * @param {Record<string, any>} scene the capacity scene
 * @param {'starved' | 'intake'} column the running total to difference
 * @returns {import('./metrics-stats.js').MetricResult} the within-season elasticity of the column's per-agent rate
 */
function slopeResult(scene, column) {
    const slope = withinSeasonSlope(windowsOf(scene, column));
    return slope === null
        ? none(`no season with ${MIN_SEASON_WINDOWS} spans of varying population after burn-in`)
        : ok(slope);
}

/**
 * @param {Record<string, any>} scene the capacity scene
 * @returns {import('./metrics-stats.js').MetricRecord} the four capacity metrics
 */
export function capacityMetrics(scene) {
    const { log, rows } = scene;
    if (rows === 0) {
        const reason = none('no 1000-tick checkpoint after burn-in');
        return {
            'eval.cap_share': reason,
            'eval.food_standing_share': reason,
            'eval.density_starve_slope': reason,
            'eval.density_intake_slope': reason,
        };
    }
    let capped = 0;
    let standing = 0;
    for (let row = 0; row < rows; row++) {
        capped += log.pop[row] >= scene.capAt ? 1 : 0;
        standing += log.edible[row] / scene.maxFood;
    }
    return {
        'eval.cap_share': ok(capped / rows),
        'eval.food_standing_share': ok(standing / rows),
        'eval.density_starve_slope': slopeResult(scene, 'starved'),
        'eval.density_intake_slope': slopeResult(scene, 'intake'),
    };
}
