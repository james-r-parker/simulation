// The cross-check of the Phase 3 budget against the sim (docs/designs/role-budget.md, "Cross-check against the sim"): the warning
// chain played beside its scripted scene, each reading with its tolerance. The scene and the formula start from the same
// state, so a difference is the formula's.

import { PX, inTicks, signReading, ticksReading } from './role-budget-defence-check.js';
import { roleParams } from './role-budget-params.js';
import { maxCatchableGap } from './role-budget-frame.js';
import { budgetWarn, flying, warnTimeline } from './role-budget-warn.js';
import { playReactiveFlight, playWarning } from './role-scenes-warn.js';

/**
 * The warning: the scout's alarm, the forager's hearing and first move and its gap then exactly, the gap when it has turned
 * (the forager gains on the hunter while it turns, in the formula as in the sim), and that the formula does not flatter it: a forager it calls safe is not killed in the sim (the oracle evader may escape where the bound says it
 * is caught, as for the `broken` bound of Phase 1).
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @returns {{readings: import('./role-budget-defence-check.js').DefenceReading[], drift: number}} every reading and how many
 *   are outside their tolerance; the model's `reactionTicks` is the brains' reaction in the scene
 */
export function warnCheck(config, model) {
    const [hunter, forager, scout] = ['predator', 'forager', 'scout'].map((s) => roleParams(config, s));
    const chain = warnTimeline({ scout, forager, hunter }, model);
    const scene = playWarning(config, {
        reaction: model.reactionTicks,
        threshold: model.hearThreshold,
        side: model.defenderGap,
        goAt: chain.startTick,
        runAt: chain.runTick,
    });
    const row = 'scout:predator';
    // the oracle hunter sprints at effort 1 and only with the forager in view; the forager it chases is the one that has turned
    const reach = maxCatchableGap(hunter, forager, { model, effort: 1, sprint: 'view', ...flying(chain) });
    const oracle = chain.runTick >= 0 && chain.gapAtRun >= reach;
    // the scene's hunter is the perfect oracle and the budget's `run` reads the reactive tier (Phase 6), so the no-flattery
    // reading holds the formula to the perfect hunter's reach: a forager that outruns it is not killed in the sim
    const safeFromPerfect =
        chain.runTick >= 0 && chain.gapAtRun >= maxCatchableGap(hunter, forager, { model, ...flying(chain) });
    // the reactive tier of the budget's `run` (Phase 6) against the sim's reactive hunter: one-sided, as the perfect reading is
    const runCell = chain.runTick >= 0 ? budgetWarn(scout, forager, hunter, model).cells.run.status : 'n/a';
    const reactive =
        runCell === 'ok' || runCell === 'tight'
            ? playReactiveFlight(config, { reaction: model.reactionTicks, aware: chain.gapAtRun, ...flying(chain) })
            : null;
    const readings = [
        ticksReading(row, 'alarm tick', [chain.alarmTick, scene.ticks.alarmTick], inTicks(0)),
        ticksReading(row, 'forager hears', [chain.heardTick, scene.ticks.heardTick], inTicks(0)),
        ticksReading(row, 'forager moves', [chain.startTick, scene.ticks.startTick], inTicks(0)),
        ticksReading(row, 'gap when the forager moves', [chain.gapAtStart, scene.ticks.gapAtStart], PX),
        ticksReading(row, 'gap when the forager has turned and runs', [chain.gapAtRun, scene.ticks.gapAtRun], PX),
        signReading(row, 'a forager the formula calls safe is safe in the sim: the formula never flatters it', [
            true,
            !safeFromPerfect || !scene.outcome.caught,
        ]),
        signReading(row, 'a forager whose run reads ok or tight is not caught by the reactive oracle hunter', [
            true,
            reactive === null || !reactive.outcome.caught,
        ]),
        signReading(
            row,
            "at effort 1, the oracle hunter's, the formula and the sim agree on whether the forager is caught",
            [oracle, !scene.outcome.caught],
        ),
    ];
    return { readings, drift: readings.filter((r) => r.drift).length };
}
