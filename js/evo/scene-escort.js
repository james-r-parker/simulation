// The defender's escort distance (docs/designs/role-budget.md, T25): how far a defender stands from the caller a hunter closes
// on, read in the live world so it can be set against the calculator's `escortGap` (`js/evo/role-budget-escort.js`). A caller
// is a forager, reproducer or scout (not a hunter, not a defender). A hunter closes when a bite episode opens on a caller after
// burn-in: it is alive, `bittenTimer` reads `BITTEN_THIS_TICK` and it had no open episode (an episode closes `ESCAPE_TICKS` after
// its last bite, or when the caller dies or its slot is freed, as `scene-defender.js` tracks them).
//
// At the opening the nearest alive defender is found by centre-to-centre distance in the sim's own plane (`world.x`, `world.y`,
// no wrap, as `inJaws` and `territory.js` measure), and two readings are kept: the distance in px and the ratio of it to
// `caller size + defender size * (1 + ESCORT_CLEARANCE)`, the live bodies' `world.size`. A ratio of 1 is where the calculator
// stands the defender. An opening with no defender alive is counted apart and read as neither.
//
// - `eval.defender_escort_distance` (watch): the median distance in px.
// - `eval.defender_escort_ratio` (watch): the median ratio.
//
// The medians come from fixed-bin histograms made once in `create`: distance in 1 px bins up to the world's diagonal, ratio in
// 0.02 bins up to `RATIO_CAP`, each with an overflow bin; the median is the centre of the bin the middle reading falls in
// (within half a bin of the exact one, and the cap for an overflow). Detectors only, never fitness. Nothing is allocated per tick.

import { EVENT } from '../sim/events.js';
import { ESCAPE_TICKS } from '../sim/merit-state.js';
import { SPEC } from '../sim/specs.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { none, ok } from './metrics-stats.js';
import { BITTEN_THIS_TICK } from './observer-intent-episode.js';
import { ESCORT_CLEARANCE } from './role-budget-escort.js';

/** The distance histogram's bin width (px); its cap is the world's diagonal, so no reading overflows (a 1000 px cap held 10 of
 * 32 seed medians at the defaults). */
export const DISTANCE_BIN = 1;
/** The ratio histogram's bin width and cap; a reading at or above the cap lands in the overflow bin. */
export const RATIO_BIN = 0.02;
export const RATIO_CAP = 500;

const NO_DEFENDER = 'no bite episode opened on a caller with a defender alive after burn-in';

/**
 * @param {number} bin the bin width
 * @param {number} cap the cap
 * @returns {Uint32Array} an empty histogram: `cap / bin` bins and one overflow bin
 */
const histogram = (bin, cap) => new Uint32Array(Math.round(cap / bin) + 1);

/**
 * @param {Uint32Array} counts a histogram
 * @param {number} value a reading
 * @param {number} bin the bin width
 * @returns {void}
 */
function addReading(counts, value, bin) {
    counts[Math.min(counts.length - 1, Math.floor(value / bin))] += 1;
}

/**
 * @param {Uint32Array} counts a histogram
 * @param {number} bin the bin width
 * @returns {number | null} the median: the centre of the bin the middle reading falls in (the lower middle of an even count),
 *   or null when empty
 */
export function histogramMedian(counts, bin) {
    let total = 0;
    for (let i = 0; i < counts.length; i++) {
        total += counts[i];
    }
    if (total === 0) {
        return null;
    }
    const target = Math.ceil(total / 2);
    let at = 0;
    let seen = counts[0];
    while (seen < target) {
        at += 1;
        seen += counts[at];
    }
    return (at + 0.5) * bin;
}

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {number} the world's diagonal in px, rounded up: the farthest two bodies can stand apart
 */
function diagonal(config) {
    if (!(config.worldWidth > 0 && config.worldHeight > 0)) {
        throw new Error('scene-escort: the config needs worldWidth and worldHeight');
    }
    return Math.ceil(Math.sqrt(config.worldWidth * config.worldWidth + config.worldHeight * config.worldHeight));
}

/**
 * @param {Readonly<Record<string, any>>} config the world's config (`maxAgents`, `worldWidth`, `worldHeight`)
 * @returns {Record<string, any>} an empty escort scene: per slot the open episode and its last bite tick, the two histograms,
 *   and the openings with and without a defender alive
 */
export function createEscortScene(config) {
    const n = config.maxAgents;
    return {
        open: new Uint8Array(n),
        lastBite: new Float64Array(n),
        distance: histogram(DISTANCE_BIN, diagonal(config)),
        ratio: histogram(RATIO_BIN, RATIO_CAP),
        read: 0,
        undefended: 0,
    };
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot a slot
 * @returns {boolean} whether it is alive and a caller (a forager, reproducer or scout)
 */
function isCaller(world, slot) {
    const spec = world.spec[slot];
    return world.alive[slot] === 1 && world.huntBySpec[spec] !== 1 && spec !== SPEC.DEFENDER;
}

/**
 * Reads the nearest alive defender to a caller whose episode just opened and files the two readings.
 * @param {Record<string, any>} scene the escort scene
 * @param {Record<string, any>} world the world after the step
 * @param {number} caller the caller's slot
 * @returns {void}
 */
function readOpening(scene, world, caller) {
    let best = -1;
    let bestSq = Infinity;
    for (let d = 0; d < scene.open.length; d++) {
        if (world.alive[d] === 1 && world.spec[d] === SPEC.DEFENDER) {
            const dx = world.x[d] - world.x[caller];
            const dy = world.y[d] - world.y[caller];
            const sq = dx * dx + dy * dy;
            if (sq < bestSq) {
                bestSq = sq;
                best = d;
            }
        }
    }
    if (best < 0) {
        scene.undefended += 1;
        return;
    }
    const distance = Math.sqrt(bestSq);
    scene.read += 1;
    addReading(scene.distance, distance, DISTANCE_BIN);
    addReading(scene.ratio, distance / (world.size[caller] + world.size[best] * (1 + ESCORT_CLEARANCE)), RATIO_BIN);
}

/**
 * Advances the scene one tick; call it once per tick after the step. Nothing is read before burn-in.
 * @param {Record<string, any>} scene the escort scene
 * @param {Record<string, any>} world the world after the step
 * @returns {void}
 */
export function tickEscort(scene, world) {
    if (world.tick < BURN_IN_TICKS) {
        return;
    }
    for (let s = 0; s < scene.open.length; s++) {
        if (!isCaller(world, s)) {
            continue;
        }
        if (world.bittenTimer[s] === BITTEN_THIS_TICK) {
            if (scene.open[s] === 0) {
                scene.open[s] = 1;
                readOpening(scene, world, s);
            }
            scene.lastBite[s] = world.tick;
        } else if (scene.open[s] === 1 && world.tick - scene.lastBite[s] >= ESCAPE_TICKS) {
            scene.open[s] = 0;
        }
    }
}

/**
 * @param {Record<string, any>} scene the escort scene
 * @returns {import('./metrics-stats.js').MetricRecord} the median escort distance and ratio
 */
export function escortMetrics(scene) {
    if (scene.read === 0) {
        return {
            'eval.defender_escort_distance': none(NO_DEFENDER),
            'eval.defender_escort_ratio': none(NO_DEFENDER),
        };
    }
    return {
        'eval.defender_escort_distance': ok(/** @type {number} */ (histogramMedian(scene.distance, DISTANCE_BIN))),
        'eval.defender_escort_ratio': ok(/** @type {number} */ (histogramMedian(scene.ratio, RATIO_BIN))),
    };
}

/** @type {import('./observer-detectors.js').Detector} */
export const escortDetector = {
    name: 'escort',
    modules: ['js/evo/scene-escort.js'],
    create: (config) => createEscortScene(config),
    onTick: (scene, world) => tickEscort(scene, world),
    on: {
        AGENT_DIED: (scene, world, o) => {
            scene.open[world.events.data[o + EVENT.AGENT_DIED.SLOT]] = 0;
        },
    },
    onSlotFree: (scene, slot) => {
        scene.open[slot] = 0;
    },
    metrics: (scene) => escortMetrics(scene),
};
