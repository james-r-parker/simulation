// The cross-check of the Phase 2 budget against the sim (docs/designs/role-budget.md, "Cross-check against the sim"): the
// defence and the two smoke formulas played beside their scripted scenes, each reading with its tolerance. The scene and the
// formula start from the same state, so a difference is the formula's.

import { roleParams } from './role-budget-params.js';
import { defenceTimeline } from './role-budget-defence.js';
import { defenderSmokeGeometry, smokeCell } from './role-budget-smoke.js';
import { playDefence } from './role-scenes-defence.js';
import { playDefenderSmoke, playSmoke } from './role-scenes-smoke.js';

/** The heading the defender of the smoke scenes stands with: facing the caller's side, the heading it walks in with. */
const STANDING = -Math.PI / 2;

/**
 * @typedef {object} DefenceReading one formula reading beside the scene's
 * @property {string} row the row it belongs to
 * @property {string} what the reading
 * @property {number | boolean | null} formula the formula's value
 * @property {number | boolean | null} scene the scene's value
 * @property {string} tolerance the tolerance, in words
 * @property {boolean} drift whether it is outside it
 */

/**
 * @param {string} row the row
 * @param {string} what the reading
 * @param {[number | null, number | null]} values the formula's and the scene's numbers
 * @param {{within: number, unit: string}} [exact] the tolerance when it is a fixed amount, else ten percent of the scene's
 *   value, at least 2 ticks
 * @returns {DefenceReading} the reading
 */
function ticksReading(row, what, [formula, scene], exact) {
    const allowed = exact === undefined ? Math.max(2, 0.1 * Math.abs(scene ?? 0)) : exact.within;
    const drift = formula === null || scene === null ? formula !== scene : Math.abs(formula - scene) > allowed;
    const tolerance = exact === undefined ? '10% or 2 ticks' : `${exact.within} ${exact.unit}`;
    return { row, what, formula, scene, tolerance, drift };
}

/** @param {number} within the ticks @returns {{within: number, unit: string}} a fixed tolerance in ticks */
const inTicks = (within) => ({ within, unit: 'ticks' });

/**
 * @param {string} row the row
 * @param {string} what the reading
 * @param {[boolean, boolean]} values the formula's and the scene's answers
 * @returns {DefenceReading} the reading: the two must agree
 */
function signReading(row, what, [formula, scene]) {
    return { row, what, formula, scene, tolerance: 'agree', drift: formula !== scene };
}

/**
 * The defence: the call, the hearing and the first touch against the scene, and whether the defender lands its power before
 * the kill.
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @returns {DefenceReading[]} the readings
 */
function defenceReadings(config, model) {
    const [hunter, caller, defender] = ['predator', 'forager', 'defender'].map((s) => roleParams(config, s));
    const options = { reaction: model.reactionTicks, threshold: model.hearThreshold, side: model.defenderGap };
    const shoves = defender.repel.energy > 0 || defender.repel.impulse > 0;
    const run = defenceTimeline(hunter, caller, defender, options);
    const alone = defenceTimeline(hunter, caller, defender, { ...options, absent: true });
    const scene = playDefence(config, options);
    const lone = playDefence(config, { ...options, absent: true });
    const row = 'defender:predator';
    const arrival = shoves ? run.repelTick : run.interceptTick;
    const readings = [
        ticksReading(row, 'alarm tick', [run.alarmTick, scene.ticks.alarmTick], inTicks(0)),
        ticksReading(row, 'heard tick', [run.heardTick, scene.ticks.heardTick], inTicks(0)),
        ticksReading(row, 'defender moves', [run.startTick, scene.ticks.startTick], inTicks(0)),
        ticksReading(row, 'kill tick, no defender', [alone.killTick, lone.ticks.killTick], inTicks(2)),
        ticksReading(row, 'defender touches the hunter', [run.interceptTick, scene.ticks.interceptTick]),
        signReading(row, 'defender lands its power before the kill', [
            arrival !== null && alone.killTick !== null && arrival < alone.killTick,
            scene.outcome.defenderArrivedFirst,
        ]),
    ];
    if (!shoves) {
        readings.push(ticksReading(row, 'kill tick', [run.killTick, scene.ticks.killTick]));
    }
    return readings;
}

/**
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @returns {DefenceReading[]} the prey's smoke: where the cloud lies, how long the hunter is blind, how long the cloud lives,
 *   and whether the prey is out of view when the cover ends
 */
function preyReadings(config, model) {
    const [hunter, prey] = ['predator', 'forager'].map((s) => roleParams(config, s));
    const formula = smokeCell(hunter, prey, model);
    const scene = playSmoke(config, { gap: model.smokeGap });
    const row = 'smoke:prey';
    return [
        ticksReading(row, 'hidden ticks', [formula.hiddenTicks, scene.ticks.hiddenTicks]),
        ticksReading(row, 'cloud centre, px ahead of the hunter', [formula.cloud.x, scene.outcome.cloud.x], PX),
        ticksReading(row, 'cloud life', [prey.smoke.ticks - 1, scene.ticks.cloudLife], inTicks(0)),
        signReading(row, 'out of view when the cover ends', [
            formula.hiddenTicks >= formula.escapeNeed,
            scene.outcome.escaped,
        ]),
    ];
}

/** The tolerance of a cloud's position, in px. */
const PX = { within: 1, unit: 'px' };

/**
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @returns {DefenceReading[]} the defender's smoke: when it releases, where the cloud lies, how long the hunter is blind,
 *   whether the caller is out of view when the cover ends, and that a defender facing the hunter is refused
 */
function defenderReadings(config, model) {
    const bodies = ['predator', 'forager', 'defender'].map((s) => roleParams(config, s));
    const play = { reaction: model.reactionTicks, threshold: model.hearThreshold, standing: STANDING };
    const geometry = defenderSmokeGeometry(bodies, { ...model, standing: STANDING });
    const scene = playDefenderSmoke(config, play);
    const refused = defenderSmokeGeometry(bodies, { ...model, standing: STANDING, facing: 'hunter' });
    const turned = playDefenderSmoke(config, { ...play, facing: 'hunter' });
    const row = 'smoke:defender';
    const early = geometry.slackDefender !== null && geometry.slackDefender >= 0;
    const readings = [
        ticksReading(row, 'release tick', [geometry.releaseTick, scene.ticks.releaseTick]),
        signReading(row, 'a defender facing the hunter is refused: the cloud is not between', [
            refused.refused,
            !turned.outcome.between,
        ]),
    ];
    // released before the hunter reached the cloud: after that the hunter bumps the defender and the caller, which the
    // formula does not model, so its cloud, its blind ticks and the caller's escape are read only for an early release
    if (early) {
        readings.push(
            ticksReading(row, 'cloud centre, px ahead of the hunter', [geometry.cloud.x, scene.outcome.cloud.x], PX),
            ticksReading(row, 'hidden ticks', [geometry.hiddenTicks, scene.ticks.hiddenTicks], inTicks(3)),
            signReading(row, 'caller out of view when the cover ends', [
                geometry.hiddenTicks >= geometry.escapeNeed,
                scene.outcome.escaped,
            ]),
        );
    }
    return readings;
}

/**
 * Plays the defence and both smoke scenes beside the formulas.
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @returns {{readings: DefenceReading[], drift: number}} every reading and how many are outside their tolerance; the model's
 *   `reactionTicks` is the brains' reaction in the scenes, and the smoke slack is read without it (the oracle prey reacts
 *   at once)
 */
export function defenceCheck(config, model) {
    const readings = [
        ...defenceReadings(config, model),
        ...preyReadings(config, model),
        ...defenderReadings(config, model),
    ];
    return { readings, drift: readings.filter((r) => r.drift).length };
}
