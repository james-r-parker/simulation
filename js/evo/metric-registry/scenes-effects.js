// Status-effect detector entries (status-effects.md, Detectors, T12). Every social effect starts with its numbers at 0, so
// these read how often each trigger occurs; none is a reward.

import { entry } from './entry.js';

/** Why an effect whose strength key is 0 at the defaults never raises a stack (metric-noise T27, E276). */
const OFF = 'zero at the defaults: its strength key is 0, so no stack is raised';
/** Why the call-driven readings are empty at the defaults (metric-noise T27, E276). */
const NO_CALLS = 'flat at the defaults: no alarm or hunt call fires (alarm-calls.md)';

/** Why the alarm-driven effects are almost never on at the defaults (metric-noise T28, E276). */
const RARE_CALLS =
    'near zero at the defaults: an alarm call fires on 1 or 2 of 128 seeds and nowhere else (E276, alarm-calls.md)';

const MODULE = 'js/evo/scene-effects.js';
const TEST = 'test/evo/scene-effects.test.js';

/**
 * @param {string} effect an effect's name
 * @param {string} trigger when the effect is on
 * @param {string | null} [expectedFlat] why the share is flat at the defaults, or null
 * @returns {Readonly<import('./entry.js').MetricEntry>} its share entry
 */
function share(effect, trigger, expectedFlat = null) {
    return entry('scenes-effects', {
        module: MODULE,
        meaning: `How often the ${effect} effect is on: ${trigger}.`,
        counts: `Alive agent-ticks with at least one ${effect} stack over all alive agent-ticks after burn-in.`,
        unit: 'share',
        direction: 'watch',
        intended: 'higher',
        nullWhen: ['no agent-ticks after burn-in'],
        ...(expectedFlat === null ? {} : { expectedFlat }),
        arithmetic: TEST,
        source: TEST,
    });
}

export const SCENES_EFFECTS = {
    'eval.effect_share.chilled': share('chilled', 'a body that has stayed under its optimal temperature band'),
    'eval.effect_share.wounded': share('wounded', 'a body a bite left alive, for woundTicks a stack', OFF),
    'eval.effect_share.panicked': share('panicked', 'a body a bite left alive, for panicTicks', OFF),
    'eval.effect_share.shaken': share('shaken', 'a body whose panic has just ended', OFF),
    'eval.effect_share.rallied': share('rallied', 'a hunter that heard a kin hunter call, for rallyTicks', NO_CALLS),
    'eval.effect_share.answered': share('answered', 'a caller whose rallied pack-mate killed prey it also bit', OFF),
    'eval.effect_share.hoarse': share('hoarse', 'a caller that wasted a call, for hoarseTicks a stack', RARE_CALLS),
    'eval.effect_share.alert': share(
        'alert',
        'a non-hunter that heard an alarm raised with a threat in view',
        RARE_CALLS,
    ),
    'eval.effect_share.huddled': share('huddled', 'a body with fed kin close by', OFF),
    'eval.effect_share.staggered': share('staggered', 'a hunter a defender shoved (only with staggerThrust above 0)'),
    'eval.rally_bite_share': entry('scenes-effects', {
        module: MODULE,
        meaning:
            'How often a rallied hunter goes on to bite: higher means a hunt call brings its pack-mates into the hunt.',
        counts: 'Of the rallied stacks after burn-in that resolved, the share whose hunter landed a bite within rallyTicks of the stack (a stack whose hunter died is dropped).',
        unit: 'share',
        direction: 'watch',
        intended: 'higher',
        nullWhen: ['no rally stack resolved after burn-in'],
        expectedFlat: NO_CALLS,
        arithmetic: TEST,
        source: TEST,
    }),
    'eval.hoarse_call_share': entry('scenes-effects', {
        module: MODULE,
        meaning: 'How many calls are made by a caller already hoarse: lower means calls are not spam.',
        counts: 'Of the alarm and hunt calls after burn-in, the share whose caller held 3 or more hoarse stacks when the tick ended.',
        unit: 'share',
        direction: 'watch',
        intended: 'lower',
        nullWhen: ['no alarm or hunt call after burn-in'],
        expectedFlat: NO_CALLS,
        arithmetic: TEST,
        source: TEST,
    }),
    'eval.huddle_cold_gain': entry('scenes-effects', {
        module: MODULE,
        meaning:
            'The passive heat loss of huddled bodies over that of lone bodies in the same cold band: below 1 means the huddle keeps a body warmer.',
        counts: 'For each cold band with both huddled and lone alive agent-ticks after burn-in, the mean temperatureLossPassive lane with its effects applied for huddled bodies over that of lone bodies, the bands weighted by their huddled ticks.',
        unit: 'ratio',
        direction: 'watch',
        intended: 'lower',
        nullWhen: ['no cold band holds both huddled and lone bodies after burn-in'],
        expectedFlat: OFF,
        arithmetic: TEST,
        source: TEST,
    }),
};
