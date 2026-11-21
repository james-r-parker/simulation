// The effects of the sim, in registry order (docs/designs/status-effects.md): every within-life modifier, as data for
// `createEffects` in `effects.js`. Factors multiply in this order. Each entry's level is a rule of effect-levels.js; the
// numbers it scales by are config keys (or lanes, where a lane has moved), so a number is tuned where it always was.

import {
    alarmCoolingLevel,
    alertGrazingLevel,
    alarmSeenLevel,
    coldBandLevel,
    coldRampLevel,
    digestingLevel,
    diseasedLevel,
    fatLevel,
    grazingLevel,
    handlingLevel,
    heatBandLevel,
    hotRampLevel,
    huntCoolingLevel,
    immatureLevel,
    juvenileLevel,
    outOfBandLevel,
    pregnantLevel,
    recoveringLevel,
    restingLevel,
    satedLevel,
    sickLevel,
    smokeCoolingLevel,
    spentLevel,
} from './effect-levels.js';

/** The three lanes a standing cost is made of: the passive loss, the size term and the vision term. */
const STANDING = ['passiveLoss', 'sizeEnergyLoss', 'visionCost'];

/** The ramp of a temperature outside the optimal band: the standing cost rises by `temperaturePassiveLossFactor - 1`. */
const RAMP = { key: 'temperaturePassiveLossFactor', offset: -1 };

/**
 * @param {string} name the effect's name
 * @param {Partial<import('./effects.js').Effect> & Pick<import('./effects.js').Effect, 'level'>} fields what differs from
 *   an effect that is on or off, scales nothing, closes nothing and drains nothing
 * @returns {Readonly<import('./effects.js').Effect>} the effect
 */
function effect(name, fields) {
    return Object.freeze({
        name,
        family: 'body',
        maxStacks: 1,
        scales: [],
        gates: [],
        drains: [],
        applier: null,
        visible: false,
        ...fields,
    });
}

/** @type {readonly import('./effects.js').Effect[]} */
export const EFFECTS = Object.freeze([
    effect('fat', {
        level: 'share',
        read: fatLevel,
        scales: [
            { lane: 'maxThrust', perStack: { key: 'fatSlowShare', scale: -1 } },
            { lane: 'maxTurn', perStack: { key: 'fatSlowShare', scale: -1 } },
        ],
        visible: true,
    }),
    effect('coldBand', {
        level: 'step',
        read: coldBandLevel,
        scales: [
            { lane: 'maxThrust', levels: [1, 'temperatureEfficiencyColdModerate', 'temperatureEfficiencyColdSevere'] },
        ],
        visible: true,
    }),
    effect('heatBand', {
        level: 'step',
        read: heatBandLevel,
        scales: [
            { lane: 'maxThrust', levels: [1, 'temperatureEfficiencyHeatModerate', 'temperatureEfficiencyHeatSevere'] },
        ],
        visible: true,
    }),
    effect('coldRamp', {
        level: 'share',
        read: coldRampLevel,
        scales: STANDING.map((lane) => ({ lane, perStack: RAMP })),
    }),
    effect('hotRamp', {
        level: 'share',
        read: hotRampLevel,
        scales: STANDING.map((lane) => ({ lane, perStack: RAMP })),
    }),
    effect('outOfBand', { level: 'step', read: outOfBandLevel, gates: ['MATE'] }),
    effect('grazing', {
        family: 'feeding',
        level: 'step',
        read: grazingLevel,
        scales: [{ lane: 'maxThrust', levels: [1, 'grazeThrust'] }],
        visible: true,
    }),
    effect('handling', {
        family: 'feeding',
        level: 'step',
        read: handlingLevel,
        scales: [{ lane: 'maxThrust', levels: [1, 'handlingThrust'] }],
        visible: true,
    }),
    effect('digesting', { family: 'feeding', level: 'step', read: digestingLevel, gates: ['EAT'], visible: true }),
    effect('sated', { family: 'feeding', level: 'step', read: satedLevel, gates: ['EAT'], visible: true }),
    effect('resting', {
        family: 'feeding',
        level: 'step',
        read: restingLevel,
        scales: [{ lane: 'maxThrust', perStack: -1 }],
        visible: true,
    }),
    effect('spent', {
        level: 'share',
        read: spentLevel,
        scales: [{ lane: 'sprintBoost', perStack: -1 }],
        visible: true,
    }),
    effect('sick', {
        family: 'feeding',
        level: 'step',
        read: sickLevel,
        scales: [{ lane: 'maxThrust', levels: [1, 'sickThrust'] }],
        gates: ['EAT'],
        drains: [{ perTick: 'sickDrain', cause: 'COST', times: 'dose' }],
        visible: true,
    }),
    effect('diseased', {
        family: 'feeding',
        level: 'step',
        read: diseasedLevel,
        drains: [{ perTick: 'diseaseDrain', cause: 'DISEASE' }],
        visible: true,
    }),
    effect('juvenile', {
        level: 'step',
        read: juvenileLevel,
        scales: [...STANDING, 'movementCost', 'turnCost', 'sprintCost'].map((lane) => ({
            lane,
            levels: [1, 'juvenileBurn'],
        })),
        visible: true,
    }),
    effect('immature', {
        family: 'body',
        level: 'step',
        read: immatureLevel,
        gates: ['MATE', 'SPLIT'],
        visible: true,
    }),
    effect('recovering', { level: 'step', read: recoveringLevel, gates: ['MATE', 'SPLIT'] }),
    effect('pregnant', { level: 'step', read: pregnantLevel, gates: ['MATE', 'SPLIT'], visible: true }),
    effect('alarmSeen', {
        family: 'combat',
        level: 'step',
        read: alarmSeenLevel,
        scales: [{ lane: 'biteTakenMultiplier', levels: [1, 'alarmBiteShare'] }],
    }),
    effect('alarmCooling', { family: 'social', level: 'step', read: alarmCoolingLevel, gates: ['ALARM'] }),
    effect('huntCooling', { family: 'social', level: 'step', read: huntCoolingLevel, gates: ['HUNT'] }),
    effect('smokeCooling', { family: 'social', level: 'step', read: smokeCoolingLevel, gates: ['SMOKE'] }),
    // status-effects Phase 2, T9: the stacks the body keeps. All four numbers of each are 0 by default, so none changes a lane.
    // `shaken` is listed before `panicked`: the fade pass raises it as `panicked` ends, after its own row has been read.
    effect('chilled', {
        level: 'stacks',
        maxStacks: 10,
        fades: { kind: 'held', key: 'coldStackTicks' },
        scales: [{ lane: 'passiveLoss', perStack: 'coldStackRate' }],
        applier: 'stepChilled',
        visible: true,
    }),
    effect('wounded', {
        family: 'combat',
        level: 'stacks',
        maxStacks: 5,
        fades: { kind: 'every', key: 'woundTicks' },
        scales: [{ lane: 'maxThrust', perStack: { key: 'woundThrust', scale: -1 } }],
        applier: 'noteBitten',
        visible: true,
    }),
    effect('shaken', {
        family: 'combat',
        level: 'stacks',
        fades: { kind: 'ticks', key: 'shakenTicks', by: 'nerve' },
        scales: [{ lane: 'maxThrust', perStack: { key: 'shakenThrust', scale: -1 } }],
        applier: 'panicked',
        visible: true,
    }),
    effect('panicked', {
        family: 'combat',
        level: 'stacks',
        maxStacks: 2,
        fades: { kind: 'ticks', key: 'panicTicks' },
        then: 'shaken',
        scales: [
            { lane: 'maxThrust', perStack: 'panicThrust', by: 'nerve' },
            { lane: 'sprintBoost', perStack: 'panicThrust', by: 'nerve' },
            { lane: 'passiveLoss', perStack: 'panicBurn', by: 'nerve' },
            { lane: 'temperatureGainMove', perStack: 'panicBurn', by: 'nerve' },
        ],
        applier: 'noteBitten',
        visible: true,
    }),
    // status-effects Phase 2, T10: the pack. `rallied` goes to the hearer and costs it, `answered` pays the caller only for
    // a pack-mate's kill that it also bit, `hoarse` prices the call. No effect pays a body for calling.
    effect('rallied', {
        family: 'social',
        level: 'stacks',
        maxStacks: 3,
        fades: { kind: 'ticks', key: 'rallyTicks' },
        scales: [
            { lane: 'maxThrust', perStack: 'rallyThrust', by: 'nerve' },
            { lane: 'sprintBoost', perStack: 'rallyThrust', by: 'nerve' },
            { lane: 'passiveLoss', perStack: 'rallyBurn', by: 'nerve' },
            { lane: 'temperatureGainMove', perStack: 'rallyBurn', by: 'nerve' },
        ],
        applier: 'noteHeard',
        visible: true,
    }),
    effect('answered', {
        family: 'social',
        level: 'stacks',
        maxStacks: 2,
        fades: { kind: 'ticks', key: 'answeredTicks' },
        scales: [{ lane: 'biteEnergy', perStack: 'answeredBite' }],
        applier: 'noteAnswered',
        visible: true,
    }),
    effect('hoarse', {
        family: 'social',
        level: 'stacks',
        maxStacks: 5,
        fades: { kind: 'every', key: 'hoarseTicks' },
        scales: [
            { lane: 'alarmCost', perStack: 'hoarseFactor', power: true },
            { lane: 'huntCallCost', perStack: 'hoarseFactor', power: true },
        ],
        applier: 'settleCalls',
        visible: true,
    }),
    // status-effects Phase 2, T11: the herd. `alert` goes to a non-hunter that hears a real alarm; `huddled` to a body with fed
    // kin close by; `staggered` to a hunter a defender shoves. `staggered` closes `bite`, so it is raised only with a strength.
    effect('alert', {
        family: 'social',
        level: 'stacks',
        maxStacks: 2,
        fades: { kind: 'ticks', key: 'alertTicks' },
        scales: [
            { lane: 'maxTurn', perStack: 'alertBoost', by: 'nerve' },
            { lane: 'sprintBoost', perStack: 'alertBoost', by: 'nerve' },
        ],
        applier: 'noteHeard',
        visible: true,
    }),
    // The cost of `alert`: a body that watches feeds less well. It reads the stacks of `alert`, so it is listed after it.
    effect('alertGrazing', {
        family: 'social',
        level: 'step',
        read: alertGrazingLevel,
        scales: [{ lane: 'maxThrust', perStack: { key: 'alertGraze', scale: -1 }, by: 'nerve' }],
    }),
    effect('huddled', {
        family: 'social',
        level: 'stacks',
        maxStacks: 4,
        fades: { kind: 'held', key: 'huddleRange' },
        scales: [{ lane: 'temperatureLossPassive', perStack: { key: 'huddleWarmth', scale: -1 } }],
        applier: 'huddlePass',
        visible: true,
    }),
    effect('staggered', {
        family: 'combat',
        level: 'stacks',
        maxStacks: 3,
        fades: { kind: 'ticks', key: 'staggerTicks' },
        scales: [{ lane: 'maxThrust', perStack: { key: 'staggerThrust', scale: -1 } }],
        gates: ['BITE'],
        applier: 'noteShoved',
        visible: true,
    }),
]);
