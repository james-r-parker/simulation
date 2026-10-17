// The thirteen deliberate-behaviour metrics (world-balance.md, Deliberate-behaviour metrics), computed from the
// observer's intent run totals and combat counters. Each is `null` with a reason when its denominator is 0.

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
 * @param {Record<string, any>} observer the observer, fed every tick
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} results keyed by metric name
 */
export function intentMetrics(observer) {
    const { intent, combat, agentTicks } = observer;
    const { run, calls } = intent;
    const huntBites = run.huntBiteDeliberate + run.huntBiteChance;
    return {
        'eval.deliberate_food_share': share(run.foodDeliberate, run.foodDeliberate + run.foodChance, 'no food eaten'),
        'eval.pursuit_bite_share': share(run.huntBiteDeliberate, huntBites, 'no bite energy gained by hunters'),
        'eval.pursuit_kill_share': share(run.huntKillsDeliberate, combat.huntKills, 'no hunter kill'),
        'eval.pack_convergence': share(run.packKillsConvergent, combat.packKills, 'no pack kill'),
        'eval.hunt_call_answer': share(calls.answeredCalls, calls.resolved, 'no resolved hunt call'),
        'eval.evasion_skill': share(run.escapedResponded, combat.escapedEpisodes, 'no escaped bite episode'),
        'eval.group_cohesion_under_threat': groupCohesion(run),
        'eval.alarm_precision': share(run.alarmsPrecise, run.alarms, 'no alarm call'),
        'eval.hunt_call_precision': share(run.huntCallsPrecise, run.huntCalls, 'no hunt call'),
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
