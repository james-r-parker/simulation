// The effect recipes: each inventory row of docs/designs/renderer-event-effects.md as a list of parts the effect pool
// spawns. A part names a curve, a count at the close band, a life, a size and reach in agent radii, how its instances
// spread, and a colour. `playRecipe` asks the budget how many of each part may spawn and writes them through one scratch
// record, so playing a recipe allocates nothing.

import { createPrng } from '../prng.js';
import { PALETTE } from './colors.js';
import { admitFx, countFor, createFxBudget, FAMILY, lifeFor, RANK } from './fx-budget.js';
import { CURVE } from './fx-curves.js';
import { spawnFx } from './fx-pool.js';

/**
 * @typedef {object} FxPart
 * @property {number} curve an `FX_CURVES` index
 * @property {number} count instances at the close band and tier 0
 * @property {number} life ticks; -1 takes the effect's own `life`
 * @property {number} size world size in agent radii
 * @property {number} [reach] how far it travels, in agent radii; -1 takes the effect's own `reach` in world units
 * @property {'ring' | 'heading' | 'random' | 'none'} [spread] `ring` evenly round, `heading` a fan ahead, `random`
 *   seeded angles, `none` the effect's own angle (default)
 * @property {string} [color] a `PALETTE` key; absent, the effect's own colour
 * @property {number} [gain] colour multiplier (default 1)
 * @property {number} [stretch] length over width along the angle (default 1)
 * @property {number} [delay] ticks after the effect's tick it starts
 * @property {number} [minPx] the least it is drawn across, device px (default 3)
 */

/**
 * @typedef {object} FxRecipe
 * @property {number} family a `FAMILY` index
 * @property {number} rank a `RANK` value
 * @property {readonly FxPart[]} parts
 */

/**
 * @param {number} family a `FAMILY` index
 * @param {number} rank a `RANK` value
 * @param {FxPart[]} parts the parts
 * @returns {Readonly<FxRecipe>} the recipe
 */
function recipe(family, rank, parts) {
    return Object.freeze({ family, rank, parts: Object.freeze(parts.map((p) => Object.freeze(p))) });
}

const C = CURVE;
const combat = (/** @type {FxPart[]} */ parts) => recipe(FAMILY.combat, RANK.kill, parts);
const feed = (/** @type {FxPart[]} */ parts) => recipe(FAMILY.feeding, RANK.eat, parts);
const court = (/** @type {number} */ rank, /** @type {FxPart[]} */ parts) => recipe(FAMILY.courtship, rank, parts);
const ghost = (/** @type {number} */ curve, /** @type {number} */ life) => ({ curve, count: 1, life, size: 1.1 });

/** Every recipe by name. */
export const FX_RECIPES = Object.freeze({
    biteJaw: recipe(FAMILY.combat, RANK.bite, [
        { curve: C.streak, count: 6, life: 12, size: 0.45, reach: 1.6, spread: 'ring', color: 'biteFlash', stretch: 3 },
    ]),
    biteMark: recipe(FAMILY.combat, RANK.bite, [
        { curve: C.crescent, count: 1, life: 24, size: 0.7, color: 'eatenFlash', gain: 1.2, minPx: 6 },
    ]),
    eaten: combat([
        { curve: C.flash, count: 1, life: 6, size: 1.4, color: 'eatenFlash', minPx: 8 },
        { curve: C.shard, count: 6, life: 30, size: 0.35, reach: 2.4, spread: 'ring', color: 'eatenFlash' },
        ghost(C.ghost, 20),
    ]),
    packKill: combat([
        { curve: C.ring, count: 1, life: 36, size: 4.5, color: 'huntRing', minPx: 12 },
        { curve: C.ring, count: 1, life: 36, size: 3.2, color: 'huntRing', delay: 6, minPx: 10 },
    ]),
    starved: combat([
        { curve: C.ghostSink, count: 1, life: 60, size: 1.1, reach: 1.2, color: 'coolWhite', gain: 0.35 },
        { curve: C.moteFall, count: 8, life: 60, size: 0.2, reach: 2, spread: 'random', color: 'coolWhite', gain: 0.4 },
    ]),
    oldAge: combat([
        { curve: C.ghostRise, count: 1, life: 90, size: 1.1, reach: 1.5, color: 'coolWhite', gain: 0.7 },
        { curve: C.moteRise, count: 6, life: 90, size: 0.2, reach: 3, spread: 'random', color: 'coolWhite', gain: 0.8 },
    ]),
    poisoned: combat([
        { curve: C.ghost, count: 1, life: 40, size: 1.1, color: 'toxin', gain: 0.6 },
        { curve: C.drop, count: 8, life: 45, size: 0.3, reach: 2.5, spread: 'random', color: 'toxin' },
    ]),
    trampled: combat([
        { curve: C.puffRing, count: 1, life: 30, size: 2.4, color: 'stampedeDust', gain: 40, minPx: 10 },
        { curve: C.ghostFlat, count: 1, life: 16, size: 1.1, stretch: 3, spread: 'random' },
    ]),
    disease: combat([
        { curve: C.spore, count: 10, life: 70, size: 0.3, reach: 2.6, spread: 'ring', color: 'infected' },
        ghost(C.ghost, 30),
    ]),
    collision: combat([
        { curve: C.streak, count: 3, life: 12, size: 0.3, reach: 1.2, spread: 'ring', color: 'coolWhite', gain: 0.5 },
    ]),
    died: combat([{ curve: C.moteOut, count: 10, life: 40, size: 0.2, reach: 2.4, spread: 'random' }]),
    eatPlant: feed([{ curve: C.crumbIn, count: 5, life: 10, size: 0.2, reach: -1, spread: 'heading', gain: 2.5 }]),
    eatMeat: feed([
        { curve: C.crumbIn, count: 5, life: 10, size: 0.2, reach: -1, spread: 'heading', color: 'meat' },
        { curve: C.crumbStay, count: 2, life: 20, size: 0.15, spread: 'random', color: 'meat', gain: 0.6 },
    ]),
    eatFungus: feed([{ curve: C.orbit, count: 5, life: 12, size: 0.2, reach: -1, spread: 'ring', gain: 2.5 }]),
    mateOrbit: court(RANK.mate, [
        { curve: C.orbit, count: 6, life: 30, size: 0.25, reach: -1, spread: 'ring', color: 'courtship' },
    ]),
    pregnant: court(RANK.mate, [{ curve: C.ringSlow, count: 1, life: 30, size: 2.2, color: 'courtship', gain: 0.8 }]),
    birthMate: court(RANK.birth, [
        { curve: C.ring, count: 1, life: 30, size: 3.4, gain: 0.6, minPx: 10 },
        { curve: C.moteOut, count: 6, life: 30, size: 0.2, reach: 1.6, spread: 'random' },
        { curve: C.sparkle, count: 4, life: 30, size: 0.35, reach: 1.5, spread: 'random', color: 'courtship' },
    ]),
    birthSplit: court(RANK.birth, [
        { curve: C.fission, count: 1, life: 20, size: 1.2, minPx: 8 },
        { curve: C.moteOut, count: 4, life: 24, size: 0.2, reach: 1.4, spread: 'ring' },
    ]),
    birthArrival: court(RANK.birth, [
        { curve: C.arrive, count: 8, life: 40, size: 0.25, reach: 5, spread: 'heading', color: 'arrival' },
        { curve: C.ring, count: 1, life: 30, size: 2, color: 'arrival', delay: 30, gain: 0.7, minPx: 8 },
    ]),
    alarm: recipe(FAMILY.calls, RANK.call, [
        { curve: C.chevron, count: 1, life: -1, size: 1.18, color: 'alarmRing', minPx: 16 },
        { curve: C.chevron, count: 1, life: -1, size: 1.18, color: 'alarmRing', delay: 8, minPx: 16 },
    ]),
    packCall: recipe(FAMILY.calls, RANK.call, [
        { curve: C.huntPulse, count: 1, life: -1, size: 1.18, color: 'huntRing', minPx: 16 },
        { curve: C.arc, count: 3, life: -1, size: 0.4, reach: -1, spread: 'heading', color: 'huntRing', minPx: 10 },
    ]),
    smoke: recipe(FAMILY.calls, RANK.call, [
        { curve: C.puffOut, count: 8, life: 30, size: 0.6, reach: 1.8, spread: 'ring', color: 'coolWhite', gain: 0.3 },
    ]),
    smokeBitten: recipe(FAMILY.calls, RANK.call, [
        { curve: C.crescent, count: 1, life: 30, size: 0.8, color: 'eatenFlash', minPx: 6 },
    ]),
    strain: recipe(FAMILY.sickness, RANK.sickness, [
        { curve: C.ringSlow, count: 1, life: 90, size: 6.9, color: 'infected', minPx: 16 },
    ]),
    stampede: recipe(FAMILY.herds, RANK.firstKill, [
        { curve: C.ringSlow, count: 1, life: 48, size: 14.7, color: 'stampedeDust', gain: 30, minPx: 20 },
        { curve: C.dust, count: 14, life: 48, size: 0.6, reach: 1.6, spread: 'ring', color: 'stampedeDust', gain: 30 },
    ]),
    pollinated: recipe(FAMILY.flora, RANK.mate, [
        { curve: C.ring, count: 1, life: 30, size: 3.4, minPx: 10 },
        { curve: C.sprout, count: 1, life: 40, size: 0.8, gain: 40, minPx: 8 },
    ]),
    toxicPip: feed([{ curve: C.pip, count: 1, life: 24, size: 0.45, color: 'toxin', minPx: 6 }]),
});

/** The recipe for each death cause name in `ready.layout.deathCauses`. */
export const DEATH_RECIPES = Object.freeze({
    STARVED: FX_RECIPES.starved,
    EATEN: FX_RECIPES.eaten,
    COLLISION: FX_RECIPES.collision,
    OLD_AGE: FX_RECIPES.oldAge,
    POISONED: FX_RECIPES.poisoned,
    TRAMPLED: FX_RECIPES.trampled,
    DISEASE: FX_RECIPES.disease,
});

/**
 * @typedef {object} FxAt where and when a recipe plays; the caller reuses one
 * @property {number} x
 * @property {number} y
 * @property {number} angle radians
 * @property {number} size the agent radius the parts scale by, world units
 * @property {number} tick
 * @property {ArrayLike<number>} rgb the effect's own colour
 * @property {number} [reach] world units, for a part whose reach is -1
 * @property {number} [life] ticks, for a part whose life is -1
 */

/**
 * @typedef {object} FxPlayer
 * @property {import('./fx-pool.js').FxPool} pool
 * @property {import('./fx-budget.js').FxBudget} budget
 * @property {import('../prng.js').Prng} prng scatter, the app's own generator
 * @property {import('./fx-pool.js').FxRecord} rec scratch record
 */

/**
 * @param {import('./fx-pool.js').FxPool} pool the pool to spawn into
 * @param {import('./fx-budget.js').FxBudget} [budget] the budget; a fresh one when absent
 * @param {number} [seed] the scatter seed
 * @returns {FxPlayer} a recipe player
 */
export function createFxPlayer(pool, budget = createFxBudget(), seed = 1) {
    const rec = { x: 0, y: 0, angle: 0, size: 0, r: 0, g: 0, b: 0, gain: 1, tick: 0, life: 1, curve: 0, seed: 0 };
    return { pool, budget, prng: createPrng(seed), rec: { ...rec, reach: 0, stretch: 1, minPx: 3 } };
}

/**
 * @param {FxPlayer} fx the player
 * @param {FxPart} part the part
 * @param {{k: number, n: number, turn: number}} where the instance's index, the count and the ring's turn
 * @param {number} angle the effect's angle
 * @returns {number} the instance's angle
 */
function angleOf(fx, part, { k, n, turn }, angle) {
    switch (part.spread) {
        case 'ring':
            return turn + (k * 2 * Math.PI) / n;
        case 'heading':
            return angle + (k - (n - 1) / 2) * 0.35;
        case 'random':
            return fx.prng.next() * 2 * Math.PI;
        default:
            return angle;
    }
}

/**
 * @param {FxPlayer} fx the player
 * @param {FxPart} part the part
 * @param {FxAt} at where and when
 * @returns {void}
 */
function setPart(fx, part, at) {
    const rec = fx.rec;
    const rgb = part.color === undefined ? at.rgb : PALETTE[part.color];
    const gain = part.gain ?? 1;
    rec.x = at.x;
    rec.y = at.y;
    rec.size = part.size * at.size;
    rec.reach = reachOf(part, at);
    rec.r = rgb[0] * gain;
    rec.g = rgb[1] * gain;
    rec.b = rgb[2] * gain;
    rec.gain = 1;
    rec.tick = at.tick + (part.delay ?? 0);
    rec.life = lifeFor(fx.budget, part.life === -1 ? (at.life ?? 1) : part.life);
    rec.curve = part.curve;
    rec.stretch = part.stretch ?? 1;
    rec.minPx = part.minPx ?? 3;
}

const WHERE = { k: 0, n: 0, turn: 0 };

/**
 * @param {FxPart} part the part
 * @param {FxAt} at where
 * @returns {number} the part's reach in world units
 */
function reachOf(part, at) {
    return part.reach === -1 ? (at.reach ?? 0) : (part.reach ?? 0) * at.size;
}

/**
 * Spawns a recipe's parts, each at the count the budget allows.
 * @param {FxPlayer} fx the player
 * @param {Readonly<FxRecipe>} r the recipe
 * @param {FxAt} at where and when
 * @returns {number} instances spawned
 */
export function playRecipe(fx, r, at) {
    let spawned = 0;
    for (const part of r.parts) {
        const n = admitFx(fx.budget, r, countFor(fx.budget, r.family, part.count), at);
        if (n === 0) {
            continue;
        }
        setPart(fx, part, at);
        WHERE.n = n;
        WHERE.turn = fx.prng.next() * 2 * Math.PI;
        for (let k = 0; k < n; k++) {
            WHERE.k = k;
            fx.rec.angle = angleOf(fx, part, WHERE, at.angle);
            fx.rec.seed = fx.prng.next();
            spawnFx(fx.pool, fx.rec);
        }
        spawned += n;
    }
    return spawned;
}
