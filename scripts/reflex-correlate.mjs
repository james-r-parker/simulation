// The reflex validation study (`node scripts/reflex-correlate.mjs`, brain-reflex-tests.md, Validation): does a genome's
// reflex pass share predict its drill edge, its archive lower bound and its league Elo? Collects genomes from the league,
// training exports, archives and random brains; scores them on the reflex cases (case seeds 101 to 116) and the drills;
// prints Spearman's rho with a cluster BCa interval per pair and per outcome, and the verdict of the decision rule.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { decodeArchive } from '../js/evo/archive-codec.js';
import { CELLS, ELITE, archiveCv, lowerBound, placeOf, refOf } from '../js/evo/archive.js';
import { GENOME_SPECS } from '../js/evo/genome.js';
import { createConfig } from '../js/sim/config.js';
import { brainLayout } from '../js/sim/brain-layout.js';
import { createRng, fork } from '../js/sim/rng.js';
import { randomWeights } from '../js/evo/mutation.js';
import { createSimLog } from '../js/sim/log.js';
import { exitCodeOf, intValue, parseFlags } from './lib/cli-args.mjs';
import { fileSubject } from './lib/drill-subjects.mjs';
import { clusterBca, partialSpearman, spearman } from './lib/reflex-stats.mjs';
import { drillGenomes } from './drill.mjs';
import { loadLeague } from './league.mjs';
import { scoreGenomes } from './reflex.mjs';
import { REFLEX_CASES } from '../js/evo/reflex-cases.js';

/** The case and drill pairs the prediction names: a case's pass share against its drills' mean edge. */
export const PAIRS = Object.freeze([
    { case: 'approach-food', drills: ['food-ahead', 'food-behind'] },
    { case: 'flee-threat', drills: ['hunter-closing'] },
    { case: 'bite-discrimination', drills: ['prey-too-big'] },
    { case: 'approach-prey', drills: ['prey-ahead'] },
]);
/** The prediction: rho at least this on a drill pair, and at least `OUTCOME_RHO` against the archive bound and Elo. */
export const PAIR_RHO = 0.4;
export const OUTCOME_RHO = 0.2;
/** Pairs that must pass for the reflex tier to be worth building on. */
export const PAIRS_NEEDED = 3;
const DRILL_NAMES = PAIRS.flatMap((p) => p.drills);
const SEEDS_URL = new URL('../evals/reflex-seeds.json', import.meta.url);
const USAGE =
    'usage: reflex-correlate [--league <file>] [--train-dir <dir>] [--archives <dir>] [--champions <dir,dir>] [--random <n>] [--seeds <n>] [--drill-trials <n>] [--resamples <n>] [--workers <n>] [--json] [--out <path>]';

/**
 * @typedef {object} StudyRow one genome of the study
 * @property {string} label the genome's name
 * @property {string} group the run or lineage it comes from: what the interval resamples
 * @property {number} spec its specialisation index
 * @property {Record<string, number>} reflex pass share by case, the mean over the case seeds
 * @property {number} score its reflex score (the mean over its specialisation's cases)
 * @property {Record<string, number>} drill drill edge by drill name
 * @property {number | null} bound its archive lower bound, when it came from an archive with samples
 * @property {number | null} elo its league Elo, when it is a league champion
 */

/**
 * @typedef {object} Relation one correlation
 * @property {number} n the genomes in it
 * @property {number} rho Spearman's rho
 * @property {number} low the lower end of the cluster BCa interval
 * @property {number} high the upper end
 * @property {number} partial the rho with the specialisation held fixed
 * @property {boolean} passes whether rho reaches the prediction's bar and the interval excludes 0
 */

/**
 * @param {StudyRow[]} rows the rows that have both values
 * @param {{x: (row: StudyRow) => number, y: (row: StudyRow) => number, bar: number, resamples: number}} how the two
 *   variables, the rho the prediction asks for and the resample count
 * @returns {Relation} the correlation of the two variables over the rows
 */
function relate(rows, { x, y, bar, resamples }) {
    const stat = (/** @type {StudyRow[]} */ part) => spearman(part.map(x), part.map(y));
    const { estimate, low, high } = clusterBca(rows, { stat, cluster: (row) => row.group, resamples });
    const partial = partialSpearman(
        rows.map(x),
        rows.map(y),
        rows.map((row) => row.spec),
    );
    return { n: rows.length, rho: estimate, low, high, partial, passes: estimate >= bar && low > 0 };
}

/**
 * @param {readonly number[]} values numbers
 * @returns {number} their mean
 */
const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;

/**
 * The study: each case pass share against its drills' mean edge (rows of the case's specialisation that ran them), then
 * the reflex score against the archive lower bound and the league Elo.
 * @param {readonly StudyRow[]} rows the genomes
 * @param {{resamples?: number}} [options] the resample count (default 2000)
 * @returns {{pairs: (Relation & {case: string, drills: string[]})[], outcomes: (Relation & {name: string})[], verdict: 'both' | 'filter only' | 'drop'}}
 *   the correlations and the verdict of the decision rule
 */
export function correlate(rows, { resamples = 2000 } = {}) {
    const pairs = PAIRS.map((pair) => {
        const spec = /** @type {import('../js/evo/reflex-stage.js').ReflexCase} */ (
            REFLEX_CASES.find((c) => c.name === pair.case)
        ).spec;
        const usable = rows.filter((r) => r.spec === spec && pair.drills.every((d) => Number.isFinite(r.drill[d])));
        const edge = (/** @type {StudyRow} */ r) => mean(pair.drills.map((d) => r.drill[d]));
        return {
            ...pair,
            drills: [...pair.drills],
            ...relate(usable, { x: (r) => r.reflex[pair.case], y: edge, bar: PAIR_RHO, resamples }),
        };
    });
    /** @type {[string, (row: StudyRow) => number | null][]} */
    const outcomeOf = [
        ['archive lower bound', (r) => r.bound],
        ['league Elo', (r) => r.elo],
    ];
    const outcomes = outcomeOf.map(([name, value]) => {
        const usable = rows.filter((r) => Number.isFinite(value(r)) && Number.isFinite(r.score));
        const y = (/** @type {StudyRow} */ r) => /** @type {number} */ (value(r));
        return { name, ...relate(usable, { x: (r) => r.score, y, bar: OUTCOME_RHO, resamples }) };
    });
    return { pairs, outcomes, verdict: verdictOf(pairs, outcomes) };
}

/**
 * The decision rule: both uses when at least 3 of 4 pairs pass and both outcomes pass; the gate alone when only the
 * pairs pass; otherwise the tier is dropped.
 * @param {readonly {passes: boolean}[]} pairs the drill pairs
 * @param {readonly {passes: boolean}[]} outcomes the archive bound and Elo
 * @returns {'both' | 'filter only' | 'drop'} the verdict
 */
export function verdictOf(pairs, outcomes) {
    if (pairs.filter((p) => p.passes).length < PAIRS_NEEDED) {
        return 'drop';
    }
    return outcomes.every((o) => o.passes) ? 'both' : 'filter only';
}

/**
 * @typedef {import('../js/evo/memory-probe-run.js').Subject & {group: string, bound: number | null, elo: number | null}} StudySubject
 */

/**
 * @param {import('../js/evo/archive.js').Archive} archive a decoded archive
 * @param {string} group the run label
 * @returns {StudySubject[]} every occupied elite with its lower bound (null for a seeded one nobody has tested)
 */
function archiveSubjects(archive, group) {
    const cv = archiveCv(archive);
    return GENOME_SPECS.flatMap((_, spec) =>
        Array.from({ length: CELLS }, (__, cell) => placeOf(spec, cell, ELITE))
            .filter((place) => archive.occupied[place] === 1)
            .map((place) => {
                const elite = refOf(archive, place);
                const bound = lowerBound(archive, place, cv);
                return {
                    name: `${group}-${GENOME_SPECS[spec]}-cell${elite.cell}`,
                    id: elite.id,
                    spec,
                    weights: Float32Array.from(elite.row),
                    act: null,
                    group,
                    bound: Number.isFinite(bound) ? bound : null,
                    elo: null,
                };
            }),
    );
}

/**
 * @param {string} dir a directory
 * @returns {string[]} the .json files directly in it, sorted (none when it does not exist)
 */
function jsonIn(dir) {
    return existsSync(dir)
        ? readdirSync(dir)
              .filter((n) => n.endsWith('.json') && n !== 'index.json')
              .sort()
        : [];
}

/**
 * @typedef {object} Sources where the study's genomes come from
 * @property {string | null} league the league file
 * @property {string | null} trainDir a directory whose sub-directories hold training exports (`champions/*.json`)
 * @property {string[]} archives directories of archive files
 * @property {string[]} champions directories of champion files
 * @property {number} random how many random brains to add, half of each of foragers and predators
 */

/**
 * @param {string} leaguePath the league file
 * @param {Readonly<Record<string, any>>} config the config the champion files are checked against
 * @returns {StudySubject[]} the league's champions, each with its Elo and its own group
 */
function leagueSubjects(leaguePath, config) {
    const { league, files } = loadLeague(leaguePath, dirname(dirname(leaguePath)));
    return league.champions.map((/** @type {Record<string, any>} */ entry, /** @type {number} */ i) => ({
        ...fileSubject(files[i], config),
        name: entry.name,
        group: `league:${entry.name}`,
        bound: null,
        elo: entry.elo,
    }));
}

/**
 * Collects the genomes: league champions (their Elo), champion files, archive elites (their lower bound) and random
 * brains. A file that does not fit the layout is skipped and counted.
 * @param {Sources} sources where to look
 * @param {Readonly<Record<string, any>>} config the config the files are checked against
 * @returns {{subjects: StudySubject[], skipped: string[]}} the genomes and the files skipped, with the reason
 */
export function collectSubjects(sources, config) {
    /** @type {StudySubject[]} */
    const subjects = [];
    /** @type {string[]} */
    const skipped = [];
    const add = (/** @type {string} */ file, /** @type {() => StudySubject[]} */ read) => {
        try {
            subjects.push(...read());
        } catch (error) {
            skipped.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
        }
    };
    if (sources.league !== null && existsSync(sources.league)) {
        subjects.push(...leagueSubjects(sources.league, config));
    }
    const trainRuns = sources.trainDir !== null && existsSync(sources.trainDir) ? readdirSync(sources.trainDir) : [];
    const championDirs = [
        ...sources.champions,
        ...trainRuns.map((run) => join(/** @type {string} */ (sources.trainDir), run, 'champions')),
    ];
    for (const dir of championDirs.filter((d) => existsSync(d) && statSync(d).isDirectory())) {
        for (const name of jsonIn(dir)) {
            const file = join(dir, name);
            add(file, () => [
                { ...fileSubject(JSON.parse(readFileSync(file, 'utf8')), config), group: dir, bound: null, elo: null },
            ]);
        }
    }
    for (const dir of sources.archives) {
        for (const name of jsonIn(dir)) {
            const file = join(dir, name);
            add(file, () => {
                const json = JSON.parse(readFileSync(file, 'utf8'));
                if (!Array.isArray(json.cells)) {
                    throw new Error('not an archive');
                }
                return archiveSubjects(
                    decodeArchive(
                        json,
                        config,
                        createSimLog(() => {}, { level: 'error' }),
                    ),
                    file,
                );
            });
        }
    }
    subjects.push(...randomSubjects(sources.random, config));
    return { subjects, skipped };
}

/**
 * @param {number} count how many random brains
 * @param {Readonly<Record<string, any>>} config the config
 * @returns {StudySubject[]} `count` random brains, alternating forager and predator, each its own group
 */
function randomSubjects(count, config) {
    const layout = brainLayout(config);
    return Array.from({ length: count }, (_, i) => {
        const weights = new Float32Array(layout.weightCount);
        randomWeights(weights, layout, fork(createRng(1), `reflex-correlate:random:${i}`), config.leakGeneStart);
        return {
            name: `random-${i}`,
            id: 0,
            spec: i % 2,
            weights,
            act: null,
            group: `random-${i}`,
            bound: null,
            elo: null,
        };
    });
}

/**
 * @typedef {object} CorrelateArgs
 * @property {string | null} league
 * @property {string | null} trainDir
 * @property {string[]} archives
 * @property {string[]} champions
 * @property {number} random
 * @property {number} seeds how many of the 16 validation case seeds to score
 * @property {number} drillTrials trials per drill
 * @property {number} resamples
 * @property {number | undefined} workers
 * @property {boolean} json
 * @property {string | null} out
 */

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {CorrelateArgs} parsed options
 */
export function parseArgs(argv) {
    const list = (/** @type {string | undefined} */ v) => String(v).split(',').filter(Boolean);
    return /** @type {CorrelateArgs} */ (
        parseFlags(argv, {
            valueFlags: {
                '--league': (v) => ['league', String(v)],
                '--train-dir': (v) => ['trainDir', String(v)],
                '--archives': (v) => ['archives', list(v)],
                '--champions': (v) => ['champions', list(v)],
                '--random': (v, f) => ['random', intValue(f, v, 0, USAGE)],
                '--seeds': (v, f) => ['seeds', intValue(f, v, 1, USAGE)],
                '--drill-trials': (v, f) => ['drillTrials', intValue(f, v, 1, USAGE)],
                '--resamples': (v, f) => ['resamples', intValue(f, v, 100, USAGE)],
                '--workers': (v, f) => ['workers', intValue(f, v, 1, USAGE)],
                '--out': (v) => ['out', String(v)],
            },
            booleanFlags: { '--json': 'json' },
            defaults: {
                league: 'evals/league.json',
                trainDir: '.sim/train',
                archives: ['evals/baselines'],
                champions: [],
                random: 32,
                seeds: 16,
                drillTrials: 32,
                resamples: 2000,
                workers: undefined,
                json: false,
                out: null,
            },
            usage: USAGE,
        })
    );
}

/**
 * Scores the genomes on the reflex cases over the validation seeds and on the drills the pairs name.
 * @param {StudySubject[]} subjects the genomes
 * @param {{workers: number | undefined, config: Record<string, any>, seeds: number, drillTrials: number}} run the pool
 *   size, the config overrides, how many validation seeds and the trials per drill
 * @returns {Promise<StudyRow[]>} one row per genome
 */
async function measure(subjects, { workers, config, seeds: seedCount, drillTrials }) {
    const seeds = /** @type {number[]} */ (JSON.parse(readFileSync(SEEDS_URL, 'utf8')).validation).slice(0, seedCount);
    const log = createSimLog(() => {}, { level: 'error' });
    /** @type {import('./lib/reflex-report.mjs').ReflexReportRow[][]} */
    const perSeed = [];
    for (const seed of seeds) {
        const args = { cases: REFLEX_CASES.map((c) => c.name), seed, trials: 16, level: 'error', workers };
        perSeed.push((await scoreGenomes(/** @type {any} */ (args), { genomes: subjects, config, log })).rows);
    }
    const drillArgs = { drills: DRILL_NAMES, seed: 1, trials: drillTrials, workers };
    const drills = await drillGenomes(/** @type {any} */ (drillArgs), { genomes: subjects, config, log });
    return subjects.map((subject, i) => {
        const names = Object.keys(perSeed[0][i].row?.cases ?? {});
        const reflex = Object.fromEntries(
            names.map((n) => [n, mean(perSeed.map((rows) => /** @type {any} */ (rows[i].row).cases[n].passShare))]),
        );
        const drill = Object.fromEntries(
            DRILL_NAMES.flatMap((d) =>
                drills[i].cells[d] === null || drills[i].cells[d] === undefined ? [] : [[d, drills[i].cells[d].edge]],
            ),
        );
        const score = names.length === 0 ? Number.NaN : mean(names.map((n) => reflex[n]));
        return {
            label: subject.name,
            group: subject.group,
            spec: /** @type {number} */ (subject.spec),
            reflex,
            score,
            drill,
            bound: subject.bound,
            elo: subject.elo,
        };
    });
}

/**
 * @param {ReturnType<typeof correlate>} result the study's result
 * @returns {string[]} the report lines: a row per pair and per outcome, then the verdict
 */
export function formatStudy(result) {
    const fmt = (/** @type {Relation} */ r) =>
        `n ${r.n}  rho ${r.rho.toFixed(2)}  [${r.low.toFixed(2)}, ${r.high.toFixed(2)}]  partial ${r.partial.toFixed(2)}  ${r.passes ? 'pass' : 'fail'}`;
    return [
        ...result.pairs.map((p) => `${p.case} vs ${p.drills.join('+')}: ${fmt(p)}`),
        ...result.outcomes.map((o) => `reflex score vs ${o.name}: ${fmt(o)}`),
        `verdict: ${result.verdict}`,
    ];
}

/**
 * @param {CorrelateArgs} args the options
 * @param {{print?: (line: string) => void}} [io] the output
 * @returns {Promise<ReturnType<typeof correlate>>} the study's result
 */
export async function runStudy(args, { print = () => {} } = {}) {
    const config = {};
    const { subjects, skipped } = collectSubjects(args, createConfig(config));
    for (const line of skipped) {
        print(`skipped ${line}`);
    }
    const rows = await measure(subjects, {
        workers: args.workers,
        config,
        seeds: args.seeds,
        drillTrials: args.drillTrials,
    });
    const result = correlate(rows, { resamples: args.resamples });
    const text = args.json ? JSON.stringify({ rows, ...result }, null, 2) : formatStudy(result).join('\n');
    print(text);
    if (args.out !== null) {
        writeFileSync(args.out, `${text}\n`);
    }
    return result;
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {(line: string) => void} [print] the output
 * @returns {Promise<number>} the process exit code
 */
export function main(argv, print = console.log) {
    return exitCodeOf(() => runStudy(parseArgs(argv), { print }));
}

if (import.meta.main) {
    process.exitCode = await main(process.argv.slice(2));
}
