// Hunter age and source detectors (hunter-learning.md T2): when in a life hunters kill, and who dies young. Fed by the sim's
// `HunterKill` (one per deliberate kill: the killer's age and kills so far) and `HunterLedger` (one per hunter death) records,
// and by the hunters alive at the last tick, whose lives are counted to their end age (censored lives included).
//
// - `eval.hunter_first_kill_age`: the median age at a hunter's first deliberate kill, over hunters that killed. Survivor-biased
//   (a fall can mean fewer hunters kill at all), so it is read beside the censored time of `scene-competence.js`, never alone.
// - `eval.hunter_kill_rate_by_age.<band>`: kills per 1,000 life ticks in the band: `juvenile` below `juvenileTicks`, `young`
//   below 4 x `juvenileTicks`, `adult` beyond.
// - `eval.hunter_juvenile_death_share`: the share of hunter deaths with an age below `juvenileTicks`.
// - `eval.hunter_kill_rate_by_source.<source>`: kills per 1,000 life ticks by birth source (`HUNTER_BIRTH_NAMES`).
//
// All are observer state outside `worldHash`; a death or a kill appends nothing larger than a row of a growable log.

import { BIRTH_SOURCE } from '../sim/hunter-ledger.js';
import { createLog, ensureRoom } from './growable-log.js';
import { bySuffix, none, ok, per1k, quantile, share } from './metrics-stats.js';

/** The hunter birth sources the metrics name, in order. */
export const HUNTER_BIRTH_NAMES = Object.freeze([
    'mate-hunter-parent',
    'split-hunter-parent',
    'spec-flip',
    'floor',
    'initial',
]);

/** @type {Record<number, number>} */
export const BIRTH_INDEX = {};
BIRTH_INDEX[BIRTH_SOURCE.MATE_HUNTER] = 0;
BIRTH_INDEX[BIRTH_SOURCE.SPLIT_HUNTER] = 1;
BIRTH_INDEX[BIRTH_SOURCE.SPEC_FLIP] = 2;
BIRTH_INDEX[BIRTH_SOURCE.FLOOR] = 3;
BIRTH_INDEX[BIRTH_SOURCE.INITIAL] = 4;

/** The age bands of the kill rate, in order; `young` ends at `1 + YOUNG_SPAN` times `juvenileTicks`. */
export const AGE_BAND_NAMES = Object.freeze(['juvenile', 'young', 'adult']);
const YOUNG_SPAN = 3;

/**
 * @param {number} juvenileTicks the juvenile window in ticks (`config.juvenileTicks`)
 * @returns {Record<string, any>} an empty age scene
 */
export function createAgeScene(juvenileTicks) {
    return {
        juvenileTicks,
        firstKill: createLog(['age']),
        firstKills: 0,
        bandKills: new Float64Array(AGE_BAND_NAMES.length),
        bandTicks: new Float64Array(AGE_BAND_NAMES.length),
        sourceKills: new Float64Array(HUNTER_BIRTH_NAMES.length),
        sourceTicks: new Float64Array(HUNTER_BIRTH_NAMES.length),
        deaths: 0,
        juvenileDeaths: 0,
    };
}

/**
 * @param {number} age a hunter's age in ticks
 * @param {number} juvenileTicks the juvenile window
 * @returns {number} the index of its age band in `AGE_BAND_NAMES`
 */
function bandOf(age, juvenileTicks) {
    return age < juvenileTicks ? 0 : age < (1 + YOUNG_SPAN) * juvenileTicks ? 1 : 2;
}

/**
 * Adds the ticks a life of `age` spent in each band.
 * @param {Float64Array} bandTicks the ticks per band
 * @param {number} juvenileTicks the juvenile window
 * @param {number} age the life's age in ticks
 * @returns {void}
 */
function addLife(bandTicks, juvenileTicks, age) {
    const youngEnd = (1 + YOUNG_SPAN) * juvenileTicks;
    bandTicks[0] += Math.min(age, juvenileTicks);
    bandTicks[1] += Math.max(0, Math.min(age, youngEnd) - juvenileTicks);
    bandTicks[2] += Math.max(0, age - youngEnd);
}

/**
 * Notes one `HunterKill` record: the kill joins its age band, and a first kill joins the first-kill ages.
 * @param {Record<string, any>} scene the age scene
 * @param {Float64Array} d the event ring data
 * @param {number} o the record offset
 * @returns {void}
 */
export function noteAgeKill(scene, d, o) {
    scene.bandKills[bandOf(d[o + 3], scene.juvenileTicks)] += 1;
    if (d[o + 4] === 1) {
        ensureRoom(scene.firstKill, scene.firstKills);
        scene.firstKill.age[scene.firstKills++] = d[o + 3];
    }
}

/**
 * Notes one `HunterLedger` record: the life's ticks per band and source, its kills by source, and a juvenile death.
 * @param {Record<string, any>} scene the age scene
 * @param {Float64Array} d the event ring data
 * @param {number} o the record offset
 * @returns {void}
 */
export function noteAgeDeath(scene, d, o) {
    const age = d[o + 3];
    const packed = d[o + 4];
    addLife(scene.bandTicks, scene.juvenileTicks, age);
    const source = BIRTH_INDEX[packed % 8];
    if (source !== undefined) {
        scene.sourceTicks[source] += age;
        scene.sourceKills[source] += Math.floor(packed / 64);
    }
    scene.deaths += 1;
    scene.juvenileDeaths += age < scene.juvenileTicks ? 1 : 0;
}

/**
 * Adds the hunters alive at the last tick to the given life totals, at their end age.
 * @param {Record<string, any>} world the world at the last tick
 * @param {{juvenileTicks: number, bandTicks: Float64Array, sourceTicks: Float64Array, sourceKills: Float64Array}} totals
 *   the totals to add to
 * @returns {void}
 */
function addAlive(world, totals) {
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] !== 1 || world.huntBySpec[world.spec[slot]] !== 1) {
            continue;
        }
        const age = world.ageTicks[slot];
        addLife(totals.bandTicks, totals.juvenileTicks, age);
        const source = BIRTH_INDEX[world.birthSource[slot]];
        if (source !== undefined) {
            totals.sourceTicks[source] += age;
            totals.sourceKills[source] += world.ledgerKills[slot];
        }
    }
}

/**
 * @param {Record<string, any>} scene the age scene
 * @param {Record<string, any>} world the world at the last tick; one without agents leaves the alive hunters out
 * @returns {import('./metrics-stats.js').MetricRecord} the age and source metrics
 */
export function ageMetrics(scene, world) {
    const totals = {
        juvenileTicks: scene.juvenileTicks,
        bandTicks: Float64Array.from(scene.bandTicks),
        sourceTicks: Float64Array.from(scene.sourceTicks),
        sourceKills: Float64Array.from(scene.sourceKills),
    };
    if (world.alive !== undefined) {
        addAlive(world, totals);
    }
    const first = scene.firstKills > 0 ? ok(quantile(scene.firstKill.age.subarray(0, scene.firstKills), 0.5)) : null;
    return {
        'eval.hunter_first_kill_age': first ?? none('no hunter made a deliberate kill'),
        'eval.hunter_juvenile_death_share': share(scene.juvenileDeaths, scene.deaths, 'no hunter deaths'),
        ...bySuffix('eval.hunter_kill_rate_by_age', AGE_BAND_NAMES, (i) =>
            per1k(scene.bandKills[i], totals.bandTicks[i]),
        ),
        ...bySuffix('eval.hunter_kill_rate_by_source', HUNTER_BIRTH_NAMES, (i) =>
            per1k(totals.sourceKills[i], totals.sourceTicks[i]),
        ),
    };
}
