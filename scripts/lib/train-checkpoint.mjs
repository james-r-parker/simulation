// A training checkpoint: picks the champions the archive would export (without writing them), runs every drill on them
// and a few eval worlds seeded from the archive, and returns the curve row. It only reads the archive.
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DRILLS } from '../../js/evo/drill-scenarios.js';
import { drillReadings } from '../../js/evo/gate-readings.js';
import { CURVE_METRICS, curvePoint } from '../../js/evo/learning-curve.js';
import { snapshotArchive } from '../../js/evo/archive-snapshot.js';
import { drillGenomes } from '../drill.mjs';
import { eliteSubjects } from './drill-subjects.mjs';
import { readJson } from './train-state.mjs';
import { runPool } from './worker-pool.mjs';

const WORKER_URL = new URL('../train-worker.mjs', import.meta.url);
const SEEDS_URL = new URL('../../evals/seeds.json', import.meta.url);
/** The eval seeds of a checkpoint: `evals/seeds.json` entries 33 to 36 (indices 32 to 35). */
export const EVAL_SEED_INDICES = Object.freeze([32, 33, 34, 35]);
/** Ticks of each checkpoint eval world. */
export const EVAL_TICKS = 50000;
/** The drill seed of a checkpoint's curve edges. */
export const DRILL_SEED = 1;
/** The drill seed of a gate checkpoint (the validation namespace, `js/evo/partitions.js`). */
export const GATE_SEED = 1_000_000;

/**
 * @param {readonly Record<string, any>[]} rows the drill table's rows (genomes then the reference)
 * @param {number} genomeCount how many leading rows are genomes
 * @returns {Record<string, number | null>} each drill's mean edge over the genomes it ran on (null: it ran on none)
 */
export function drillEdges(rows, genomeCount) {
    const genomes = rows.slice(0, genomeCount);
    return Object.fromEntries(
        DRILLS.map((drill) => {
            const edges = genomes.flatMap((row) => (row.cells[drill.name] ? [row.cells[drill.name].edge] : []));
            return [drill.name, edges.length === 0 ? null : edges.reduce((a, b) => a + b, 0) / edges.length];
        }),
    );
}

/** @param {readonly Record<string, any>[]} rows drill table rows @param {number} genomeCount leading champions @returns {Record<string, Record<string, number> | null>} summed loss reasons by drill */
export function drillLossReasons(rows, genomeCount) {
    const genomes = rows.slice(0, genomeCount);
    return Object.fromEntries(
        DRILLS.map(({ name }) => {
            const counts = /** @type {Record<string, number>} */ ({});
            for (const row of genomes) {
                for (const [reason, n] of Object.entries(row.cells[name]?.lossReasons ?? {})) {
                    counts[reason] = (counts[reason] ?? 0) + n;
                }
            }
            return [name, Object.keys(counts).length === 0 ? null : counts];
        }),
    );
}

/**
 * @param {readonly Record<string, number | null>[]} results the metrics of each eval episode
 * @returns {Record<string, number | null>} each curve metric's mean over the episodes that have a value
 */
export function averageMetrics(results) {
    return Object.fromEntries(
        CURVE_METRICS.map((name) => {
            const values = results.flatMap((m) => (m[name] === null || m[name] === undefined ? [] : [m[name]]));
            return [name, values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length];
        }),
    );
}

/**
 * @typedef {object} CheckpointRun
 * @property {import('../../js/evo/archive.js').Archive} archive the archive (read only)
 * @property {import('./train-state.mjs').StageInfo} stage the stage of the last generation
 * @property {{generation: number, trainTicks: number, wallSeconds: number}} progress generations completed, ticks trained
 *   and wall seconds so far
 * @property {{workers: number | undefined, evalTicks: number, drillTrials: number, gate?: {seed: number, trials: number} | null}} options
 *   the pool size and the sizes; `gate` reads the drills on the gate's seed and trial count and returns gate readings
 * @property {import('../../js/sim/log.js').SimLog} log the run's log
 */

/**
 * Runs the drills on the archive's champions.
 * @param {CheckpointRun} run the checkpoint
 * @returns {Promise<{edges: Record<string, number | null>, reasons: Record<string, Record<string, number> | null>, readings: Record<string, any> | null}>}
 *   each drill's mean edge and summed loss reasons, and the gate's drill readings when the checkpoint is a gate's
 */
async function drillPart({ archive, options, log }) {
    const genomes = eliteSubjects(archive);
    const names = DRILLS.map((d) => d.name);
    const gate = options.gate ?? null;
    if (genomes.length === 0) {
        const readings = gate === null ? null : { drill: drillReadings([], 0, names) };
        return { edges: drillEdges([], 0), reasons: drillLossReasons([], 0), readings };
    }
    const args = /** @type {any} */ ({
        drills: names,
        seed: gate?.seed ?? DRILL_SEED,
        trials: gate?.trials ?? options.drillTrials,
        workers: options.workers,
    });
    const rows = await drillGenomes(args, { genomes, config: {}, log });
    return {
        edges: drillEdges(rows, genomes.length),
        reasons: drillLossReasons(rows, genomes.length),
        readings: gate === null ? null : { drill: drillReadings(rows, genomes.length, names) },
    };
}

/**
 * Plays the eval worlds, each started from the archive, and averages the curve metrics.
 * @param {CheckpointRun} run the checkpoint
 * @returns {Promise<Record<string, number | null>>} the mean of each curve metric
 */
async function evalPart({ archive, stage, options }) {
    const seeds = readJson(fileURLToPath(SEEDS_URL));
    const snapshot = snapshotArchive(archive);
    const tasks = EVAL_SEED_INDICES.map((i) => ({
        seed: seeds[i],
        overrides: stage.overrides,
        snapshot,
        ticks: options.evalTicks,
        offerFromTick: Infinity,
        metrics: CURVE_METRICS,
    }));
    const results = await runPool(tasks, { workerUrl: WORKER_URL, workers: options.workers });
    return averageMetrics(results.map((r) => r.metrics));
}

/**
 * @param {CheckpointRun} run the checkpoint
 * @returns {Promise<{point: Record<string, any>, readings: Record<string, any> | null}>} the curve row (not yet written)
 *   and, for a gate checkpoint, the gate readings (`drill.<name>.<reading>`)
 */
export async function runCheckpoint(run) {
    const { edges, reasons, readings } = await drillPart(run);
    const metrics = await evalPart(run);
    const point = curvePoint({
        ...run.progress,
        stage: run.stage.name,
        archive: run.archive,
        drillEdges: edges,
        drillLossReasons: reasons,
        metrics,
    });
    return { point, readings };
}

/**
 * @param {string} dir the output directory
 * @param {Record<string, any>} point a curve row
 * @returns {void} appends the row to `<dir>/curve.jsonl`
 */
export function appendCurveRow(dir, point) {
    appendFileSync(join(dir, 'curve.jsonl'), `${JSON.stringify(point)}\n`);
}
