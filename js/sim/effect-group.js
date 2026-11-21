// Reading a slot's effect levels once for a group of lanes (docs/designs/status-effects.md, Phase 5): `foldGroup` reads
// every effect that a rule of the group's lanes names at the current config (`world.laneRules`) once, into the group's level
// row, and folds every lane of the group from it in the same pass, its base read inside it; `liveIn` reads a folded lane. The turn and thrust of a slot (`MOTION`, in `actAll`) and the
// six cost lanes of `tickCost` (`COST`) each read their levels once, where each lane read them again. The temperature
// effects are read by one band read of `temperature[slot]` and its lanes. The levels are the same numbers read from the
// same state at the same point of the tick, multiplied in the same order, so a lane folds to the bits `liveOf` gives.
// Allocates nothing per call; no RNG.

import { LANE_ID, LEVEL, NUMBER, RESULT } from './effect-refs.js';
import { ruleFactor } from './effect-factor.js';
import { BAND, BAND_EFFECTS, bandLevels } from './effect-levels.js';

/** The groups of lanes read together. */
export const GROUP = Object.freeze({ MOTION: 0, COST: 1 });

/** Each group's lanes, by `GROUP` code. */
export const GROUP_LANES = Object.freeze([
    Object.freeze([LANE_ID.maxTurn, LANE_ID.maxThrust]),
    Object.freeze(
        ['passiveLoss', 'sizeEnergyLoss', 'visionCost', 'turnCost', 'movementCost', 'sprintCost'].map(
            (name) => /** @type {Record<string, number>} */ (LANE_ID)[name],
        ),
    ),
]);

/** Each grouped lane's position in its group's `live` row, by lane index; -1 for a lane in no group. */
const LANE_AT = new Int32Array(Math.max(...Object.values(LANE_ID)) + 1).fill(-1);
for (const lanes of GROUP_LANES) {
    lanes.forEach((lane, at) => {
        LANE_AT[lane] = at;
    });
}

/**
 * @typedef {object} Group what a world reads for one group at its config
 * @property {Int32Array} effects the effects a rule of the group's lanes names, outside the band, in registry order
 * @property {Int32Array} band where each band effect sits in the list (`BAND_EFFECTS` order), -1 for one the group does not
 *   read; all -1 when the group reads none
 * @property {boolean} banded whether the group reads any band effect
 * @property {Float64Array} levels each effect's level as the last `foldGroup` left it, by effect index
 * @property {Int32Array} lanes the group's lanes (`GROUP_LANES`)
 * @property {Array<{effect: number}[]>} rules each lane's active rules, in the order of `lanes`
 * @property {Float64Array} live each lane with the group's effects applied, as the last `foldGroup` left it
 */

/**
 * @param {readonly {name: string}[]} list the effects
 * @param {Array<{effect: number}[] | undefined>} laneRules each lane's active rules (`world.laneRules`)
 * @returns {Group[]} each group's effects at this config, by `GROUP` code
 */
export function compileGroups(list, laneRules) {
    const bandAt = BAND_EFFECTS.map((name) => list.findIndex((effect) => effect.name === name));
    return GROUP_LANES.map((lanes) => {
        const named = new Set(lanes.flatMap((lane) => (laneRules[lane] ?? []).map((rule) => rule.effect)));
        const band = Int32Array.from(bandAt, (at) => (named.has(at) ? at : -1));
        const effects = Int32Array.from([...named].filter((e) => !bandAt.includes(e)).sort((a, b) => a - b));
        return {
            effects,
            band,
            banded: band.some((at) => at >= 0),
            levels: new Float64Array(list.length),
            lanes: Int32Array.from(lanes),
            rules: lanes.map((lane) => laneRules[lane] ?? []),
            live: new Float64Array(lanes.length),
        };
    });
}

/**
 * Reads, once, the level of every effect the group's rules name for the slot, into the group's level row.
 * @param {(world: any, slot: number, effect: number) => void} dispatch the system's level dispatch
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {Group} group the group
 * @returns {number} 1 when any of the levels is not 0, else 0
 */
function readLevels(dispatch, world, slot, group) {
    const { effects, levels, band } = group;
    let any = 0;
    for (let k = 0; k < effects.length; k++) {
        dispatch(world, slot, effects[k]);
        levels[effects[k]] = LEVEL[0];
        any |= LEVEL[0] !== 0 ? 1 : 0;
    }
    if (group.banded) {
        bandLevels(world, slot);
        for (let k = 0; k < band.length; k++) {
            if (band[k] >= 0) {
                levels[band[k]] = BAND[k];
                any |= BAND[k] !== 0 ? 1 : 0;
            }
        }
    }
    return any;
}

/**
 * Multiplies `RESULT[0]` by the factor of each rule in registry order, from the group's levels; a rule at level 0
 * multiplies by exactly 1 and is skipped.
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {Float64Array} levels the group's levels
 * @param {any[]} rules one lane's active rules
 * @returns {void}
 */
function foldRules(world, slot, levels, rules) {
    for (let k = 0; k < rules.length; k++) {
        LEVEL[0] = levels[rules[k].effect];
        if (LEVEL[0] !== 0) {
            ruleFactor(world, slot, rules[k]);
            RESULT[0] *= NUMBER[0];
        }
    }
}

/**
 * Folds every lane of a group for the slot in one pass, into the group's `live` row: each effect level the group's rules
 * name is read once, then each lane starts at its value at the slot and is multiplied by its rules in registry order. With
 * every level 0 each lane is its value, since a rule at level 0 multiplies by exactly 1.
 * @param {(world: any, slot: number, effect: number) => void} dispatch the system's level dispatch
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {number} code a `GROUP` code
 * @returns {void}
 */
export function foldGroup(dispatch, world, slot, code) {
    const group = /** @type {Group} */ (world.effectGroups[code]);
    const any = readLevels(dispatch, world, slot, group);
    const { lanes, rules, live, levels } = group;
    const arrays = world.laneArrays;
    for (let k = 0; k < lanes.length; k++) {
        RESULT[0] = arrays[lanes[k]][slot];
        if (any !== 0) {
            foldRules(world, slot, levels, rules[k]);
        }
        live[k] = RESULT[0];
    }
}

/**
 * @param {any} world the world
 * @param {number} _slot the agent slot, whose group `foldGroup` folded last
 * @param {number} code the `GROUP` code the lane belongs to
 * @param {number} lane a lane's index, one of the group's lanes
 * @returns {number} the lane at the slot with the group's effects applied, as the last fold left it: the bits `liveOf`
 *   gives
 */
export function liveIn(world, _slot, code, lane) {
    return world.effectGroups[code].live[LANE_AT[lane]];
}
