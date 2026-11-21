// Status-effect detectors (docs/designs/status-effects.md, "Detectors"): how often each stored effect is on, whether a
// rally is followed by a bite, how many calls are made while hoarse, and what a huddle saves. Observer-only: reads the world
// and its events, writes nothing of it, and allocates its rows once.

import { EFFECT, SYSTEM, LANE_ID, levelOf, liveOf } from '../sim/effects.js';
import { EVENT } from '../sim/events.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { none, ok } from './metrics-stats.js';

/** The effects `eval.effect_share.<effect>` reports, in the order of the plan's table. */
export const SHARED = Object.freeze([
    'chilled',
    'wounded',
    'panicked',
    'shaken',
    'rallied',
    'answered',
    'hoarse',
    'alert',
    'huddled',
    'staggered',
]);

/** The most rally stacks waiting for their bite at once; a stack that finds the list full is not counted. */
const PENDING = 4096;

/** The `hoarse` stacks from which a call counts as made hoarse. */
const HOARSE_FROM = 3;

const TEMPERATURE_LOSS_PASSIVE_LANE = LANE_ID.temperatureLossPassive;
const SHARED_ROWS = SHARED.map((name) => SYSTEM.rowOf[EFFECT[name.toUpperCase()]]);

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} an empty scene
 */
export function createEffectsScene(config) {
    return {
        rallyTicks: config.rallyTicks,
        ticks: 0,
        on: new Float64Array(SHARED.length),
        pendSlot: new Int32Array(PENDING),
        pendGenome: new Uint32Array(PENDING),
        pendAt: new Float64Array(PENDING),
        pendGain: new Float64Array(PENDING),
        pending: 0,
        rallyBit: 0,
        rallyDone: 0,
        calls: 0,
        hoarseCalls: 0,
        bandTicks: new Float64Array(6),
        bandLoss: new Float64Array(6),
    };
}

/**
 * @param {Record<string, any>} scene the scene
 * @param {Record<string, any>} world the world
 * @param {number} o the offset of an `EFFECT_APPLIED` record
 * @returns {void}
 */
function onApplied(scene, world, o) {
    const d = world.events.data;
    if (
        world.tick < BURN_IN_TICKS ||
        d[o + EVENT.EFFECT_APPLIED.EFFECT] !== EFFECT.RALLIED ||
        scene.pending === PENDING
    ) {
        return;
    }
    const slot = d[o + EVENT.EFFECT_APPLIED.SLOT];
    const at = scene.pending++;
    scene.pendSlot[at] = slot;
    scene.pendGenome[at] = world.genomeId[slot];
    scene.pendAt[at] = world.tick;
    scene.pendGain[at] = world.ledgerBiteGain[slot];
}

/**
 * @param {Record<string, any>} scene the scene
 * @param {Record<string, any>} world the world
 * @param {number} o the offset of an `ALARM_CALLED` or `PACK_CALLED` record (the same layout)
 * @returns {void}
 */
function onCalled(scene, world, o) {
    if (world.tick < BURN_IN_TICKS) {
        return;
    }
    const slot = world.events.data[o + EVENT.ALARM_CALLED.SLOT];
    scene.calls += 1;
    if (world.effectStacks[SYSTEM.rowOf[EFFECT.HOARSE]][slot] >= HOARSE_FROM) {
        scene.hoarseCalls += 1;
    }
}

const KEEP = 0;
const BIT = 1;
const LATE = 2;
const GONE = 3;

/**
 * @param {Record<string, any>} scene the scene
 * @param {Record<string, any>} world the world
 * @param {number} i a waiting rally stack
 * @returns {number} `BIT` once its hunter has landed a bite since, `LATE` after `rallyTicks` without one, `GONE` when the
 *   hunter died or its slot was reused, else `KEEP`
 */
function rallyState(scene, world, i) {
    const slot = scene.pendSlot[i];
    if (world.alive[slot] !== 1 || world.genomeId[slot] !== scene.pendGenome[i]) {
        return GONE;
    }
    if (world.ledgerBiteGain[slot] > scene.pendGain[i]) {
        return BIT;
    }
    return world.tick - scene.pendAt[i] >= scene.rallyTicks ? LATE : KEEP;
}

/**
 * Settles the waiting rally stacks: a bite since the stack counts it, `rallyTicks` without one counts a miss, and a stack
 * whose hunter is gone is dropped. Compacts the list in place.
 * @param {Record<string, any>} scene the scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
function settleRallies(scene, world) {
    let kept = 0;
    for (let i = 0; i < scene.pending; i++) {
        const state = rallyState(scene, world, i);
        scene.rallyBit += state === BIT ? 1 : 0;
        scene.rallyDone += state === BIT || state === LATE ? 1 : 0;
        if (state === KEEP) {
            scene.pendSlot[kept] = scene.pendSlot[i];
            scene.pendGenome[kept] = scene.pendGenome[i];
            scene.pendAt[kept] = scene.pendAt[i];
            scene.pendGain[kept] = scene.pendGain[i];
            kept += 1;
        }
    }
    scene.pending = kept;
}

/**
 * Counts one alive body: the effects it has on, and its passive heat loss by cold band, huddled or alone.
 * @param {Record<string, any>} scene the scene
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive slot
 * @returns {void}
 */
function tickBody(scene, world, slot) {
    scene.ticks += 1;
    for (let k = 0; k < SHARED_ROWS.length; k++) {
        scene.on[k] += world.effectStacks[SHARED_ROWS[k]][slot] > 0 ? 1 : 0;
    }
    const huddled = world.effectStacks[SYSTEM.rowOf[EFFECT.HUDDLED]][slot] > 0 ? 1 : 0;
    const cell = levelOf(world, slot, EFFECT.COLD_BAND) * 2 + huddled;
    scene.bandTicks[cell] += 1;
    scene.bandLoss[cell] += liveOf(world, slot, TEMPERATURE_LOSS_PASSIVE_LANE);
}

/**
 * @param {Record<string, any>} scene the scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function tickEffects(scene, world) {
    settleRallies(scene, world);
    if (world.tick < BURN_IN_TICKS) {
        return;
    }
    const { alive } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            tickBody(scene, world, slot);
        }
    }
}

/**
 * @param {Record<string, any>} scene the scene
 * @returns {import('./metrics-stats.js').MetricResult} `eval.huddle_cold_gain`: the passive loss of huddled bodies over that
 *   of lone ones in the same cold band, the bands weighted by their huddled ticks
 */
function huddleGain(scene) {
    let weighted = 0;
    let weight = 0;
    for (let band = 0; band < 3; band++) {
        const lone = band * 2;
        const huddled = lone + 1;
        if (scene.bandTicks[lone] > 0 && scene.bandTicks[huddled] > 0 && scene.bandLoss[lone] > 0) {
            const ratio =
                scene.bandLoss[huddled] / scene.bandTicks[huddled] / (scene.bandLoss[lone] / scene.bandTicks[lone]);
            weighted += ratio * scene.bandTicks[huddled];
            weight += scene.bandTicks[huddled];
        }
    }
    return weight === 0 ? none('no cold band holds both huddled and lone bodies after burn-in') : ok(weighted / weight);
}

/**
 * @param {Record<string, any>} scene the scene
 * @param {number} k the effect's place in `SHARED`
 * @returns {import('./metrics-stats.js').MetricResult} the share of alive agent-ticks with the effect on
 */
function shareOf(scene, k) {
    return scene.ticks === 0 ? none('no agent-ticks after burn-in') : ok(scene.on[k] / scene.ticks);
}

/**
 * @param {Record<string, any>} scene the scene
 * @returns {import('./metrics-stats.js').MetricRecord} the scene's metrics by name
 */
export function effectsMetrics(scene) {
    return {
        'eval.effect_share.chilled': shareOf(scene, 0),
        'eval.effect_share.wounded': shareOf(scene, 1),
        'eval.effect_share.panicked': shareOf(scene, 2),
        'eval.effect_share.shaken': shareOf(scene, 3),
        'eval.effect_share.rallied': shareOf(scene, 4),
        'eval.effect_share.answered': shareOf(scene, 5),
        'eval.effect_share.hoarse': shareOf(scene, 6),
        'eval.effect_share.alert': shareOf(scene, 7),
        'eval.effect_share.huddled': shareOf(scene, 8),
        'eval.effect_share.staggered': shareOf(scene, 9),
        'eval.rally_bite_share':
            scene.rallyDone === 0
                ? none('no rally stack resolved after burn-in')
                : ok(scene.rallyBit / scene.rallyDone),
        'eval.hoarse_call_share':
            scene.calls === 0 ? none('no alarm or hunt call after burn-in') : ok(scene.hoarseCalls / scene.calls),
        'eval.huddle_cold_gain': huddleGain(scene),
    };
}

/** @type {import('./observer-detectors.js').Detector} */
export const effectsDetector = {
    name: 'effects',
    modules: ['js/evo/scene-effects.js'],
    sourceTest: 'test/evo/scene-effects.test.js',
    create: (config) => createEffectsScene(config),
    on: {
        EFFECT_APPLIED: (scene, world, o) => onApplied(scene, world, o),
        ALARM_CALLED: (scene, world, o) => onCalled(scene, world, o),
        PACK_CALLED: (scene, world, o) => onCalled(scene, world, o),
    },
    onTick: (scene, world) => tickEffects(scene, world),
    metrics: (scene) => effectsMetrics(scene),
};
