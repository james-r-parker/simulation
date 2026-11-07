// Who an alarm call reaches (alarm-calls.md, Detectors). On each `AlarmCalled` event the alive agents inside the caller's
// `callRadius` that hear it (alarm loudness above 0 in `heard`) are counted, split into agents without `canHunt` and
// `canHunt` agents; the totals feed
//
// - `eval.alarm_hearers_per_call`: the mean non-hunter hearers per call;
// - `eval.alarm_hunter_hearers_per_call`: the mean `canHunt` hearers per call (a call that tells a hunter where prey are);
// - `eval.alarm_calls_with_threat_per_1k`: the calls whose caller saw a threat within `INTENT_WINDOW` ticks, per 1000
//   agent-ticks of agents without `canHunt`, so that spam does not hide inside `eval.alarm_rate`;
// - `eval.call_opportunity_neighbours`: the mean count of other non-hunters of any lineage within `callRadius` of a
//   threatened non-hunter, in the D5 grouping sample (`sampleGroups`): the audience a call would have, whether or not
//   anyone calls;
// - `eval.call_opportunity_kin`: the mean same-lineage count in the same sample (`run.groupThreatSum` over
//   `run.groupThreatN`): the ceiling on the kin term.
//
// The three call metrics are `null` with no call (the third with no agent-tick), the opportunity pair with no
// threatened agent in a sample. All five are instruments (`watch`); none is a reward. Observer state outside `worldHash`;
// one pass over the slots per call, nothing allocated.

import { HEARD_STRIDE } from '../sim/world.js';
import { none, ok, per1k } from './metrics-stats.js';

/** The direction of each metric of this module. */
export const ALARM_REACH_DIRECTIONS = Object.freeze({
    'eval.alarm_hearers_per_call': 'watch',
    'eval.alarm_hunter_hearers_per_call': 'watch',
    'eval.alarm_calls_with_threat_per_1k': 'watch',
    'eval.call_opportunity_neighbours': 'watch',
    'eval.call_opportunity_kin': 'watch',
});

/**
 * @returns {{calls: number, hearers: number, hunterHearers: number}} empty alarm-reach totals
 */
export function createAlarmReach() {
    return { calls: 0, hearers: 0, hunterHearers: 0 };
}

/**
 * Counts the hearers of one `AlarmCalled` event.
 * @param {{calls: number, hearers: number, hunterHearers: number}} reach the totals
 * @param {{hunterSpec: Uint8Array, world: Record<string, any>, caller: number}} call the hunter table, the world after
 *   the step and the caller's slot
 * @returns {void}
 */
export function noteAlarmReach(reach, { hunterSpec, world, caller }) {
    const { alive, spec, x, y, heard } = world;
    const { callRadius } = world.config;
    reach.calls += 1;
    for (let s = 0; s < alive.length; s++) {
        if (alive[s] !== 1 || s === caller || heard[s * HEARD_STRIDE] <= 0) {
            continue;
        }
        const dx = x[s] - x[caller];
        const dy = y[s] - y[caller];
        if (Math.sqrt(dx * dx + dy * dy) >= callRadius) {
            continue;
        }
        if (hunterSpec[spec[s]] === 1) {
            reach.hunterHearers += 1;
        } else {
            reach.hearers += 1;
        }
    }
}

/**
 * @param {Record<string, any>} observer the observer, fed every tick
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the five alarm-reach metrics
 */
export function alarmReachMetrics(observer) {
    const { alarmReach: reach, hunterAgentTicks } = observer.combat;
    const noCall = none('no alarm call');
    const { run } = observer.intent;
    const noThreat = none('no threatened agent in a grouping sample');
    return {
        'eval.call_opportunity_neighbours':
            run.groupThreatN > 0 ? ok(run.opportunityNeighbourSum / run.groupThreatN) : noThreat,
        'eval.call_opportunity_kin': run.groupThreatN > 0 ? ok(run.groupThreatSum / run.groupThreatN) : noThreat,
        'eval.alarm_hearers_per_call': reach.calls > 0 ? ok(reach.hearers / reach.calls) : noCall,
        'eval.alarm_hunter_hearers_per_call': reach.calls > 0 ? ok(reach.hunterHearers / reach.calls) : noCall,
        'eval.alarm_calls_with_threat_per_1k': per1k(run.alarmsPrecise, observer.agentTicks - hunterAgentTicks),
    };
}
