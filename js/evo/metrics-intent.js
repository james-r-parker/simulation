// The fifteen deliberate-behaviour metrics (world-balance.md, Deliberate-behaviour metrics), computed from the
// observer's intent run totals and combat counters. Each is `null` with a reason when its denominator is 0.

import { callBases } from './observer-intent-state.js';
import { none, ok, per1k, share } from './metrics-stats.js';

/**
 * @param {Record<string, any>} run the intent run totals
 * @returns {import('./metrics-stats.js').MetricResult} the mean kin count around threatened agents minus the mean
 *   around unthreatened ones
 */
function groupCohesion(run) {
    if (run.groupThreatN === 0) {
        return none('no threatened agent in a grouping sample');
    }
    if (run.groupCalmN === 0) {
        return none('no unthreatened agent in a grouping sample');
    }
    return ok(run.groupThreatSum / run.groupThreatN - run.groupCalmSum / run.groupCalmN);
}

/**
 * @param {number} deliberate food energy eaten after a closing approach
 * @param {number} chance food energy eaten otherwise
 * @returns {import('./metrics-stats.js').MetricResult} `eval.deliberate_food_share`, whole run or one window
 */
export function foodShare(deliberate, chance) {
    return share(deliberate, deliberate + chance, 'no food eaten');
}

/**
 * @param {number} deliberate hunter kills made by a deliberate bite
 * @param {number} kills hunter kills
 * @returns {import('./metrics-stats.js').MetricResult} `eval.pursuit_kill_share`, whole run or one window
 */
export function killShare(deliberate, kills) {
    return share(deliberate, kills, 'no hunter kill');
}

/**
 * @param {number} responded escaped bite episodes in which the victim responded
 * @param {number} escaped escaped bite episodes
 * @returns {import('./metrics-stats.js').MetricResult} `eval.evasion_skill`, whole run or one window
 */
export function evasionShare(responded, escaped) {
    return share(responded, escaped, 'no escaped bite episode');
}

/**
 * @param {number} precise calls made with the cue current
 * @param {number} base the sum, over the calls, of the caller's own share of ticks with the cue current
 * @param {number} calls calls made
 * @param {string} reason why there is no value
 * @returns {import('./metrics-stats.js').MetricResult} the precise share minus the callers' base rate: 0 for a call
 *   made whatever the cue, 1 minus the base rate for a call made only on it
 */
function lift(precise, base, calls, reason) {
    return calls > 0 ? ok((precise - base) / calls) : none(reason);
}

/**
 * @param {Record<string, any>} observer the observer, fed every tick
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} results keyed by metric name
 */
export function intentMetrics(observer) {
    const { intent, combat, agentTicks } = observer;
    const { run, calls } = intent;
    const bases = callBases(intent);
    const huntBites = run.huntBiteDeliberate + run.huntBiteChance;
    return {
        'eval.deliberate_food_share': foodShare(run.foodDeliberate, run.foodChance),
        'eval.deliberate_food_per_1k': per1k(run.foodDeliberate, agentTicks),
        'eval.chance_food_per_1k': per1k(run.foodChance, agentTicks),
        'eval.pursuit_bite_share': share(run.huntBiteDeliberate, huntBites, 'no bite energy gained by hunters'),
        'eval.pursuit_kill_share': killShare(run.huntKillsDeliberate, combat.huntKills),
        'eval.pack_convergence': share(run.packKillsConvergent, combat.packKills, 'no pack kill'),
        'eval.hunt_call_answer': share(calls.answeredCalls, calls.resolved, 'no resolved hunt call'),
        'eval.evasion_skill': evasionShare(run.escapedResponded, combat.escapedEpisodes),
        'eval.group_cohesion_under_threat': groupCohesion(run),
        'eval.alarm_precision': lift(run.alarmsPrecise, bases.alarm, run.alarms, 'no alarm call'),
        'eval.hunt_call_precision': lift(run.huntCallsPrecise, bases.hunt, run.huntCalls, 'no hunt call'),
        'eval.smoke_precision': share(run.smokesPrecise, run.smokes, 'no smoke release'),
        'eval.idle_signals_per_1k': per1k(run.idleSignals, agentTicks),
        'eval.undefended_bite_share': share(
            run.undefendedEpisodes,
            run.episodesClassified,
            'no classified bite episode',
        ),
        'eval.unseen_bite_share': share(run.unseenEpisodes, run.episodesClassified, 'no classified bite episode'),
    };
}
