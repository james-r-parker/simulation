// The hunter row (natural-selection.md T53): how hunters live, die and arrive, read from the sim's `HunterLedger` records
// (one per `canHunt` death; js/sim/hunter-ledger.js) and from `AgentBorn`. The ledger is outside `worldHash`.
//
// - `eval.hunter_kills_per_life_p50`, `eval.hunter_kills_per_life_mean`, `eval.hunter_zero_kill_share`: the median and
//   mean kills of a hunter life (all deaths), and `eval.hunter_zero_kill_share`: the share of the hunter lives after
//   burn-in (deaths at or after `BURN_IN_TICKS`, and the hunters alive at the last tick, at their end age) with no kill.
// - `eval.hunter_kills_per_life_mean_settled`: the mean kills of the same lives as `eval.hunter_zero_kill_share` (after burn-in).
// - `eval.hunter_death_share.<cause>`: the share of hunter deaths by cause (starved, collision, eaten, trampled, disease,
//   other: old age and poison).
// - `eval.hunter_birth_source_share.<source>`: the share of hunter births by source (mate-hunter-parent,
//   split-hunter-parent, spec-flip, floor, initial); an immigrant or a plain mating child cannot be a hunter born so, and
//   an immigrant hunter is left out.
// - `eval.hunter_income_share.<kill|bite|carcass|herd>`: the energy hunters stored, by source, over the run (the world's
//   `hunterIncomeBySpec`, which counts what `addEnergy` stored).
// - `eval.hunter_median_lifespan`: the median age at death of a hunter, with no food floor.
// - `eval.predator_end_local_share`: of the hunters alive at the last tick, the share born by mating, split or a flip of a
//   non-hunter's child, that is not placed by the floor or the initial deal.
// - `eval.hunter_ticks_last_quarter`: the alive-hunter ticks summed over the last quarter of the run.
//
// Preallocated arrays and one growable log; nothing is allocated per tick.

import { BIRTH_SOURCE } from '../sim/hunter-ledger.js';
import { DEFAULTS } from '../sim/config-defaults.js';
import { DEATH_CAUSE, EVENT_TYPE, EVENT, EVENT_TICK } from '../sim/events.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { createLog, ensureRoom } from './growable-log.js';
import { bySuffix, none, ok, quantile, share } from './metrics-stats.js';
import {
    ageMetrics,
    BIRTH_INDEX,
    createAgeScene,
    HUNTER_BIRTH_NAMES,
    noteAgeDeath,
    noteAgeKill,
} from './scene-hunter-age.js';

/** The hunter death causes the metrics name, in order. */
export const HUNTER_DEATH_NAMES = Object.freeze(['starved', 'collision', 'eaten', 'trampled', 'disease', 'other']);
/** The hunter income sources the metrics name, in the order of `INCOME` in js/sim/hunter-ledger.js. */
export const HUNTER_INCOME_NAMES = Object.freeze(['kill', 'bite', 'carcass', 'herd']);

/** @type {Record<number, number>} */
const DEATH_INDEX = {};
DEATH_INDEX[DEATH_CAUSE.STARVED] = 0;
DEATH_INDEX[DEATH_CAUSE.COLLISION] = 1;
DEATH_INDEX[DEATH_CAUSE.EATEN] = 2;
DEATH_INDEX[DEATH_CAUSE.TRAMPLED] = 3;
DEATH_INDEX[DEATH_CAUSE.DISEASE] = 4;
DEATH_INDEX[DEATH_CAUSE.OLD_AGE] = 5;
DEATH_INDEX[DEATH_CAUSE.POISONED] = 5;

const LAST_SHARE = 0.25;

/**
 * @param {number} runTicks the run length in ticks; 0 leaves `eval.hunter_ticks_last_quarter` empty
 * @param {Readonly<Record<string, any>>} [config] the world's config, for the juvenile window of the age detectors
 * @returns {Record<string, any>} an empty hunter scene
 */
export function createHunterScene(runTicks, config = DEFAULTS) {
    return {
        age: createAgeScene(config.juvenileTicks),
        log: createLog(['age', 'kills']),
        rows: 0,
        lives: 0,
        zeroKill: 0,
        settledKills: 0,
        deaths: new Float64Array(HUNTER_DEATH_NAMES.length),
        births: new Float64Array(HUNTER_BIRTH_NAMES.length),
        alive: 0,
        quarterStart: runTicks * (1 - LAST_SHARE),
        runTicks,
        quarterTicks: 0,
    };
}

/**
 * Notes a birth: a hunter child joins the alive count and its source is counted.
 * @param {Record<string, any>} scene the hunter scene
 * @param {Record<string, any>} world the world
 * @param {number} slot the child's slot
 * @returns {void}
 */
export function noteHunterBirth(scene, world, slot) {
    if (world.huntBySpec[world.spec[slot]] !== 1) {
        return;
    }
    scene.alive += 1;
    const index = BIRTH_INDEX[world.birthSource[slot]];
    if (index !== undefined) {
        scene.births[index] += 1;
    }
}

/**
 * Notes one `HunterLedger` record: the death, its cause, the kills and the age.
 * @param {Record<string, any>} scene the hunter scene
 * @param {Float64Array} d the event ring data
 * @param {number} o the record offset
 * @returns {void}
 */
export function noteHunterLedger(scene, d, o) {
    const packed = d[o + EVENT.HUNTER_LEDGER.PACKED];
    const row = scene.rows++;
    ensureRoom(scene.log, row);
    scene.log.age[row] = d[o + EVENT.HUNTER_LEDGER.AGE_TICKS];
    scene.log.kills[row] = Math.floor(packed / 64);
    if (d[o + EVENT_TICK] >= BURN_IN_TICKS) {
        scene.lives += 1;
        scene.zeroKill += scene.log.kills[row] === 0 ? 1 : 0;
        scene.settledKills += scene.log.kills[row];
    }
    scene.deaths[DEATH_INDEX[Math.floor(packed / 8) % 8]] += 1;
    scene.alive -= 1;
    noteAgeDeath(scene.age, d, o);
}

/**
 * Notes one `HunterKill` record: the kill's age band and, for a first kill, the age.
 * @param {Record<string, any>} scene the hunter scene
 * @param {Float64Array} d the event ring data
 * @param {number} o the record offset
 * @returns {void}
 */
export function noteHunterKill(scene, d, o) {
    noteAgeKill(scene.age, d, o);
}

/**
 * Notes one event record when it is a hunter's: a `HunterKill` or a `HunterLedger`.
 * @param {Record<string, any>} scene the hunter scene
 * @param {Float64Array} d the event ring data
 * @param {number} o the record offset
 * @returns {void}
 */
export function noteHunterRecord(scene, d, o) {
    if (d[o] === EVENT_TYPE.HUNTER_KILL) {
        noteHunterKill(scene, d, o);
    } else if (d[o] === EVENT_TYPE.HUNTER_LEDGER) {
        noteHunterLedger(scene, d, o);
    }
}

/**
 * Adds the tick's alive hunters to the last-quarter total. Call it once a tick after the events.
 * @param {Record<string, any>} scene the hunter scene
 * @param {number} tick the tick just run
 * @returns {void}
 */
export function tickHunters(scene, tick) {
    if (scene.runTicks > 0 && tick > scene.quarterStart) {
        scene.quarterTicks += scene.alive;
    }
}

/**
 * @param {string} prefix the metric prefix
 * @param {readonly string[]} names the keys
 * @param {Float64Array} counts the count per key
 * @param {string} reason the reason when nothing was counted
 * @returns {import('./metrics-stats.js').MetricRecord} one share metric per key
 */
function shares(prefix, names, counts, reason) {
    let total = 0;
    for (let i = 0; i < counts.length; i++) {
        total += counts[i];
    }
    return bySuffix(prefix, names, (i) => share(counts[i], total, reason));
}

/**
 * @param {Record<string, any>} scene the hunter scene
 * @returns {import('./metrics-stats.js').MetricRecord} the death-record metrics
 */
function deathMetrics(scene) {
    const reason = 'no hunter deaths';
    const n = scene.rows;
    const kills = scene.log.kills.subarray(0, n);
    const ages = scene.log.age.subarray(0, n);
    let total = 0;
    for (let i = 0; i < n; i++) {
        total += kills[i];
    }
    return {
        'eval.hunter_kills_per_life_p50': n > 0 ? ok(quantile(kills, 0.5)) : none(reason),
        'eval.hunter_kills_per_life_mean': n > 0 ? ok(total / n) : none(reason),
        'eval.hunter_median_lifespan': n > 0 ? ok(quantile(ages, 0.5)) : none(reason),
        ...shares('eval.hunter_death_share', HUNTER_DEATH_NAMES, scene.deaths, reason),
    };
}

/**
 * @param {Record<string, any>} world the world at the last tick
 * @returns {{ lives: number, zero: number, kills: number }} the hunters alive at the last tick: how many, how many with no
 *   kill so far, and their kills so far; all 0 for a world without agents
 */
function aliveHunterLives(world) {
    const alive = { lives: 0, zero: 0, kills: 0 };
    if (world.alive === undefined || world.ledgerKills === undefined) {
        return alive;
    }
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1 && world.huntBySpec[world.spec[slot]] === 1) {
            alive.lives += 1;
            alive.zero += world.ledgerKills[slot] === 0 ? 1 : 0;
            alive.kills += world.ledgerKills[slot];
        }
    }
    return alive;
}

/**
 * @param {Record<string, any>} scene the hunter scene
 * @param {Record<string, any>} world the world at the last tick
 * @returns {import('./metrics-stats.js').MetricResult} the share of hunter lives after burn-in with no kill: the deaths,
 *   and each hunter alive at the last tick with its kills so far
 */
function zeroKillShare(scene, world) {
    const alive = aliveHunterLives(world);
    return share(scene.zeroKill + alive.zero, scene.lives + alive.lives, 'no hunter life after burn-in');
}

/**
 * @param {Record<string, any>} scene the hunter scene
 * @param {Record<string, any>} world the world at the last tick
 * @returns {import('./metrics-stats.js').MetricResult} the mean kills of a hunter life after burn-in: the deaths at or
 *   after `BURN_IN_TICKS`, and each hunter alive at the last tick with its kills so far (the lives of `zeroKillShare`)
 */
function settledKillsPerLife(scene, world) {
    const alive = aliveHunterLives(world);
    const lives = scene.lives + alive.lives;
    return lives > 0 ? ok((scene.settledKills + alive.kills) / lives) : none('no hunter life after burn-in');
}

/**
 * @param {Record<string, any>} world the world at the last tick
 * @returns {import('./metrics-stats.js').MetricRecord} the income shares
 */
function incomeMetrics(world) {
    const reason = 'no hunter income';
    const sums = new Float64Array(HUNTER_INCOME_NAMES.length);
    if (world.hunterIncomeBySpec !== undefined) {
        for (let spec = 0; spec < world.hunterIncomeBySpec.length / sums.length; spec++) {
            for (let k = 0; k < sums.length && world.huntBySpec[spec] === 1; k++) {
                sums[k] += world.hunterIncomeBySpec[spec * sums.length + k];
            }
        }
    }
    return shares('eval.hunter_income_share', HUNTER_INCOME_NAMES, sums, reason);
}

/**
 * @param {Record<string, any>} world the world at the last tick
 * @returns {import('./metrics-stats.js').MetricResult} the local share of the hunters alive
 */
function endLocalShare(world) {
    if (world.alive === undefined) {
        return none('no world at the last tick');
    }
    let hunters = 0;
    let local = 0;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1 && world.huntBySpec[world.spec[slot]] === 1) {
            const source = world.birthSource[slot];
            hunters += 1;
            local +=
                source === BIRTH_SOURCE.MATE_HUNTER ||
                source === BIRTH_SOURCE.SPLIT_HUNTER ||
                source === BIRTH_SOURCE.SPEC_FLIP
                    ? 1
                    : 0;
        }
    }
    return share(local, hunters, 'no hunter alive at the last tick');
}

/**
 * @param {Record<string, any>} scene the hunter scene
 * @param {Record<string, any>} world the world at the last tick
 * @returns {import('./metrics-stats.js').MetricRecord} the hunter metrics
 */
export function hunterMetrics(scene, world) {
    return {
        ...deathMetrics(scene),
        'eval.hunter_zero_kill_share': zeroKillShare(scene, world),
        'eval.hunter_kills_per_life_mean_settled': settledKillsPerLife(scene, world),
        ...shares('eval.hunter_birth_source_share', HUNTER_BIRTH_NAMES, scene.births, 'no hunter births'),
        ...incomeMetrics(world),
        ...ageMetrics(scene.age, world),
        'eval.predator_end_local_share': endLocalShare(world),
        'eval.hunter_ticks_last_quarter':
            scene.runTicks > 0 ? ok(scene.quarterTicks) : none('no run length (createObserver runTicks)'),
    };
}
