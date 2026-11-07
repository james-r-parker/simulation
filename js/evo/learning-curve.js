// The learning curve (training.md, Trainer "Checkpoints" and "Plateau"): one row per checkpoint of a training run, and
// the plateau finder that reads the rows. A checkpoint only reads the archive. Pure: no files, no clock.

import { CELLS, ELITE, archiveCv, coverage, lowerBound, placeOf, qdScore } from './archive.js';
import { GENOME_SPECS } from './genome.js';

/** The eval metrics a curve row carries, averaged over the checkpoint's eval seeds. */
export const CURVE_METRICS = Object.freeze([
    'eval.food_energy_per_1k',
    'eval.births_per_1k',
    'eval.fed_median_lifespan',
    'eval.catch_rate',
    'eval.escape_rate',
]);
/** Checkpoints a series is read over by `findPlateau`. */
export const PLATEAU_WINDOW = 3;
/** The rise over the window below which a series counts as flat. */
export const PLATEAU_RISE = 0.05;
/** The series `findPlateau` reads, by their key in a curve row. */
export const PLATEAU_SERIES = Object.freeze(['qdScore', 'eval.food_energy_per_1k', 'drillEdge']);

/**
 * @typedef {object} CurvePointInput
 * @property {number} generation generations completed
 * @property {string} stage the stage of the last generation
 * @property {number} trainTicks ticks trained so far (episode ticks summed over all episodes)
 * @property {number} wallSeconds wall time since the run began
 * @property {import('./archive.js').Archive} archive the archive at the checkpoint
 * @property {Record<string, number | null>} drillEdges each drill's mean edge over the champions it applies to (null: none)
 * @property {Record<string, number | null>} metrics `CURVE_METRICS` averaged over the eval seeds (null: no value)
 */

/**
 * @param {import('./archive.js').Archive} archive the archive
 * @returns {Record<string, number | null>} each specialisation's best elite lower bound (null: no tested elite)
 */
export function bestLowerBounds(archive) {
    const cv = archiveCv(archive);
    /** @type {Record<string, number | null>} */
    const out = {};
    GENOME_SPECS.forEach((name, spec) => {
        let best = -Infinity;
        for (let cell = 0; cell < CELLS; cell++) {
            const place = placeOf(spec, cell, ELITE);
            best = archive.occupied[place] === 1 ? Math.max(best, lowerBound(archive, place, cv)) : best;
        }
        out[name] = Number.isFinite(best) ? best : null;
    });
    return out;
}

/**
 * @param {Record<string, number | null>} edges each drill's mean edge
 * @returns {number | null} the mean over the drills that have one (null when none does)
 */
export function meanDrillEdge(edges) {
    const values = Object.values(edges).filter((v) => v !== null);
    return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * @param {CurvePointInput} input the checkpoint
 * @returns {Record<string, any>} the curve row (JSON-able): `generation`, `stage`, `trainTicks`, `wallSeconds`,
 *   `coverage`, `qdScore`, `best` (each specialisation's best lower bound), `drill` (each drill's mean edge),
 *   `drillEdge` (their mean) and each of `CURVE_METRICS`
 */
export function curvePoint({ generation, stage, trainTicks, wallSeconds, archive, drillEdges, metrics }) {
    return {
        generation,
        stage,
        trainTicks,
        wallSeconds,
        coverage: coverage(archive),
        qdScore: qdScore(archive),
        best: bestLowerBounds(archive),
        drill: drillEdges,
        drillEdge: meanDrillEdge(drillEdges),
        ...Object.fromEntries(CURVE_METRICS.map((name) => [name, metrics[name] ?? null])),
    };
}

/**
 * @param {Record<string, any>} point a curve row
 * @param {string} series a key in `PLATEAU_SERIES`
 * @returns {number | null} the series' value
 */
function valueOf(point, series) {
    const v = point[series];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * @param {Record<string, any>[]} points the curve rows in order
 * @param {number} i the index of the checkpoint to test
 * @param {string} series a key in `PLATEAU_SERIES`
 * @returns {boolean} whether the series rose by less than `PLATEAU_RISE` of its value at `i` (of at least a tiny floor,
 *   so a rise from 0 is a rise) over the next `PLATEAU_WINDOW` checkpoints; false when either value is missing
 */
function flatAfter(points, i, series) {
    const before = valueOf(points[i], series);
    const after = valueOf(points[i + PLATEAU_WINDOW], series);
    return before !== null && after !== null && after - before < PLATEAU_RISE * Math.max(Math.abs(before), 1e-9);
}

/**
 * @param {Record<string, any>[]} points the curve rows in order
 * @returns {{index: number, generation: number} | null} the first checkpoint after which `qdScore`,
 *   `eval.food_energy_per_1k` and the mean drill edge each rise by less than 5% over the next 3 checkpoints; null for "no
 *   plateau yet" (also when fewer than 4 checkpoints exist or a series has no value)
 */
export function findPlateau(points) {
    for (let i = 0; i + PLATEAU_WINDOW < points.length; i++) {
        if (PLATEAU_SERIES.every((series) => flatAfter(points, i, series))) {
            return { index: i, generation: points[i].generation };
        }
    }
    return null;
}
