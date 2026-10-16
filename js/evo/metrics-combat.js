// The five combat metrics, computed from the observer's combat counters (see observer-combat.js). Each is
// "higher is better"; each is `null` with a reason when its denominator is empty.

import { none, ok, per1k } from './metrics-stats.js';

/**
 * @param {number} part the numerator
 * @param {number} whole the denominator
 * @param {string} reason the reason when `whole` is 0
 * @returns {import('./metrics-stats.js').MetricResult} `part / whole`, or `null` with the reason
 */
function share(part, whole, reason) {
    return whole > 0 ? ok(part / whole) : none(reason);
}

/**
 * @param {Record<string, any>} combat the combat counters
 * @returns {import('./metrics-stats.js').MetricResult} eaten deaths by a `canHunt` killer per 1000 hunter agent-ticks
 */
function catchRate(combat) {
    return combat.hunterAgentTicks > 0 ? per1k(combat.huntKills, combat.hunterAgentTicks) : none('no hunters');
}

/**
 * @param {Record<string, any>} alarm the alarm follow-up
 * @returns {import('./metrics-stats.js').MetricResult} the mean hearer speed change minus the control change
 */
function alarmResponse(alarm) {
    if (alarm.calls === 0) {
        return none('no alarm call');
    }
    return share(alarm.sum, alarm.matchedCalls, 'no alarm call had a hearer with a matched control');
}

/**
 * The combat metrics of a run.
 * @param {Record<string, any>} observer the observer, fed every tick
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} results keyed by metric name
 */
export function combatMetrics(observer) {
    const { combat } = observer;
    const resolved = combat.caughtEpisodes + combat.escapedEpisodes;
    return {
        'eval.catch_rate': catchRate(combat),
        'eval.escape_rate': share(combat.escapedEpisodes, resolved, 'no resolved bite episode'),
        'eval.pack_kill_share': share(combat.packKills, combat.eatenDeaths, 'no eaten death'),
        'eval.alarm_response': alarmResponse(combat.alarm),
        'eval.smoke_escapes': share(combat.smoke.escapes, combat.smoke.bittenReleases, 'no smoke release after a bite'),
    };
}
