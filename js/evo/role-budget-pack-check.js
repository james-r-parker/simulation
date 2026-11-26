// The cross-check of the pack row against the sim (docs/designs/role-budget.md, "Cross-check against the sim";
// docs/designs/status-effects.md T13a): `budgetPack` beside the two-hunter scene, each reading with its tolerance. The scene
// and the formula start from the same lanes, so a difference is the formula's.

import { callEffectsOn } from '../sim/effect-numbers.js';
import { inTicks, signReading, ticksReading } from './role-budget-defence-check.js';
import { PACK_LEVELS, budgetPack } from './role-budget-pack.js';
import { roleParams } from './role-budget-params.js';
import { rateReading } from './role-budget-thrive-check.js';
import { playPack } from './role-scenes-pack.js';

/** The tolerance of the top speeds: the sim's contact kicks carry a hunter a little over its sprint cap. */
const SPEED_RELATIVE = 0.02;
/** The tolerance of a lane ratio: the same lane composed the same way, so it is exact to rounding. */
const LANE_ABSOLUTE = 1e-6;
/** The share by which the hearer must outrun the caller for the scene to call the pack faster. */
const FASTER = 1.01;

/**
 * The pack: one hunt call gives the hearer one `rallied` stack and the caller none, the hearer's sprint boost and standing
 * cost are the formula's lanes at one stack, both top speeds are the formula's caps, the scene's hearer is faster than its
 * caller exactly when `packGain` is above 0, and a rallied kill that the caller shared pays the caller one `answered` stack
 * (a kill that the caller did not share, or a hunter that nobody called, pays none).
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @returns {{readings: import('./role-budget-defence-check.js').DefenceReading[], drift: number}} every reading and how many
 *   are outside their tolerance
 */
export function packCheck(config, model) {
    const row = 'pack:forager';
    const budget = budgetPack(config, model);
    const lone = roleParams(config, 'predator');
    const heard = roleParams(config, 'predator', {}, { effects: { ...PACK_LEVELS } });
    const called = playPack(config, { call: true });
    const silent = playPack(config, { call: false });
    const on = callEffectsOn(config) ? 1 : 0;
    const speed = { relative: SPEED_RELATIVE };
    const lane = { absolute: LANE_ABSOLUTE };
    const readings = [
        ticksReading(
            row,
            'rallied stacks of the hearer after one hunt call',
            [on * PACK_LEVELS.rallied, called.rallied.hearer],
            inTicks(0),
        ),
        ticksReading(row, 'rallied stacks of the caller after its own call', [0, called.rallied.caller], inTicks(0)),
        rateReading(
            row,
            "hearer sprintBoost over the caller's",
            [heard.thrust.gain / lone.thrust.gain, called.lanes.sprintBoost],
            lane,
        ),
        rateReading(
            row,
            "hearer passiveLoss over the caller's",
            [heard.cost.passive / lone.cost.passive, called.lanes.passiveLoss],
            lane,
        ),
        rateReading(row, 'hearer top speed, px per tick', [heard.cap.sprint, called.peak.hearer], speed),
        rateReading(row, 'caller top speed, px per tick', [lone.cap.sprint, called.peak.caller], speed),
        signReading(row, 'the hearer outruns the caller exactly when packGain is above 0', [
            budget.packGain > 0,
            called.peak.hearer > FASTER * called.peak.caller,
        ]),
        ticksReading(
            row,
            'answered stacks of the caller after a kill by the hearer that it bit before',
            [called.outcome.shared ? on : 0, called.outcome.answered],
            inTicks(0),
        ),
        ticksReading(row, 'answered stacks of the caller when nobody called', [0, silent.outcome.answered], inTicks(0)),
    ];
    return { readings, drift: readings.filter((r) => r.drift).length };
}
