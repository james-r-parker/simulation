// The numbers an effect rule reads (docs/designs/status-effects.md, "The registry"), compiled once so a read is an array
// index, not a string lookup: a literal, a lane (an index into `world.laneArrays`) or a config key (an index into
// `world.effectConfig`, filled when the world is built). Pure arithmetic: no RNG, no allocation per read.

import { LANES } from './body-lanes.js';

/**
 * A number a rule reads: a literal, a config key or lane name, or `{key, scale, offset}` for `scale x value + offset`
 * (a ramp's `temperaturePassiveLossFactor - 1`, a drag's `-fatSlowShare`).
 * @typedef {number | string | {key: string, scale?: number, offset?: number}} Ref
 */

/** @typedef {{kind: number, value: number, index: number, scale: number, offset: number}} Compiled */

/** What a compiled reference reads. */
export const REF = Object.freeze({ LITERAL: 0, LANE: 1, CONFIG: 2 });

/** A lane's index by name: the position in `LANES`, and in `world.laneArrays`. */
export const LANE_ID = Object.freeze(Object.fromEntries(LANES.map((lane, i) => [lane.name, i])));

/**
 * @param {Ref} ref a reference
 * @param {string[]} configKeys the config keys the system reads, in the order of `world.effectConfig`; a key not yet
 *   listed is added
 * @returns {Compiled} the reference in the form `numberOf` reads: a lane name reads the lane, any other key the config
 */
export function compileRef(ref, configKeys) {
    if (typeof ref === 'number') {
        return { kind: REF.LITERAL, value: ref, index: 0, scale: 1, offset: 0 };
    }
    const { key, scale = 1, offset = 0 } = typeof ref === 'string' ? { key: ref } : ref;
    if (key in LANE_ID) {
        return { kind: REF.LANE, value: 0, index: LANE_ID[key], scale, offset };
    }
    if (!configKeys.includes(key)) {
        configKeys.push(key);
    }
    return { kind: REF.CONFIG, value: 0, index: configKeys.indexOf(key), scale, offset };
}

/**
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {Compiled} ref a compiled reference
 * @returns {number} its value for the slot: a literal, or `scale x (the lane at the slot, or the config key) + offset`
 */
export function numberOf(world, slot, ref) {
    if (ref.kind === REF.LITERAL) {
        return ref.value;
    }
    const value = ref.kind === REF.LANE ? world.laneArrays[ref.index][slot] : world.effectConfig[ref.index];
    return ref.scale * value + ref.offset;
}
