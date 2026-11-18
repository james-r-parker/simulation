// What `npm run train:exam` reads from a run directory: the last archive's champions, the drill table (twice, for row 1),
// the reflex scores, `crossplay.json`, the league standings and the style bands' matched trials. The verdicts are
// `js/evo/exam.js`; this file only gathers (docs/designs/training-stages.md, The exam).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeArchive } from '../../js/evo/archive-codec.js';
import { exportBestPerStyle } from '../../js/evo/champion-export.js';
import { DRILLS } from '../../js/evo/drill-scenarios.js';
import { drillReadings } from '../../js/evo/gate-readings.js';
import { GENOME_SPECS } from '../../js/evo/genome.js';
import { MATCH_TICKS, validateChampion } from '../../js/evo/league.js';
import { PREDATOR_SPEC } from '../../js/evo/memory-probe-scenarios.js';
import { partitionSeed } from '../../js/evo/partitions.js';
import { REFLEX_CASES } from '../../js/evo/reflex-cases.js';
import { GATE_TRIALS } from '../../js/evo/stage-gate.js';
import { STYLE_DRILL, matchedTrials, pairedSeparation } from '../../js/evo/style-evidence.js';
import { TRAINER_DESCRIPTOR } from '../../js/evo/trainer.js';
import { createConfig, rulesHash } from '../../js/sim/config.js';
import { drillGenomes } from '../drill.mjs';
import { loadLeague, playLeague } from '../league.mjs';
import { scoreGenomes } from '../reflex.mjs';
import { eliteSubjects } from './drill-subjects.mjs';

/**
 * The seed of the exam's drills: the second seed of the validation partition. The gate reads the first, so the exam is
 * not the gate's own read; the sealed release partition replaces it with T23b (`js/evo/partitions.js`).
 */
export const EXAM_SEED = partitionSeed('validation', 1);
/** Trials per champion and drill in the exam: the gate's count (the reflex cases take the same, `REFLEX_TRIALS`). */
export const EXAM_TRIALS = GATE_TRIALS;
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DRILL_NAMES = DRILLS.map((d) => d.name);

/**
 * @typedef {object} LoadedRun
 * @property {string} dir the run directory
 * @property {Readonly<Record<string, any>>} config the world the champions are stamped for (the default world)
 * @property {import('../../js/evo/archive.js').Archive} archive the last archive
 * @property {number} generation the generations it completed
 * @property {Record<string, any> | null} manifest `manifest.json`
 * @property {Record<string, any> | null} crossplay `crossplay.json`
 */

/**
 * @param {string} path a JSON file
 * @returns {any} its contents
 */
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/**
 * @param {string} dir a run directory
 * @param {string} name a file in it
 * @returns {Record<string, any> | null} the parsed file; null when it is not there
 */
const readOptional = (dir, name) => (existsSync(join(dir, name)) ? readJson(join(dir, name)) : null);

/**
 * @param {string} dir a run directory
 * @returns {LoadedRun} the run: its last `archive-<g>.json` decoded as `train:export` does, and its manifest and cross-play
 * @throws {Error} when the directory holds no archive
 */
export function loadRun(dir) {
    const generations = readdirSync(dir)
        .map((name) => /^archive-(\d+)\.json$/.exec(name))
        .flatMap((match) => (match === null ? [] : [Number(match[1])]));
    if (generations.length === 0) {
        throw new Error(`${dir} holds no archive-<g>.json (run npm run train first)`);
    }
    const config = createConfig({});
    const json = readJson(join(dir, `archive-${Math.max(...generations)}.json`));
    const archive = decodeArchive({ ...json, rulesHash: rulesHash(config) }, config, undefined, TRAINER_DESCRIPTOR);
    return {
        dir,
        config,
        archive,
        generation: json.generation ?? 0,
        manifest: readOptional(dir, 'manifest.json'),
        crossplay: readOptional(dir, 'crossplay.json'),
    };
}

/**
 * @typedef {object} DrillTable
 * @property {import('../../js/evo/memory-probe-run.js').Subject[]} subjects the champions, in drill-row order
 * @property {Record<string, any>[]} rows a row per champion, then the reference
 * @property {Record<string, import('../../js/evo/gate-readings.js').DrillReading>} readings pooled over the champions
 */

/**
 * @param {LoadedRun} run the run
 * @param {{workers?: number, trials: number, log: import('../../js/sim/log.js').SimLog}} io the pool size, the trials per
 *   champion and drill, and the log
 * @returns {Promise<DrillTable>} every drill on the run's champions, on the exam seed
 */
export async function drillTable(run, { workers, trials, log }) {
    const subjects = eliteSubjects(run.archive);
    const args = /** @type {any} */ ({ drills: DRILL_NAMES, seed: EXAM_SEED, trials, workers });
    const rows = await drillGenomes(args, { genomes: subjects, config: {}, log });
    return { subjects, rows, readings: drillReadings(/** @type {any} */ (rows), subjects.length, DRILL_NAMES) };
}

/**
 * @param {LoadedRun} run the run
 * @returns {{name: string, error: string | null}[]} each champion file the run exports and the error `validateChampion`
 *   gives it (null: it loads)
 */
export function championChecks(run) {
    const files = exportBestPerStyle(run.archive, run.config, { label: 'exam' });
    return files.map((file) => {
        try {
            validateChampion(file, run.config);
            return { name: file.name, error: null };
        } catch (error) {
            return { name: file.name, error: /** @type {Error} */ (error).message };
        }
    });
}

/**
 * @param {DrillTable} table its drill table
 * @param {{workers?: number, trials: number, log: import('../../js/sim/log.js').SimLog}} io the pool size, the trials per
 *   case and the log
 * @returns {Promise<{genomes: {name: string, score: number | null, edge: number | null}[], trials: number}>} each
 *   champion's reflex score and edge (null: no case for its specialisation)
 */
export async function reflexScores(table, { workers, trials, log }) {
    const args = /** @type {any} */ ({
        cases: REFLEX_CASES.map((c) => c.name),
        seed: 1,
        trials,
        level: 'info',
        workers,
    });
    const { rows } = await scoreGenomes(args, { genomes: table.subjects, config: {}, log });
    const genomes = rows.map(({ label, row }) => ({ name: label, score: row?.score ?? null, edge: row?.edge ?? null }));
    return { genomes, trials };
}

/**
 * Plays each champion the run exports against the admitted league champions.
 * @param {LoadedRun} run the run
 * @param {{workers?: number, logDir: string, league?: {path: string, root: string, ticks: number}}} io the pool size, the
 *   log directory and the league (default `evals/league.json`, the repository root and `MATCH_TICKS`)
 * @returns {Promise<{name: string, elo: number, games: number, wins: number, draws: number, losses: number}[] | null>} each
 *   champion's standing; null when no champion is admitted to play against
 */
export async function leagueStandings(run, { workers, logDir, league: own }) {
    const where = own ?? { path: join(ROOT, 'evals', 'league.json'), root: ROOT, ticks: MATCH_TICKS };
    if (loadLeague(where.path, where.root).league.champions.length === 0) {
        return null;
    }
    const out = join(run.dir, 'exam-champions');
    mkdirSync(out, { recursive: true });
    const standings = [];
    for (const file of exportBestPerStyle(run.archive, run.config, { label: 'exam' })) {
        const candidate = join(out, `${file.name}.json`);
        writeFileSync(candidate, `${JSON.stringify(file)}\n`);
        const { elo, games, wins, draws, losses } = await playLeague(
            /** @type {any} */ ({ candidate, admit: false, workers: workers ?? null, ticks: where.ticks }),
            { logDir, leaguePath: where.path, root: where.root },
        );
        standings.push({ name: file.name, elo, games, wins, draws, losses });
    }
    return standings;
}

/**
 * @param {import('../../js/evo/memory-probe-run.js').Subject | undefined} subject a band's predator champion
 * @param {DrillTable} table the drill table
 * @param {readonly string[]} named the drills a passed stage's gate names
 * @returns {import('../../js/evo/style-evidence.js').BandReading | null} the champion's reading: the least `edgeLow` over the
 *   named drills it ran and its win share low bound on the style drill; null for a band with no champion
 */
function bandReading(subject, table, named) {
    if (subject === undefined) {
        return null;
    }
    const at = table.subjects.indexOf(subject);
    const names = [...new Set([...named, STYLE_DRILL])];
    const readings = drillReadings(/** @type {any} */ ([table.rows[at], table.rows[table.subjects.length]]), 1, names);
    const edges = named.flatMap((name) =>
        readings[name]?.edgeLow === null || readings[name]?.edgeLow === undefined ? [] : [readings[name].edgeLow],
    );
    return {
        edgeLow: edges.length === 0 ? null : Math.min(...edges),
        winShareLow: readings[STYLE_DRILL]?.winShareLow ?? null,
    };
}

/**
 * The style bands: which style bands each specialisation fills, each predator band's drill reading, and the bands' paired
 * separation on matched `STYLE_DRILL` trials.
 * @param {DrillTable} table the drill table
 * @param {readonly string[]} named the drills a passed stage's gate names
 * @param {number} trials the matched trials per band
 * @returns {{filled: Record<string, string[]>, bands: {low: any, high: any}, separation: ReturnType<typeof pairedSeparation>}}
 */
export function styleReadings(table, named, trials) {
    /** @type {Record<string, string[]>} */
    const filled = {};
    for (const subject of table.subjects) {
        const spec = GENOME_SPECS[/** @type {number} */ (subject.spec)];
        filled[spec] = [...(filled[spec] ?? []), subject.style ?? '?'];
    }
    const predators = table.subjects.filter((s) => s.spec === PREDATOR_SPEC);
    const low = predators.find((s) => s.style === 'low');
    const high = predators.find((s) => s.style === 'high');
    const matched = matchedTrials({ low: low ?? null, high: high ?? null }, { seed: EXAM_SEED, trials });
    return {
        filled,
        bands: { low: bandReading(low, table, named), high: bandReading(high, table, named) },
        separation: pairedSeparation(matched.low, matched.high),
    };
}
