// Hunting competence detectors (hunter-learning.md, Detectors). They do not depend on survival: each has the hunters that never
// kill, or never hunt, in its denominator.
//
// - Kill conversion by age. A chase is the tracker's (`scene-approach.js`): it opens at the first closing sighting of prey and
//   resolves caught, escaped or given up. The tracker calls `noteChase` for each resolved chase from burn-in on, and the chase
//   is binned by the hunter's age at its opening (`ageTicks` minus the ticks since it opened). A chase cut short by the hunter's
//   death, or whose victim dies of another cause, never resolves, so it is dropped as there.
//   `eval.hunter_kill_conversion_by_age.<band>` is caught over resolved chases in the band (`under1k`: age below 1000, `1k-2k`:
//   1000 to 1999, `over2k`: 2000 and over); `eval.hunter_chases_by_age.<band>` is the count it rests on.
// - Time to first kill. Every hunter born after burn-in is an observation: the event is its first deliberate kill (a `HunterKill`
//   with kills so far 1); a hunter that dies without one, or is alive at the last tick without one, is censored at its age.
//   `eval.hunter_first_kill_km_median` is the Kaplan-Meier median (`null`, `median not reached`, while the curve stays above 0.5)
//   and `eval.hunter_first_kill_rmst` the restricted mean up to `2 x juvenileTicks`, always defined once a hunter was born.
//
// Observer state outside `worldHash`; nothing is allocated per tick.

import { EVENT_TYPE } from '../sim/events.js';
import { createLog, ensureRoom } from './growable-log.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { kaplanMeier } from './kaplan-meier.js';
import { none, ok, share } from './metrics-stats.js';

/** The kill-conversion age bands, in order, and the ages at which the second and third begin. */
export const CONVERSION_BANDS = Object.freeze(['under1k', '1k-2k', 'over2k']);
const BAND_EDGES = Object.freeze([1000, 2000]);

/** The outcome of a resolved chase, as `noteChase` takes it. */
export const CHASE_OUTCOME = Object.freeze({ CAUGHT: 0, ESCAPED: 1, GAVE_UP: 2 });

const HORIZON_JUVENILE_WINDOWS = 2;
const PENDING = 0;
const DONE = 1;

/** The direction of each metric of this module. */
/** @type {Readonly<Record<string, string>>} */
export const COMPETENCE_DIRECTIONS = Object.freeze({
    ...Object.fromEntries(
        CONVERSION_BANDS.map((name) => [
            `eval.hunter_kill_conversion_by_age.${name}`,
            name === '1k-2k' ? 'higher' : 'watch',
        ]),
    ),
    ...Object.fromEntries(CONVERSION_BANDS.map((name) => [`eval.hunter_chases_by_age.${name}`, 'watch'])),
    'eval.hunter_first_kill_km_median': 'lower',
    'eval.hunter_first_kill_rmst': 'lower',
    'eval.hunter_independent_kill_share': 'higher',
});

/**
 * @param {Readonly<Record<string, any>>} config the world's config (`juvenileTicks`)
 * @returns {Record<string, any>} an empty competence scene: caught and resolved chases per age band, the deliberate kills and
 *   those of an independent hunter, and the first-kill observations (`log` rows of time and event, `state` PENDING or DONE) of the hunters born after burn-in, by genome id
 */
export function createCompetenceScene(config) {
    return {
        horizon: HORIZON_JUVENILE_WINDOWS * config.juvenileTicks,
        caught: new Float64Array(CONVERSION_BANDS.length),
        chases: new Float64Array(CONVERSION_BANDS.length),
        log: createLog(['time', 'event', 'state']),
        rows: 0,
        rowOf: new Map(),
        kills: 0,
        independentKills: 0,
    };
}

/**
 * @param {number} age a hunter's age in ticks
 * @returns {number} the index of its band in `CONVERSION_BANDS`
 */
function bandOf(age) {
    return age < BAND_EDGES[0] ? 0 : age < BAND_EDGES[1] ? 1 : 2;
}

/**
 * Notes one resolved chase, binned by the hunter's age at the chase's opening.
 * @param {Record<string, any>} scene the competence scene
 * @param {Record<string, any>} world the world
 * @param {{slot: number, outcome: number, openedTick: number}} chase the hunter's slot, a `CHASE_OUTCOME` and the tick the
 *   chase opened
 * @returns {void}
 */
export function noteChase(scene, world, { slot, outcome, openedTick }) {
    const band = bandOf(world.ageTicks[slot] - (world.tick - openedTick));
    scene.chases[band] += 1;
    scene.caught[band] += outcome === CHASE_OUTCOME.CAUGHT ? 1 : 0;
}

/**
 * Starts an observation for a hunter born after burn-in.
 * @param {Record<string, any>} scene the competence scene
 * @param {Record<string, any>} world the world
 * @param {number} slot the child's slot
 * @returns {void}
 */
export function noteCompetenceBirth(scene, world, slot) {
    if (world.tick < BURN_IN_TICKS || world.huntBySpec[world.spec[slot]] !== 1) {
        return;
    }
    const row = scene.rows++;
    ensureRoom(scene.log, row);
    scene.log.state[row] = PENDING;
    scene.rowOf.set(world.genomeId[slot], row);
}

/**
 * Closes a hunter's observation if it is still open.
 * @param {Record<string, any>} scene the competence scene
 * @param {{genomeId: number, time: number, event: number}} end the hunter, its age, and 1 for a first kill or 0 for a censoring
 * @returns {void}
 */
function closeObservation(scene, { genomeId, time, event }) {
    const row = scene.rowOf.get(genomeId);
    if (row !== undefined && scene.log.state[row] === PENDING) {
        scene.log.time[row] = time;
        scene.log.event[row] = event;
        scene.log.state[row] = DONE;
    }
}

/**
 * Notes a `HunterKill` record (fields 2 to 5: genome id, age, kills so far, the dependent bit): the kill joins the independent
 * tally unless the bit is set, and the first kill closes the observation with the event.
 * @param {Record<string, any>} scene the competence scene
 * @param {Float64Array} d the event ring data
 * @param {number} o the record offset
 * @returns {void}
 */
function noteCompetenceKill(scene, d, o) {
    scene.kills += 1;
    scene.independentKills += d[o + 5] === 1 ? 0 : 1;
    if (d[o + 4] === 1) {
        closeObservation(scene, { genomeId: d[o + 2], time: d[o + 3], event: 1 });
    }
}

/**
 * Notes a `HunterLedger` record (fields 2 and 3: genome id, age): a hunter that died without a kill is censored at its age,
 * and its observation ends.
 * @param {Record<string, any>} scene the competence scene
 * @param {Float64Array} d the event ring data
 * @param {number} o the record offset
 * @returns {void}
 */
function noteCompetenceDeath(scene, d, o) {
    closeObservation(scene, { genomeId: d[o + 2], time: d[o + 3], event: 0 });
    scene.rowOf.delete(d[o + 2]);
}

/**
 * Notes one event record when it is a hunter's first kill or death.
 * @param {Record<string, any>} scene the competence scene
 * @param {Float64Array} d the event ring data
 * @param {number} o the record offset
 * @returns {void}
 */
export function noteCompetenceRecord(scene, d, o) {
    if (d[o] === EVENT_TYPE.HUNTER_KILL) {
        noteCompetenceKill(scene, d, o);
    } else if (d[o] === EVENT_TYPE.HUNTER_LEDGER) {
        noteCompetenceDeath(scene, d, o);
    }
}

/**
 * @param {Record<string, any>} scene the competence scene
 * @param {Record<string, any>} world the world at the last tick; one without agents leaves the open observations out
 * @returns {{times: Float64Array, events: Uint8Array}} the closed observations, and the open ones of the hunters alive at the
 *   last tick censored at their age
 */
function observations(scene, world) {
    const times = new Float64Array(scene.rows);
    const events = new Uint8Array(scene.rows);
    let count = 0;
    for (let row = 0; row < scene.rows; row++) {
        if (scene.log.state[row] === DONE) {
            times[count] = scene.log.time[row];
            events[count] = scene.log.event[row];
            count += 1;
        }
    }
    for (let slot = 0; world.alive !== undefined && slot < world.alive.length; slot++) {
        const row = world.alive[slot] === 1 ? scene.rowOf.get(world.genomeId[slot]) : undefined;
        if (row !== undefined && scene.log.state[row] === PENDING) {
            times[count] = world.ageTicks[slot];
            count += 1;
        }
    }
    return { times: times.subarray(0, count), events: events.subarray(0, count) };
}

/**
 * @param {Record<string, any>} scene the competence scene
 * @param {Record<string, any>} world the world at the last tick
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the first-kill time metrics
 */
function firstKillMetrics(scene, world) {
    const { times, events } = observations(scene, world);
    if (times.length === 0) {
        const reason = none('no hunter born after burn-in');
        return { 'eval.hunter_first_kill_km_median': reason, 'eval.hunter_first_kill_rmst': reason };
    }
    const km = kaplanMeier(times, events, scene.horizon);
    return {
        'eval.hunter_first_kill_km_median': km.median === null ? none('median not reached') : ok(km.median),
        'eval.hunter_first_kill_rmst': ok(km.rmst),
    };
}

/**
 * @param {Record<string, any>} scene the competence scene
 * @param {Record<string, any>} world the world at the last tick
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the competence metrics
 */
export function competenceMetrics(scene, world) {
    const reason = 'no chase opened in the band';
    return {
        ...Object.fromEntries(
            CONVERSION_BANDS.map((name, i) => [
                `eval.hunter_kill_conversion_by_age.${name}`,
                share(scene.caught[i], scene.chases[i], reason),
            ]),
        ),
        ...Object.fromEntries(
            CONVERSION_BANDS.map((name, i) => [
                `eval.hunter_chases_by_age.${name}`,
                scene.chases[i] > 0 ? ok(scene.chases[i]) : none(reason),
            ]),
        ),
        ...firstKillMetrics(scene, world),
        'eval.hunter_independent_kill_share': share(scene.independentKills, scene.kills, 'no deliberate kill'),
    };
}
