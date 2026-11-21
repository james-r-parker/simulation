// Reading a slot's effect levels once for a group of lanes (docs/designs/status-effects.md, Phase 5): `readGroup` reads
// every effect that a rule of the group's lanes names at the current config (`world.laneRules`) once, into the group's level
// row, and `liveIn` folds a lane of the group from that row. The turn and thrust of a slot (`MOTION`, in `actAll`) and the
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

/**
 * @typedef {object} Group what a world reads for one group at its config
 * @property {Int32Array} effects the effects a rule of the group's lanes names, outside the band, in registry order
 * @property {Int32Array} band where each band effect sits in the list (`BAND_EFFECTS` order), -1 for one the group does not
 *   read; all -1 when the group reads none
 * @property {boolean} banded whether the group reads any band effect
 * @property {Float64Array} levels each effect's level as the last `readGroup` left it, by effect index
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
        return { effects, band, banded: band.some((at) => at >= 0), levels: new Float64Array(list.length) };
    });
}

/**
 * Reads, once, the level of every effect the group's rules name for the slot, into the group's level row.
 * @param {(world: any, slot: number, effect: number) => void} dispatch the system's level dispatch
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {number} code a `GROUP` code
 * @returns {void}
 */
export function readGroup(dispatch, world, slot, code) {
    const group = /** @type {Group} */ (world.effectGroups[code]);
    const { effects, levels, band } = group;
    for (let k = 0; k < effects.length; k++) {
        dispatch(world, slot, effects[k]);
        levels[effects[k]] = LEVEL[0];
    }
    if (group.banded) {
        bandLevels(world, slot);
        for (let k = 0; k < band.length; k++) {
            if (band[k] >= 0) {
                levels[band[k]] = BAND[k];
            }
        }
    }
}

/**
 * @param {any} world the world
 * @param {number} slot the agent slot, whose group was read last by `readGroup`
 * @param {number} code the `GROUP` code the lane belongs to
 * @param {number} lane a lane's index, one of the group's lanes
 * @returns {number} the lane at the slot times the factor of each of its rules in registry order, from the group's levels;
 *   a rule at level 0 multiplies by exactly 1 and is skipped
 */
export function liveIn(world, slot, code, lane) {
    const levels = world.effectGroups[code].levels;
    const rules = world.laneRules[lane];
    RESULT[0] = world.laneArrays[lane][slot];
    for (let k = 0; rules !== undefined && k < rules.length; k++) {
        LEVEL[0] = levels[rules[k].effect];
        if (LEVEL[0] !== 0) {
            ruleFactor(world, slot, rules[k]);
            RESULT[0] *= NUMBER[0];
        }
    }
    return RESULT[0];
}
