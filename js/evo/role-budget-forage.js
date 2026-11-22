// The foraging numbers of the role budget (docs/designs/role-budget.md, "Phase 4 steps"): the world's food geometry, the cost of
// a gait, the heat a body keeps while it walks or sits, the gait that goes furthest per unit of energy, and the three-gait meal
// cycle. Pure: it reads a config, a spec's `RoleParams` and the model options, and creates no world.

import { laneBases } from '../sim/body-lanes.js';
import { steadySpeed } from './role-budget-kinematics.js';
import { passiveFactorAt, startWorld } from './role-budget-params.js';

/**
 * @typedef {object} WorldNumbers the world the food and the births sit in
 * @property {number} area the world's area in px2
 * @property {number} patches `foodPatchCount`
 * @property {number} patchRadius `foodPatchRadius`
 * @property {number} maxFood the food cap
 * @property {number} backgroundShare the share of food that ignores the patches
 * @property {number} maxAgents the population cap
 */

/**
 * @typedef {object} Context one spec's numbers and the one-slot lane view the temperature functions read
 * @property {import('./role-budget-params.js').RoleParams} p the spec's numbers
 * @property {WorldNumbers} world the world
 * @property {import('../sim/world.js').World} thermal the one-slot world (`temperature[0]` is set by each call)
 * @property {{rate: number, max: number, ticks: number, recover: number}} cold the cold stack of `chilled`, rate 0 when it is off
 */

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {string} specName a specialisation name
 * @param {import('./role-budget-params.js').RoleParams} p the spec's numbers
 * @returns {Context} the context; the cold stack reads `coldStackRate`, `coldStackMax`, `coldStackTicks` and `coldRecoverTicks`
 *   where the config has them (status-effects.md T9) and is off otherwise
 */
export function contextOf(config, specName, p) {
    const c = /** @type {Record<string, any>} */ (config);
    return {
        p,
        thermal: startWorld(config, laneBases(config, specName)),
        cold: {
            rate: c.coldStackRate ?? 0,
            max: c.coldStackMax ?? 10,
            ticks: c.coldStackTicks ?? 60,
            recover: c.coldRecoverTicks ?? 15,
        },
        world: {
            area: config.worldWidth * config.worldHeight,
            patches: config.foodPatchCount,
            patchRadius: config.foodPatchRadius,
            maxFood: config.maxFood,
            backgroundShare: config.foodBackgroundShare,
            maxAgents: config.maxAgents,
        },
    };
}

/**
 * @param {WorldNumbers} world the world
 * @returns {number} the food items per px2 inside a patch if the cap `maxFood` is full: `maxFood x (1 - background) / (patches x pi x
 *   radius^2)`; an upper bound, since `maxFood` is a cap
 */
export function patchFoodDensity(world) {
    return (
        (world.maxFood * (1 - world.backgroundShare)) /
        (world.patches * Math.PI * world.patchRadius * world.patchRadius)
    );
}

/**
 * @param {Context} ctx the context
 * @param {number} temperature a body temperature
 * @returns {number} the factor on the passive and size terms at that temperature (the cold and hot ramps on `passiveLoss`)
 */
export function heatFactor(ctx, temperature) {
    ctx.thermal.temperature[0] = temperature;
    return passiveFactorAt(ctx.thermal);
}

/**
 * The energy `tickCost` takes in a tick at a steady speed with no turn and no sprint.
 * @param {Context} ctx the context
 * @param {{speed: number, energy: number, heat?: number, stacks?: number}} at the speed, the energy (it sets the size), the heat
 *   factor on the passive terms (1) and the cold stacks (0)
 * @returns {number} the energy lost in the tick
 */
export function gaitCost(ctx, { speed, energy, heat = 1, stacks = 0 }) {
    const { cost, sizing } = ctx.p;
    const size = Math.max(sizing.min, sizing.base + energy / sizing.perEnergy);
    // `chilled` scales the `passiveLoss` lane alone (the size term stays), the temperature ramps scale both: tickCost in js/sim/energy.js
    const standing = (cost.passive * (1 + ctx.cold.rate * stacks) + cost.size * cost.standingMult * size) * heat;
    return (standing + cost.move * speed * speed) * cost.drain * cost.juvenile + cost.upkeep;
}

/**
 * The gait that goes furthest on a unit of energy: cost is `A + B speed^2` (the standing terms and the movement term), so the
 * energy per px is least at `sqrt(A / B)`, capped at the cruise cap (a body whose movement is free walks at it). Read at the heat factor 1 and the energy given.
 * @param {Context} ctx the context
 * @param {number} energy the energy it holds
 * @returns {number} the speed in px a tick
 */
export function bestRangeSpeed(ctx, energy) {
    const { cost, cap } = ctx.p;
    const standing = gaitCost(ctx, { speed: 0, energy });
    const move = cost.move * cost.drain * cost.juvenile;
    return Math.min(cap.cruise, Math.sqrt(standing / move));
}

/**
 * The cold stack's clock as `stepChilled` (js/sim/effect-chilled.js) keeps it, signed: above 0 the ticks under the band, below 0
 * the ticks back in it with stacks left to lose, and 0 while warm with none; it restarts at 0 when the body crosses the edge.
 * @param {Context} ctx the context
 * @param {{stacks: number, clock: number, cold: boolean}} at the stacks, the signed clock and whether the body is under the
 *   optimal band
 * @returns {{stacks: number, clock: number}} the cold stack a tick later (unchanged and at 0 with the effect off)
 */
export function coldStep(ctx, { stacks, clock, cold }) {
    if (ctx.cold.rate === 0) {
        return { stacks: 0, clock: 0 };
    }
    if (cold) {
        const next = clock < 0 ? 1 : clock + 1;
        return next >= ctx.cold.ticks
            ? { stacks: Math.min(ctx.cold.max, stacks + 1), clock: 0 }
            : { stacks, clock: next };
    }
    if (stacks === 0) {
        return { stacks, clock: 0 };
    }
    const next = clock > 0 ? -1 : clock - 1;
    return -next >= ctx.cold.recover ? { stacks: stacks - 1, clock: 0 } : { stacks, clock: next };
}

/**
 * Walks a body at a steady speed (or sits, at 0) until its energy is gone: each tick the temperature gains `min(speed / maxVelocity,
 * speedCap) x gainMove`, loses `lossPassive x seasonLoss`, is held from 0 to `max`, and the tick's cost is taken at the new
 * temperature's `passiveMultiplier`, as `applyCosts` orders it; with the cold stack on, a stack comes every `ticks` ticks under
 * `optimalMin` and goes every `recover` ticks above it.
 * @param {Context} ctx the context
 * @param {{energy: number, speed: number, limit?: number}} start the energy, the speed held and the most ticks to count
 *   (`maxAgeTicks`)
 * @returns {{ticks: number, distance: number, heat: number}} the ticks until the energy is gone (or the limit), the distance
 *   walked and the lowest temperature reached
 */
export function lifeOf(ctx, { energy, speed, limit }) {
    const { heat, cap } = ctx.p;
    const last = limit ?? ctx.p.repro.maxAgeTicks;
    const gain = Math.min(speed / cap.cruise, heat.speedCap) * heat.gainMove;
    let temperature = heat.start;
    let left = energy;
    let cold = { stacks: 0, clock: 0 };
    let lowest = temperature;
    let ticks = 0;
    while (left > 0 && ticks < last) {
        temperature = Math.min(heat.max, Math.max(0, temperature + gain - heat.lossPassive * heat.seasonLoss));
        lowest = Math.min(lowest, temperature);
        cold = coldStep(ctx, { ...cold, cold: temperature < heat.optimalMin });
        left -= gaitCost(ctx, { speed, energy: left, heat: heatFactor(ctx, temperature), stacks: cold.stacks });
        ticks += 1;
    }
    return { ticks, distance: ticks * speed, heat: lowest };
}

/**
 * @param {import('./role-budget-params.js').RoleParams} p the spec's numbers
 * @returns {{graze: number, handling: number}} the steady speeds of the two gaits of a body holding `BITE`: the grazing gait, and
 *   the handling gait (graze and handling both scale the thrust, as `thrustOf` in js/sim/physics.js does)
 */
export function eatingSpeeds(p) {
    const ratio = p.thrust.graze / p.thrust.cruise;
    const at = (/** @type {number} */ thrust) => Math.min(p.cap.cruise, steadySpeed(thrust, p.damping));
    return { graze: at(p.thrust.graze), handling: at(p.thrust.handling * ratio) };
}

/**
 * The meal cycle of a body in a patch, from the sim's rules. A meal starts one `ateTimer`, which holds the body at the handling
 * gait for `handlingTicks` and bars eating for `digestTicks` (the two windows overlap, so the next meal is `digestTicks` away at
 * the soonest). Each meal eats an item, so the body lives on the items its path newly covers: it covers a strip of
 * `sweepWidth = 2 (size + foodRadius)` and meets one item per `L = 1 / (density x sweepWidth)` px of path (the plan's `find =
 * density x sweepWidth x speed` items a tick). The cycle is the longer of the digest and the ticks it takes to walk `L` at the
 * handling gait for `handlingTicks` and the grazing speed after. (A body also starts with the 3 items under it at the defaults;
 * a grid scene eats those in its first meals, then settles to this rate, within 20%.) The income is `foodEnergy x plantFoodValue`.
 * @param {Context} ctx the context
 * @param {{density: number, energy?: number}} options the food density and the energy the costs and the size are read at (the
 *   body's start energy)
 * @returns {{find: number, pathPerMeal: number, searchTicks: number, handleTicks: number, grazeTicks: number, cycleTicks: number,
 *   income: number, net: number, netPerMeal: number, density: number}} the cycle: the grazing find rate, the path a meal takes, the
 *   ticks of the cycle past the digest, the ticks at each gait, the income, the net energy a tick and a meal
 */
export function forageCycle(ctx, { density, energy = ctx.p.energy }) {
    const { p } = ctx;
    const speeds = eatingSpeeds(p);
    const size = Math.max(p.sizing.min, p.sizing.base + energy / p.sizing.perEnergy);
    const sweep = 2 * (size + p.feed.foodRadius);
    const pathPerMeal = 1 / (density * sweep);
    const { digestTicks: digest, handlingTicks: handling } = p.feed;
    const slowPath = speeds.handling * handling;
    const walk =
        pathPerMeal <= slowPath ? pathPerMeal / speeds.handling : handling + (pathPerMeal - slowPath) / speeds.graze;
    const cycleTicks = Math.max(digest, walk);
    const handleTicks = Math.min(cycleTicks, Math.max(handling, digest));
    const grazeTicks = cycleTicks - handleTicks;
    const income = p.feed.foodEnergy * p.feed.plantValue;
    const spent =
        handleTicks * gaitCost(ctx, { speed: speeds.handling, energy }) +
        grazeTicks * gaitCost(ctx, { speed: speeds.graze, energy });
    return {
        find: density * sweep * speeds.graze,
        pathPerMeal,
        searchTicks: cycleTicks - digest,
        handleTicks,
        grazeTicks,
        cycleTicks,
        income,
        net: (income - spent) / cycleTicks,
        netPerMeal: income - spent,
        density,
    };
}

/**
 * @param {import('./role-budget-params.js').RoleParams} p the spec's numbers
 * @returns {number} the energy a body must be strictly above to split: `max(splitMin, birthReserve / (1 - childShare))`, since a
 *   split gives `energy x childShare` and must leave `birthReserve`
 */
export function splitGate(p) {
    return Math.max(p.repro.splitMin, p.repro.birthReserve / (1 - p.repro.childShare));
}
