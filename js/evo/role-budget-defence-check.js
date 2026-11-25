// The cross-check of the Phase 2 budget against the sim (docs/designs/role-budget.md, "Cross-check against the sim"): the
// defence and the two smoke formulas played beside their scripted scenes, each reading with its tolerance. The scene and the
// formula start from the same state, so a difference is the formula's.

import { roleParams } from './role-budget-params.js';
import { defenceTimeline } from './role-budget-defence.js';
import { budgetDefend } from './role-budget-defend.js';
import { escortGap, guardPosture } from './role-budget-escort.js';
import { defenderSmokeGeometry, segmentHitsCloud, smokeCell } from './role-budget-smoke.js';
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
export function ticksReading(row, what, [formula, scene], exact) {
    const allowed = exact === undefined ? Math.max(2, 0.1 * Math.abs(scene ?? 0)) : exact.within;
    const drift = formula === null || scene === null ? formula !== scene : Math.abs(formula - scene) > allowed;
    const tolerance = exact === undefined ? '10% or 2 ticks' : `${exact.within} ${exact.unit}`;
    return { row, what, formula, scene, tolerance, drift };
}

/** @param {number} within the ticks @returns {{within: number, unit: string}} a fixed tolerance in ticks */
export const inTicks = (within) => ({ within, unit: 'ticks' });

/**
 * @param {string} row the row
 * @param {string} what the reading
 * @param {[boolean, boolean]} values the formula's and the scene's answers
 * @returns {DefenceReading} the reading: the two must agree
 */
export function signReading(row, what, [formula, scene]) {
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
    const options = {
        reaction: model.reactionTicks,
        threshold: model.hearThreshold,
        side: escortGap(defender, caller, model),
        posture: guardPosture(model),
    };
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
    // the hunter bites the defender it meets, which shoves it or not, and rests after a kill of it (`feed` of
    // role-budget-defence-contact.js), so the kill tick is read with the shove on as well as off
    readings.push(ticksReading(row, 'kill tick', [run.killTick, scene.ticks.killTick], inTicks(2)));
    if (shoves) {
        readings.push(...shoveReadings({ config, model }, { run, scene, lone }));
    }
    return readings;
}

/**
 * The shove's readings: the tick of the first shove, whether it delays the kill and the bite energy that delay prevents, each
 * against the scene (the kill tick of the run is read beside them by `defenceReadings`).
 * @param {{config: Readonly<Record<string, any>>, model: import('./role-budget-model.js').RoleModel}} base the config and model
 * @param {{run: import('./role-budget-defence.js').Defence, scene: ReturnType<typeof playDefence>,
 *   lone: ReturnType<typeof playDefence>}} plays the formula's run with the defender, the scene's runs with it and without
 * @returns {DefenceReading[]} the readings
 */
function shoveReadings({ config, model }, { run, scene, lone }) {
    const [hunter, caller, defender] = ['predator', 'forager', 'defender'].map((s) => roleParams(config, s));
    const formula = budgetDefend(defender, hunter, caller, model).repel;
    const row = 'defender:predator';
    const killed = scene.ticks.killTick;
    const delayed = killed === null || (lone.ticks.killTick !== null && killed > lone.ticks.killTick);
    const bite = hunter.bite.damage * caller.bite.taken;
    const prevented = Math.max(0, lone.outcome.bites - scene.outcome.bites) * bite;
    return [
        ticksReading(row, 'first shove tick', [run.repelTick, scene.ticks.repelTick], inTicks(2)),
        signReading(row, 'shove breaks the bite', [formula.breaksBite, delayed]),
        ticksReading(row, 'bite energy prevented', [formula.prevented, prevented], { within: 1e-6, unit: 'energy' }),
    ];
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
export const PX = { within: 1, unit: 'px' };

/**
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @returns {DefenceReading[]} the defender's smoke: when it releases, where the cloud lies, how long the hunter is blind,
 *   whether the caller is out of view when the cover ends, and that a defender facing the hunter drops the cloud toward it
 */
function defenderReadings(config, model) {
    const bodies = ['predator', 'forager', 'defender'].map((s) => roleParams(config, s));
    const play = { reaction: model.reactionTicks, threshold: model.hearThreshold, standing: STANDING };
    const geometry = defenderSmokeGeometry(bodies, { ...model, standing: STANDING });
    const scene = playDefenderSmoke(config, play);
    const turned = playDefenderSmoke(config, { ...play, facing: 'hunter' });
    const row = 'smoke:defender';
    const early = geometry.slackDefender !== null && geometry.slackDefender >= 0;
    const readings = [
        ticksReading(row, 'release tick', [geometry.releaseTick, scene.ticks.releaseTick]),
        signReading(row, 'a defender facing the hunter drops the cloud toward it: the cloud is between', [
            true,
            turned.outcome.between,
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

/** The px of the caller's reach the walking defender's path may graze before the walk is read as bumped. */
const CLEAR = 5;

/** The tolerance of where the walking defender stops, in px: a stop is 100 ticks of damped motion from a start. */
const STOP_PX = { within: 3, unit: 'px' };

/**
 * The defender's walk, turn and stop from its real start (the escort distance to the side of the caller, facing along the side): when it
 * releases and where the cloud lands, with the hunter standing still so that no bump enters the reading.
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @returns {DefenceReading[]} the readings
 */
function walkReadings(config, model) {
    const bodies = ['predator', 'forager', 'defender'].map((s) => roleParams(config, s));
    const [hunter, caller, defender] = bodies;
    const geometry = defenderSmokeGeometry(bodies, model);
    const options = {
        reaction: model.reactionTicks,
        threshold: model.hearThreshold,
        side: escortGap(defender, caller, model),
    };
    const heard = defenceTimeline(hunter, caller, defender, options).heardTick >= 0;
    const spot = defenderSmokeGeometry(bodies, { ...model, standing: STANDING }).releasePoint;
    const length = spot + caller.size + defender.size;
    const path = [
        { x: length, y: escortGap(defender, caller, model) },
        { x: spot, y: 0 },
    ];
    const bump = { x: length, y: 0, r: caller.size + defender.size - CLEAR };
    // not read when the defender is never heard, or when its path passes through the caller: the formula has no bumps
    if (!heard || segmentHitsCloud(path[0], path[1], bump)) {
        return [];
    }
    const scene = playDefenderSmoke(config, {
        reaction: model.reactionTicks,
        threshold: model.hearThreshold,
        standing: STANDING,
        walk: { side: escortGap(defender, caller, model) },
    });
    const row = 'smoke:defender walk';
    return [
        ticksReading(row, 'release tick', [geometry.releaseTick, scene.ticks.releaseTick], inTicks(2)),
        ticksReading(row, 'cloud centre x, px ahead of the hunter', [geometry.cloud.x, scene.outcome.cloud.x], STOP_PX),
        ticksReading(row, 'cloud centre y, px off the line', [geometry.cloud.y, scene.outcome.cloud.y], STOP_PX),
    ];
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
        ...walkReadings(config, model),
    ];
    return { readings, drift: readings.filter((r) => r.drift).length };
}
