// The effect demo (`?fxdemo=<family|all>`, with `&fxhold=<ticks>` to freeze it): pauses the world, frames its centre
// at the close zoom and plays every recipe of the family in its own grid cell, again each period, on the pool's own
// clock (the paused playhead does not move). `?fxstress=1` instead plays recipes at random spots in view at 60 a
// second through the budget, on a running world, to load the caps. Both are development tools.

import { moveCameraTo } from '../camera.js';
import { createPrng } from '../prng.js';
import { PALETTE } from './colors.js';
import { FAMILY_RATE, FX_FAMILIES } from './fx-budget.js';
import { FX_RECIPES, playRecipe } from './fx-recipes.js';

/** The demo replays every recipe this often, in ticks of its own clock. */
export const DEMO_PERIOD = 90;
/** A demo cell's side in world units, and the most the demo zooms in (device px per unit). */
export const DEMO_CELL = 150;
export const DEMO_ZOOM = 2;
/** Recipes the stress mode plays per second. */
export const STRESS_PER_S = 60;

/**
 * @param {string} family a family name or `all`
 * @returns {[string, import('./fx-recipes.js').FxRecipe][]} the recipes the demo plays, in table order
 */
export function demoRecipes(family) {
    const index = FX_FAMILIES.indexOf(family);
    return Object.entries(FX_RECIPES).filter(([, r]) => family === 'all' || r.family === index);
}

/**
 * @param {number} n cells
 * @returns {{cols: number, rows: number}} the grid's columns and rows, wider than tall
 */
export function demoShape(n) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.8)));
    return { cols, rows: Math.ceil(n / cols) };
}

/**
 * @param {number} n cells
 * @param {{width: number, height: number}} canvas the canvas in device px
 * @returns {number} the zoom that fits the whole grid in the canvas, at most `DEMO_ZOOM`
 */
export function demoZoom(n, canvas) {
    const { cols, rows } = demoShape(n);
    return Math.min(DEMO_ZOOM, canvas.width / ((cols + 0.5) * DEMO_CELL), canvas.height / ((rows + 0.5) * DEMO_CELL));
}

/**
 * @param {number} n cells
 * @param {{x: number, y: number}} centre the grid's centre in world units
 * @returns {{x: number, y: number}[]} each cell's centre, row by row
 */
export function demoGrid(n, centre) {
    const { cols, rows } = demoShape(n);
    return Array.from({ length: n }, (_, k) => ({
        x: centre.x + ((k % cols) - (cols - 1) / 2) * DEMO_CELL,
        y: centre.y - (Math.floor(k / cols) - (rows - 1) / 2) * DEMO_CELL,
    }));
}

/**
 * Fills the player's scratch `at` for a demo spot.
 * @param {import('./effects-player.js').EffectsPlayer} player the player
 * @param {{x: number, y: number, tick: number}} spot where and when
 * @returns {import('./fx-recipes.js').FxAt} the scratch `at`
 */
function spotAt(player, spot) {
    const at = player.at;
    at.x = spot.x;
    at.y = spot.y;
    at.angle = 0;
    at.size = 24;
    at.reach = 60;
    at.life = 40;
    at.tick = spot.tick;
    at.rgb = PALETTE.recover;
    return at;
}

/**
 * Plays one recipe at a spot outside the budget's caps (the demo shows every effect at once).
 * @param {import('./effects-player.js').EffectsPlayer} player the player
 * @param {import('./fx-recipes.js').FxRecipe} recipe the recipe
 * @param {{x: number, y: number, tick: number}} spot where and when
 * @returns {void}
 */
function playAt(player, recipe, spot) {
    const { budget } = player.fx;
    budget.spent = 0;
    budget.tokens.set(FAMILY_RATE);
    playRecipe(player.fx, recipe, spotAt(player, spot));
}

/**
 * @typedef {object} DemoState
 * @property {[string, import('./fx-recipes.js').FxRecipe][]} recipes
 * @property {{name: string, x: number, y: number}[]} cells
 * @property {import('../prng.js').Prng} prng
 * @property {boolean} started
 * @property {number} clock the demo's own tick count
 * @property {number} lastSpawn the clock at the last replay
 * @property {number} owed stress recipes owed this frame
 * @property {number | null} hold freeze the clock this many ticks after each replay
 * @property {{x: number, y: number, tick: number}} spot scratch
 */

/**
 * Stress mode: plays the recipes owed this frame at random spots in view, through the budget.
 * @param {DemoState} s the demo
 * @param {import('./scene.js').Frame} frame the frame
 * @param {any} player the effects player
 * @param {any} camera the view
 * @returns {void}
 */
function stressStep(s, frame, player, camera) {
    s.owed += (STRESS_PER_S * frame.dtMs) / 1000;
    const halfW = camera.canvas.width / (2 * camera.zoom);
    const halfH = camera.canvas.height / (2 * camera.zoom);
    for (; s.owed >= 1; s.owed -= 1) {
        const recipe = s.recipes[Math.floor(s.prng.next() * s.recipes.length)][1];
        s.spot.x = camera.x + (s.prng.next() * 2 - 1) * halfW;
        s.spot.y = camera.y + (s.prng.next() * 2 - 1) * halfH;
        s.spot.tick = frame.tick;
        playRecipe(player.fx, recipe, spotAt(player, s.spot));
    }
}

/**
 * Demo mode: on the first frame pauses the world and frames the grid; then replays every cell each period on the
 * pool's own clock, which freezes `hold` ticks after a replay when asked.
 * @param {DemoState} s the demo
 * @param {import('./scene.js').Frame} frame the frame
 * @param {{player: any, camera: any, client: any}} ctx the effects player, the view and the worker client
 * @returns {void}
 */
function demoStep(s, frame, { player, camera, client }) {
    if (!s.started) {
        s.started = true;
        client?.pause?.();
        const centre = { x: camera.world.width / 2, y: camera.world.height / 2 };
        moveCameraTo(camera, { ...centre, zoom: demoZoom(s.recipes.length, camera.canvas) }, true);
        demoGrid(s.recipes.length, centre).forEach((c, k) => s.cells.push({ name: s.recipes[k][0], x: c.x, y: c.y }));
    }
    if (s.clock - s.lastSpawn >= DEMO_PERIOD) {
        s.lastSpawn = s.clock;
        s.cells.forEach((c, k) => playAt(player, s.recipes[k][1], { x: c.x, y: c.y, tick: frame.tick + s.clock }));
    }
    const frozen = s.hold !== null && s.clock - s.lastSpawn >= s.hold;
    s.clock += frozen ? 0 : 1;
    player.fx.pool.clockOffset = s.clock;
}

/**
 * @param {{family: string | null, hold: number | null, stress: boolean}} options the URL's demo options
 * @returns {{update: (frame: import('./scene.js').Frame, ctx: {player: any, camera: any, client: any}) => void,
 *   cells: {name: string, x: number, y: number}[]} | null} the demo, or null when neither mode is asked for
 */
export function createFxDemo({ family, hold, stress }) {
    if (family === null && !stress) {
        return null;
    }
    /** @type {DemoState} */
    const s = {
        recipes: demoRecipes(family ?? 'all'),
        cells: [],
        prng: createPrng(17),
        started: false,
        clock: 0,
        lastSpawn: -Infinity,
        owed: 0,
        hold,
        spot: { x: 0, y: 0, tick: 0 },
    };
    return {
        cells: s.cells,
        update(frame, ctx) {
            if (ctx.player === null) {
                return;
            }
            if (stress) {
                stressStep(s, frame, ctx.player, ctx.camera);
            } else {
                demoStep(s, frame, ctx);
            }
        },
    };
}
