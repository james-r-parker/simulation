// The effects of the role budget (docs/designs/status-effects.md, "The calculator and the levels"): a level per effect on a
// one-slot body, composed as `liveOf` composes it. Each lane is its base times the factor of every effect at a level above 0,
// in registry order, read through the sim's own `effectFactor`, so the budget cannot disagree with the world about what a
// stack of `rallied` does. Only the effects that store stacks take a level: the ones read from the body (the temperature
// bands, the cooldowns) are what the budget already derives from the lanes and the start temperature. Pure.

import { LANES } from '../sim/body-lanes.js';
import { EFFECT_INDEX, EFFECT_LIST, SYSTEM, effectFactor } from '../sim/effects.js';

/**
 * The one-slot world the effects of `js/sim/effects.js` read: the spec's lane bases as lane arrays of one slot, at the start
 * temperature, so the budget reads the sim's own effect factors (the cold and heat bands on `maxThrust`, the cold and hot
 * ramps on the standing cost).
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {Record<string, number>} lane the spec's lane bases
 * @returns {import('../sim/world.js').World} the world, as far as those functions read it
 */
export function startWorld(config, lane) {
    const lanes = Object.fromEntries(Object.entries(lane).map(([name, value]) => [name, [value]]));
    const laneArrays = LANES.map((l) => lanes[l.name]);
    return /** @type {any} */ ({ config, lanes, laneArrays, temperature: [config.temperatureStart] });
}

/** The effects that take a level, by name: each stores stacks, up to its `maxStacks`. */
export const LEVEL_EFFECTS = Object.freeze(
    EFFECT_LIST.filter((effect) => effect.level === 'stacks').map((effect) => effect.name),
);

/**
 * @param {Readonly<Record<string, number>>} levels a level per effect name
 * @returns {void}
 * @throws {Error} on a name that is not an effect that stores stacks, or a level that is not a whole number from 0 to its
 *   `maxStacks`
 */
export function checkEffects(levels) {
    for (const [name, level] of Object.entries(levels)) {
        const effect = EFFECT_LIST.find((candidate) => candidate.name === name);
        if (effect === undefined || effect.level !== 'stacks') {
            throw new Error(`roleParams: "${name}" is not an effect with stacks (${LEVEL_EFFECTS.join(', ')})`);
        }
        if (!Number.isInteger(level) || level < 0 || level > /** @type {number} */ (effect.maxStacks)) {
            throw new Error(`roleParams: the level of ${name} must be a whole number from 0 to ${effect.maxStacks}`);
        }
    }
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {Record<string, number>} lane the spec's lane bases
 * @param {Readonly<Record<string, number>>} levels a level per effect name
 * @returns {import('../sim/world.js').World} the one-slot world with each level written into its stored stacks
 */
function levelWorld(config, lane, levels) {
    const world = /** @type {any} */ (startWorld(config, lane));
    SYSTEM.refreshConfig(world);
    world.effectStacks = SYSTEM.stored.map((effect) => Float64Array.of(levels[effect.name] ?? 0));
    return world;
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {Record<string, number>} lane the spec's lane bases (with the traits applied)
 * @param {Readonly<Record<string, number>> | undefined} levels a level per effect name; a name left out is at 0
 * @returns {Record<string, number>} the lanes with every effect at a level above 0 applied in registry order; `lane` itself
 *   when no level is above 0, so with every effect off the record is the one of today
 */
export function lanesWithEffects(config, lane, levels) {
    const on = EFFECT_LIST.filter((effect) => (levels?.[effect.name] ?? 0) > 0);
    if (levels === undefined || on.length === 0) {
        return lane;
    }
    const world = levelWorld(config, lane, levels);
    const live = { ...lane };
    for (const { name } of LANES) {
        for (const effect of on) {
            live[name] *= effectFactor(world, 0, EFFECT_INDEX[effect.name], name);
        }
    }
    return live;
}
