// What `createEffects` (effects.js) compiles a list of effects into: each lane's rules in registry order, each gate's closing
// effects and each effect's follow-on, with the gates and the lane lookup they share. Pure: no world, no RNG.

import { LANE_ID, compileRef } from './effect-refs.js';

/**
 * The gates an effect can close, by name. `ALARM` and `HUNT` are the two halves of the plan's `call` gate: an alarm
 * and a hunt call each wait for their own timer, so one running timer must not close the other call.
 */
export const GATE = Object.freeze({ EAT: 0, MATE: 1, SPLIT: 2, BITE: 3, ALARM: 4, HUNT: 5, SMOKE: 6 });

/** The number of gates. */
export const GATE_COUNT = Object.keys(GATE).length;

/**
 * @param {string} effect the effect's name, for the message
 * @param {string} lane a lane's name
 * @returns {number} the lane's index
 * @throws {Error} for a lane that is not in the catalogue
 */
export function laneIdOf(effect, lane) {
    const id = /** @type {Record<string, number>} */ (LANE_ID)[lane];
    if (id === undefined) {
        throw new Error(`effects: ${effect} names ${lane}, which is not a lane`);
    }
    return id;
}

/**
 * @param {readonly Effect[]} list the effects
 * @param {{reads: Array<(world: any, slot: number) => number | void>, shares: boolean[], configKeys: string[]}} ctx the level readers, which of them
 *   leave a share, and the config keys compiled so far
 * @returns {Rule[][]} each lane's rules in registry order, by lane index
 * @throws {Error} for a lane that is not in the catalogue, or a scale that has neither form or both, or a table whose
 *   level 0 is not 1
 */
export function compileRules(list, ctx) {
    /** @type {Rule[][]} */
    const rules = [];
    list.forEach((effect, index) => {
        for (const scale of effect.scales) {
            const id = laneIdOf(effect.name, scale.lane);
            if ((scale.perStack === undefined) === (scale.levels === undefined)) {
                throw new Error(`effects: ${effect.name} scales ${scale.lane} by perStack or levels, exactly one`);
            }
            if (scale.levels !== undefined && scale.levels[0] !== 1) {
                throw new Error(`effects: ${effect.name} scales ${scale.lane} with a table whose level 0 is not 1`);
            }
            const per = scale.perStack === undefined ? null : compileRef(scale.perStack, ctx.configKeys);
            const levels = scale.levels === undefined ? null : scale.levels.map((r) => compileRef(r, ctx.configKeys));
            const by = scale.by === undefined ? -1 : laneIdOf(effect.name, scale.by);
            (rules[id] ??= []).push({
                read: ctx.reads[index],
                share: ctx.shares[index],
                effect: index,
                per,
                levels,
                by,
                power: scale.power === true,
            });
        }
    });
    return rules;
}

/**
 * @param {readonly Effect[]} list the effects
 * @returns {number[]} each effect's follow-on effect (raised as its `ticks` timer ends), -1 for none
 * @throws {Error} for a follow-on that is not listed, or from an effect that does not fade by a `ticks` timer
 */
export function compileThen(list) {
    const names = list.map((effect) => effect.name);
    return list.map((effect) => {
        const at = effect.then === undefined ? -1 : names.indexOf(effect.then);
        if (effect.then !== undefined && (at < 0 || effect.fades?.kind !== 'ticks')) {
            throw new Error(
                `effects: ${effect.name} hands over to ${effect.then}, which needs a \`ticks\` fade and a listed effect`,
            );
        }
        return at;
    });
}

/**
 * @param {readonly Effect[]} list the effects
 * @returns {number[][]} for each gate, the indices of the effects that close it, in registry order
 * @throws {Error} for a gate name that `GATE` lacks
 */
export function compileGates(list) {
    /** @type {number[][]} */
    const gates = Array.from({ length: GATE_COUNT }, () => []);
    list.forEach((effect, index) => {
        for (const name of effect.gates) {
            const gate = /** @type {Record<string, number>} */ (GATE)[name];
            if (gate === undefined) {
                throw new Error(`effects: ${effect.name} closes ${name}, which is not a gate`);
            }
            gates[gate].push(index);
        }
    });
    return gates;
}

/** @typedef {import('./effect-refs.js').Compiled} Compiled */
/** @typedef {import('./effects.js').Effect} Effect */
/** @typedef {import('./effects.js').Rule} Rule */
