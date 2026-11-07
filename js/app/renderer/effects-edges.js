// Effects driven by flag edges rather than effect records: an agent eating (crumbs of what it ate fly into its mouth,
// and it gulps). Each frame diffs the blended agents' flags; the meal is named by the nearest food in the snapshot
// before the one that showed it.

import { floraColor } from './flora-colors.js';
import { TWEEN } from './body-tweens.js';
import { atBody, tweenAt } from './effects-combat.js';
import { createFlagEdges, diffFlags, EDGE } from './flag-edges.js';
import { buildFoodGrid, createFoodGrid, FOOD_KIND, nearestFood } from './food-grid.js';
import { FX_RECIPES, playRecipe } from './fx-recipes.js';
import { playPregnant } from './effects-life.js';
import { CLIENT_KIND } from './client-kinds.js';
import { createBreaths, playBreaths } from './effects-weather.js';

/** How far from the mouth a meal is looked for, in eater radii, plus a margin in world units. */
export const MEAL_REACH = 2;
const MEAL_MARGIN = 40;
const MOUTH = 0.8;

/**
 * @typedef {object} EdgeState
 * @property {import('./flag-edges.js').FlagEdges} flags the flag edge state
 * @property {import('./food-grid.js').FoodGrid} prev food in the snapshot before the newest
 * @property {import('./food-grid.js').FoodGrid} fresh food in the newest snapshot
 * @property {import('../interpolate.js').Interpolated | null} agents the agents being diffed
 * @property {number} tick the playhead tick being played
 * @property {(edge: number, index: number) => void} emit the edge handler, made once
 * @property {Int32Array} breaths each slot's last breath period (`createBreaths`)
 */

/**
 * @param {import('./effects-player.js').EffectsPlayer} player the player the handler plays into
 * @param {Record<string, any>} info `ready.info`
 * @returns {EdgeState} the edge state
 */
export function createEdgeState(player, info) {
    const capacity = info.maxAgents ?? 1024;
    const food = { maxFood: info.maxFood ?? 1, worldWidth: info.worldWidth ?? 1, worldHeight: info.worldHeight ?? 1 };
    /** @type {EdgeState} */
    const state = {
        flags: createFlagEdges(capacity),
        prev: createFoodGrid(food),
        fresh: createFoodGrid(food),
        agents: null,
        tick: 0,
        emit: (edge, index) => onEdge(player, edge, index),
        breaths: createBreaths(capacity),
    };
    return state;
}

/**
 * @param {import('./effects-player.js').EffectsPlayer} player the player
 * @param {number} edge an `EDGE`
 * @param {number} index the agent's index in the agents being diffed
 * @returns {void}
 */
function onEdge(player, edge, index) {
    const agents = /** @type {import('../interpolate.js').Interpolated} */ (player.edges.agents);
    if (edge === EDGE.ATE) {
        playMeal(player, index);
        tellSink(player, agents, index, CLIENT_KIND.MEAL);
    } else if (edge === EDGE.PREGNANT_ON) {
        playPregnant(player, agents, index);
    } else {
        playSickness(player, agents, index, edge);
        tellSink(player, agents, index, SICK_KINDS[edge]);
    }
}

/** The client effect kind for each sickness edge, indexed by `EDGE`. */
const SICK_KINDS = Object.freeze([CLIENT_KIND.SICK, CLIENT_KIND.CURED, CLIENT_KIND.INFECTED, CLIENT_KIND.RECOVERED]);

/**
 * Tells the sink (the audio cues, the overlay) of an edge as a client effect record, reusing `player.effect`.
 * @param {import('./effects-player.js').EffectsPlayer} player the player
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @param {number} i the agent's index
 * @param {number} kind a `CLIENT_KIND`
 * @returns {void}
 */
function tellSink(player, agents, i, kind) {
    if (player.sink === null) {
        return;
    }
    const e = player.effect;
    e.kind = kind;
    e.tick = player.edges.tick;
    e.x = agents.x[i];
    e.y = agents.y[i];
    e.a = agents.genomeId[i];
    e.b = 0;
    e.c = agents.spec[i];
    e.d = agents.lineageId[i];
    player.sink(e);
}

/** The recipe for each sickness edge, indexed by `EDGE` (`SICK_ON` 0 to `INFECTED_OFF` 3). */
const SICK_RECIPES = Object.freeze([
    FX_RECIPES.sickOn,
    FX_RECIPES.sickOff,
    FX_RECIPES.infectedOn,
    FX_RECIPES.infectedOff,
]);

/**
 * Toxin sickness or a disease begins (bubbles, spores) or passes (a shake-off sparkle, an immune ring).
 * @param {import('./effects-player.js').EffectsPlayer} player the player
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @param {number} i the agent's index
 * @param {number} edge a sickness `EDGE`
 * @returns {void}
 */
function playSickness(player, agents, i, edge) {
    playRecipe(player.fx, SICK_RECIPES[edge], atBody(player, agents, i, player.edges.tick));
    if (edge === EDGE.SICK_OFF || edge === EDGE.INFECTED_OFF) {
        player.effect.tick = player.edges.tick;
        tweenAt(player, agents, i, TWEEN.SHAKE_OFF);
    }
}

/**
 * Names the meal by the nearest food and plays its crumbs into the eater's mouth, and a gulp.
 * @param {import('./effects-player.js').EffectsPlayer} player the player
 * @param {number} i the eater's index
 * @returns {void}
 */
function playMeal(player, i) {
    const { edges } = player;
    const agents = /** @type {import('../interpolate.js').Interpolated} */ (edges.agents);
    const size = agents.size[i];
    const mx = agents.x[i] + Math.cos(agents.angle[i]) * size * MOUTH;
    const my = agents.y[i] + Math.sin(agents.angle[i]) * size * MOUTH;
    const grid = edges.prev.count > 0 ? edges.prev : edges.fresh;
    const f = nearestFood(grid, mx, my, size * MEAL_REACH + MEAL_MARGIN);
    const at = player.at;
    at.x = mx;
    at.y = my;
    at.size = size;
    at.tick = edges.tick;
    at.angle = f < 0 ? agents.angle[i] : Math.atan2(grid.y[f] - my, grid.x[f] - mx);
    at.reach = f < 0 ? size : Math.hypot(grid.x[f] - mx, grid.y[f] - my);
    const kind = f < 0 ? FOOD_KIND.PLANT : grid.kind[f];
    at.rgb = floraColor(f < 0 ? 0 : grid.hue[f], player.rgb);
    const r =
        kind === FOOD_KIND.MEAT
            ? FX_RECIPES.eatMeat
            : kind === FOOD_KIND.FUNGUS
              ? FX_RECIPES.eatFungus
              : FX_RECIPES.eatPlant;
    playRecipe(player.fx, r, at);
    if (kind === FOOD_KIND.TOXIC) {
        playRecipe(player.fx, FX_RECIPES.toxicPip, at);
    }
    player.effect.tick = edges.tick;
    tweenAt(player, agents, i, TWEEN.GULP);
}

/**
 * Plays the effects of this frame's flag edges. When a new snapshot arrived, the food grids roll first.
 * @param {import('./effects-player.js').EffectsPlayer} player the player
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @param {{tick: number, u32: Uint32Array, f32: Float32Array} | null} snapshot the newest snapshot
 * @param {number} tick the playhead tick
 * @returns {void}
 */
export function playEdges(player, agents, snapshot, tick) {
    const { edges } = player;
    if (snapshot !== null && snapshot.tick !== edges.fresh.tick) {
        const older = edges.prev;
        edges.prev = edges.fresh;
        edges.fresh = older;
        buildFoodGrid(edges.fresh, snapshot);
    }
    edges.agents = agents;
    edges.tick = tick;
    diffFlags(edges.flags, agents, player.bits, edges.emit);
    playBreaths(player, agents, tick);
}
