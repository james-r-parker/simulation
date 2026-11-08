// Hunting skill with age, hunger and experience held apart (hunter-practice.md, Detectors). Every chase the approach
// tracker resolves from burn-in on is logged with the hunter's age and energy at its opening, the number of chases the
// same life had resolved before it, and whether it ended in a catch.
//
// - `eval.hunter_conversion_matched.<band>`: the catch share of the chases opened in the age band, taken inside strata of
//   energy tercile (terciles of the run's logged energies) by prior-chase class (0, 1 to 4, 5 and over) and averaged over
//   the strata with equal weight. A stratum needs `MIN_STRATUM_CHASES` chases to count and the metric `MIN_STRATA` such
//   strata, else it is `null`.
// - `eval.hunter_conversion_by_dose`: over chases opened at ages `DOSE_AGES`, the least-squares slope of the catch (0 or 1)
//   on the number of prior resolved chases in the life, within each energy tercile, averaged over the terciles that have
//   `MIN_STRATUM_CHASES` chases and a spread of prior counts. Positive: a hunter does better after more attempts at the
//   same age and hunger.
//
// Both are `watch` instruments until `eval:power` has rated them. A hunter alive at burn-in starts its prior count at 0
// there, so its earliest counted chases look inexperienced. Observer state outside `worldHash`; per-slot counters, one
// growing log, nothing allocated per tick.

import { createLog, ensureRoom } from './growable-log.js';
import { none, ok } from './metrics-stats.js';
import { CHASE_OUTCOME, CONVERSION_BANDS } from './scene-competence.js';

/** Chases a stratum needs to count. */
export const MIN_STRATUM_CHASES = 5;

/** Strata that must count for a matched conversion. */
export const MIN_STRATA = 3;

/** The ages, `[from, to)`, of the chases the dose slope reads. */
export const DOSE_AGES = Object.freeze([1000, 4000]);

/** The age bands' edges; the same as the bands of `scene-competence.js`. */
const BAND_EDGES = Object.freeze([1000, 2000]);

const TERCILES = 3;
const PRIOR_CLASSES = 3;

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} an empty matched scene: per slot the life's genome id and resolved chases, and the log
 *   of chases (age, energy, prior chases, caught)
 */
export function createMatchedScene(config) {
    const n = config.maxAgents;
    return {
        genome: new Uint32Array(n),
        prior: new Uint32Array(n),
        log: createLog(['age', 'energy', 'prior', 'caught'], 256),
        rows: 0,
    };
}

/**
 * Logs one resolved chase; hand it every chase the approach tracker counts.
 * @param {Record<string, any>} scene the matched scene
 * @param {Record<string, any>} world the world
 * @param {{slot: number, outcome: number, openedTick: number, energy: number}} chase the hunter's slot, the chase's
 *   outcome, the tick it opened and the hunter's energy then
 * @returns {void}
 */
export function noteMatchedChase(scene, world, { slot, outcome, openedTick, energy }) {
    if (scene.genome[slot] !== world.genomeId[slot]) {
        scene.genome[slot] = world.genomeId[slot];
        scene.prior[slot] = 0;
    }
    const row = scene.rows++;
    ensureRoom(scene.log, row);
    const { log } = scene;
    log.age[row] = world.ageTicks[slot] - (world.tick - openedTick);
    log.energy[row] = energy;
    log.prior[row] = scene.prior[slot];
    log.caught[row] = outcome === CHASE_OUTCOME.CAUGHT ? 1 : 0;
    scene.prior[slot] += 1;
}

/**
 * @param {number} age a hunter's age in ticks
 * @returns {number} the index of its band in `CONVERSION_BANDS`
 */
function bandOf(age) {
    if (age < BAND_EDGES[0]) {
        return 0;
    }
    return age < BAND_EDGES[1] ? 1 : 2;
}

/**
 * @param {Record<string, any>} scene the matched scene
 * @returns {Float64Array} the logged energies at the tercile boundaries: two edges
 */
function tercileEdges(scene) {
    const sorted = scene.log.energy.slice(0, scene.rows).sort();
    return Float64Array.of(
        sorted[Math.floor(sorted.length / TERCILES)],
        sorted[Math.floor((2 * sorted.length) / TERCILES)],
    );
}

/**
 * @param {number} energy a logged energy
 * @param {Float64Array} edges the two tercile edges
 * @returns {number} the tercile, 0 to 2
 */
function tercileOf(energy, edges) {
    if (energy < edges[0]) {
        return 0;
    }
    return energy < edges[1] ? 1 : 2;
}

/**
 * @param {number} prior prior resolved chases in the life
 * @returns {number} the class: 0, 1 to 4, or 5 and over
 */
function priorClassOf(prior) {
    if (prior === 0) {
        return 0;
    }
    return prior < 5 ? 1 : 2;
}

/**
 * @param {Record<string, any>} scene the matched scene
 * @returns {Array<import('./metrics-stats.js').MetricResult>} the matched conversion of each band
 */
function matchedByBand(scene) {
    const edges = tercileEdges(scene);
    const cells = TERCILES * PRIOR_CLASSES;
    const chases = new Float64Array(CONVERSION_BANDS.length * cells);
    const caught = new Float64Array(CONVERSION_BANDS.length * cells);
    const { log } = scene;
    for (let row = 0; row < scene.rows; row++) {
        const cell =
            bandOf(log.age[row]) * cells +
            tercileOf(log.energy[row], edges) * PRIOR_CLASSES +
            priorClassOf(log.prior[row]);
        chases[cell] += 1;
        caught[cell] += log.caught[row];
    }
    return CONVERSION_BANDS.map((name, band) => {
        let sum = 0;
        let strata = 0;
        for (let cell = band * cells; cell < (band + 1) * cells; cell++) {
            if (chases[cell] >= MIN_STRATUM_CHASES) {
                sum += caught[cell] / chases[cell];
                strata += 1;
            }
        }
        return strata >= MIN_STRATA
            ? ok(sum / strata)
            : none(`fewer than ${MIN_STRATA} strata with ${MIN_STRATUM_CHASES} chases in the ${name} band`);
    });
}

/**
 * Sums for a least-squares slope of the catch on the prior count, one tercile.
 * @returns {Float64Array} n, sum x, sum y, sum xx, sum xy
 */
function newSums() {
    return new Float64Array(5);
}

/**
 * @param {Float64Array} s the sums of one tercile
 * @returns {number} the slope, or NaN with fewer than `MIN_STRATUM_CHASES` chases or no spread in the prior count
 */
function slopeOf(s) {
    const spread = s[0] * s[3] - s[1] * s[1];
    return s[0] < MIN_STRATUM_CHASES || spread <= 0 ? NaN : (s[0] * s[4] - s[1] * s[2]) / spread;
}

/**
 * @param {Record<string, any>} scene the matched scene
 * @returns {import('./metrics-stats.js').MetricResult} the mean over energy terciles of the catch-on-dose slope
 */
function doseSlope(scene) {
    const edges = tercileEdges(scene);
    const sums = Array.from({ length: TERCILES }, newSums);
    const { log } = scene;
    for (let row = 0; row < scene.rows; row++) {
        if (log.age[row] >= DOSE_AGES[0] && log.age[row] < DOSE_AGES[1]) {
            const s = sums[tercileOf(log.energy[row], edges)];
            const [x, y] = [log.prior[row], log.caught[row]];
            s[0] += 1;
            s[1] += x;
            s[2] += y;
            s[3] += x * x;
            s[4] += x * y;
        }
    }
    const slopes = sums.map(slopeOf).filter((v) => !Number.isNaN(v));
    return slopes.length > 0
        ? ok(slopes.reduce((a, b) => a + b, 0) / slopes.length)
        : none('no energy tercile with enough chases at ages 1000 to 3999 and a spread of prior chases');
}

/**
 * @param {Record<string, any>} scene the matched scene
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the matched conversions and the dose slope
 */
export function matchedMetrics(scene) {
    if (scene.rows === 0) {
        const reason = none('no chase resolved after burn-in');
        return {
            ...Object.fromEntries(CONVERSION_BANDS.map((name) => [`eval.hunter_conversion_matched.${name}`, reason])),
            'eval.hunter_conversion_by_dose': reason,
        };
    }
    const bands = matchedByBand(scene);
    return {
        ...Object.fromEntries(CONVERSION_BANDS.map((name, i) => [`eval.hunter_conversion_matched.${name}`, bands[i]])),
        'eval.hunter_conversion_by_dose': doseSlope(scene),
    };
}
