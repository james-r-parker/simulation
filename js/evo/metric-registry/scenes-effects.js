// Status-effect detector entries (status-effects.md, Detectors, T12). Every social effect starts with its numbers at 0, so
// these read how often each trigger occurs; none is a reward.

import { entry } from './entry.js';

const MODULE = 'js/evo/scene-effects.js';
const TEST = 'test/evo/scene-effects.test.js';

/**
 * @param {string} effect an effect's name
 * @param {string} trigger when the effect is on
 * @returns {Readonly<import('./entry.js').MetricEntry>} its share entry
 */
function share(effect, trigger) {
    return entry('scenes-effects', {
        module: MODULE,
        meaning: `How often the ${effect} effect is on: ${trigger}.`,
        counts: `Alive agent-ticks with at least one ${effect} stack over all alive agent-ticks after burn-in.`,
        unit: 'share',
        direction: 'watch',
        intended: 'higher',
        nullWhen: ['no agent-ticks after burn-in'],
        arithmetic: TEST,
        source: TEST,
    });
}

export const SCENES_EFFECTS = {
    'eval.effect_share.chilled': share('chilled', 'a body that has stayed under its optimal temperature band'),
    'eval.effect_share.wounded': share('wounded', 'a body a bite left alive, for woundTicks a stack'),
    'eval.effect_share.panicked': share('panicked', 'a body a bite left alive, for panicTicks'),
    'eval.effect_share.shaken': share('shaken', 'a body whose panic has just ended'),
    'eval.effect_share.rallied': share('rallied', 'a hunter that heard a kin hunter call, for rallyTicks'),
    'eval.effect_share.answered': share('answered', 'a caller whose rallied pack-mate killed prey it also bit'),
    'eval.effect_share.hoarse': share('hoarse', 'a caller that wasted a call, for hoarseTicks a stack'),
    'eval.effect_share.alert': share('alert', 'a non-hunter that heard an alarm raised with a threat in view'),
    'eval.effect_share.huddled': share('huddled', 'a body with fed kin close by'),
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
        arithmetic: TEST,
        source: TEST,
    }),
};
