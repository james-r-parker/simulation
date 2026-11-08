// Ecological guards (hunter-learning.md, Detectors): a hunter that wipes out its prey is not a better world. Sampled at the
// 1000-tick checkpoints after burn-in, from the alive counts of the hunters and of each prey specialisation (one that cannot
// hunt).
//
// - `eval.prey_extinctions`: the count of prey specialisations that go from at least one alive to none between two checkpoints.
//   A specialisation that returns and goes again counts again; the seed frequency is read from the per-seed values.
// - `eval.boom_bust_count`: the count of boom-bust episodes, found by a scan over the checkpoints. The scan tracks the hunters'
//   trough (the lowest count since the last reset, the latest checkpoint on a tie). An episode is three steps, all inside
//   `BOOM_BUST_WINDOW` checkpoints of the trough: the hunters reach at least `BOOM_FACTOR` times the trough (the trough must
//   be at least 1 hunter and the prey at the trough at least 1), then the prey fall to at most `PREY_CRASH` of their level at
//   the trough, then the hunters fall to at most `HUNTER_CRASH` of their peak (the highest count since the trough). An episode
//   counts when the last step completes and the scan restarts from that checkpoint; a window that runs out restarts it at the
//   current checkpoint; a checkpoint with no hunter alive clears the trough, so a hunter population that returns from nothing
//   starts a new trough.
//
// - `eval.prey_summer_min` (higher; mating-edge screen, world-balance T97): the lowest prey count at the checkpoints inside
//   any summer (season index 1 of `SEASONS_PER_YEAR`, each `eraSeasonTicks` long). The mating Allee edge sits near 100 prey, so a
//   seed that keeps more than 100 through summer is clear of it. `null` when no summer checkpoint was sampled (the run is
//   shorter than the first summer, or `eraSeasonTicks` is off).
//
// The first two are `lower` metrics; `null` with a reason when no checkpoint after burn-in was sampled. The series live in a growable
// log and the checkpoint allocates nothing.

import { BURN_IN_TICKS } from './burn-in.js';
import { createLog, ensureRoom } from './growable-log.js';
import { none, ok } from './metrics-stats.js';
import { BASIN_CHECKPOINT_TICKS } from './scene-basin.js';
import { SEASONS_PER_YEAR } from '../sim/eras.js';

/** The hunters must reach this multiple of their trough for a boom. */
export const BOOM_FACTOR = 2;
/** The prey must fall to at most this share of their level at the trough. */
export const PREY_CRASH = 0.5;
/** The hunters must then fall to at most this share of their peak. */
export const HUNTER_CRASH = 0.5;
/** The most checkpoints an episode may span, from the trough to the hunter crash. */
export const BOOM_BUST_WINDOW = 20;

/** The season index of summer in a year of four. */
const SUMMER = 1;

const SEEK = 0;
const PREY = 1;
const HUNT = 2;

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} an empty guard scene: the series of hunter and prey counts, the previous alive count of each
 *   specialisation (-1 before the first checkpoint) and the extinctions counted
 */
export function createGuardScene(config) {
    const specs = Object.keys(config.specialisations).length;
    return {
        log: createLog(['hunters', 'prey']),
        rows: 0,
        counts: new Float64Array(specs),
        previous: new Float64Array(specs).fill(-1),
        extinctions: 0,
        eraSeasonTicks: config.eraSeasonTicks ?? 0,
        summerMin: Infinity,
    };
}

/**
 * Counts the alive agents of each specialisation into the scene's scratch counts, adds the prey specialisations that went
 * from alive to none since the last checkpoint to the extinctions, and remembers the counts.
 * @param {Record<string, any>} scene the guard scene
 * @param {Record<string, any>} world the world
 * @returns {{hunters: number, prey: number}} the hunters and the prey alive
 */
function tally(scene, world) {
    const { counts, previous } = scene;
    counts.fill(0);
    for (let slot = 0; slot < world.alive.length; slot++) {
        counts[world.spec[slot]] += world.alive[slot] === 1 ? 1 : 0;
    }
    let hunters = 0;
    let prey = 0;
    for (let spec = 0; spec < counts.length; spec++) {
        const hunts = world.huntBySpec[spec] === 1;
        hunters += hunts ? counts[spec] : 0;
        prey += hunts ? 0 : counts[spec];
        scene.extinctions += !hunts && previous[spec] > 0 && counts[spec] === 0 ? 1 : 0;
        previous[spec] = counts[spec];
    }
    return { hunters, prey };
}

/**
 * Takes the checkpoint at the world's tick, if it is a 1000-tick checkpoint after burn-in.
 * @param {Record<string, any>} scene the guard scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleGuards(scene, world) {
    if (world.tick < BURN_IN_TICKS || world.tick % BASIN_CHECKPOINT_TICKS !== 0) {
        return;
    }
    const { hunters, prey } = tally(scene, world);
    const row = scene.rows++;
    ensureRoom(scene.log, row);
    scene.log.hunters[row] = hunters;
    scene.log.prey[row] = prey;
    const era = scene.eraSeasonTicks;
    if (era > 0 && Math.floor(world.tick / era) % SEASONS_PER_YEAR === SUMMER) {
        scene.summerMin = Math.min(scene.summerMin, prey);
    }
}

/**
 * @typedef {object} Scan
 * @property {number} trough the checkpoint of the hunters' trough, -1 before there is one
 * @property {number} step `SEEK` (waiting for the boom), `PREY` (waiting for the prey to crash) or `HUNT` (waiting for the
 *   hunters to crash)
 * @property {number} peak the most hunters since the boom
 * @property {number} episodes the episodes completed
 */

/**
 * Takes one checkpoint while seeking a boom: moves the trough, or starts the episode when the hunters have doubled.
 * @param {Scan} scan the scan
 * @param {ArrayLike<number>} hunters the hunters alive at each checkpoint
 * @param {ArrayLike<number>} prey the prey alive at each checkpoint
 * @param {number} t the checkpoint
 * @returns {void}
 */
function seek(scan, hunters, prey, t) {
    const h = hunters[t];
    if (scan.trough < 0 || h <= hunters[scan.trough]) {
        scan.trough = t;
    } else if (h >= BOOM_FACTOR * hunters[scan.trough] && prey[scan.trough] >= 1) {
        scan.step = PREY;
        scan.peak = h;
    }
}

/**
 * Takes one checkpoint after the boom started: the prey crash, then the hunter crash, or the hunter peak.
 * @param {Scan} scan the scan
 * @param {ArrayLike<number>} prey the prey alive at each checkpoint
 * @param {{h: number, t: number}} now the hunters alive at this checkpoint, and the checkpoint
 * @returns {void}
 */
function follow(scan, prey, { h, t }) {
    scan.peak = Math.max(scan.peak, h);
    scan.step = scan.step === PREY && prey[t] <= PREY_CRASH * prey[scan.trough] ? HUNT : scan.step;
}

/**
 * Moves the scan on by one checkpoint.
 * @param {Scan} scan the scan
 * @param {ArrayLike<number>} hunters the hunters alive at each checkpoint
 * @param {ArrayLike<number>} prey the prey alive at each checkpoint
 * @param {number} t the checkpoint
 * @returns {void}
 */
function advance(scan, hunters, prey, t) {
    const h = hunters[t];
    if (scan.step !== SEEK && t - scan.trough > BOOM_BUST_WINDOW) {
        scan.step = SEEK;
        scan.trough = -1;
    }
    if (scan.step === HUNT && h <= HUNTER_CRASH * scan.peak) {
        scan.episodes += 1;
        scan.step = SEEK;
        scan.trough = h === 0 ? -1 : t;
    } else if (h === 0) {
        scan.step = SEEK;
        scan.trough = -1;
    } else if (scan.step === SEEK) {
        seek(scan, hunters, prey, t);
    } else {
        follow(scan, prey, { h, t });
    }
}

/**
 * Counts the boom-bust episodes of two series, by the scan the module header describes. Each of the three steps takes its own
 * checkpoint.
 * @param {ArrayLike<number>} hunters the hunters alive at each checkpoint
 * @param {ArrayLike<number>} prey the prey alive at each checkpoint
 * @returns {number} the episodes found
 */
export function boomBustCount(hunters, prey) {
    /** @type {Scan} */
    const scan = { trough: -1, step: SEEK, peak: 0, episodes: 0 };
    for (let t = 0; t < hunters.length; t++) {
        advance(scan, hunters, prey, t);
    }
    return scan.episodes;
}

/**
 * @param {Record<string, any>} scene the guard scene
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the extinction and boom-bust counts
 */
export function guardMetrics(scene) {
    if (scene.rows === 0) {
        const reason = none('no 1000-tick checkpoint after burn-in');
        return { 'eval.prey_extinctions': reason, 'eval.boom_bust_count': reason };
    }
    return {
        'eval.prey_extinctions': ok(scene.extinctions),
        'eval.boom_bust_count': ok(
            boomBustCount(scene.log.hunters.subarray(0, scene.rows), scene.log.prey.subarray(0, scene.rows)),
        ),
    };
}

/**
 * @param {Record<string, any>} scene the guard scene
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the lowest prey count at a summer checkpoint
 */
export function summerMetrics(scene) {
    if (scene.summerMin === Infinity) {
        return { 'eval.prey_summer_min': none('no summer checkpoint after burn-in') };
    }
    return { 'eval.prey_summer_min': ok(scene.summerMin) };
}
