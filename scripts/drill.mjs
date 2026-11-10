// Drills: plays genomes and the scripted reference through the fixed drills and prints each one's win share and edge over
// random brains (`npm run drill`). Logs every trial at debug level to `.sim/logs/drill-<seed>x<trials>.jsonl`.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeArchive } from '../js/evo/archive-codec.js';
import { DRILLS } from '../js/evo/drill-scenarios.js';
import { DRILL_TRIALS, edgeOf, randomBrains, skipReason } from '../js/evo/drill.js';
import { referenceSubject } from '../js/evo/memory-probe-references.js';
import { createConfig } from '../js/sim/config.js';
import { createSimLog } from '../js/sim/log.js';
import { exitCodeOf, intValue, parseFlags } from './lib/cli-args.mjs';
import { formatTable, reportJson } from './lib/drill-report.mjs';
import { eliteSubjects, fileSubject } from './lib/drill-subjects.mjs';
import { genomeSkipCells } from './lib/skip-cells-report.mjs';
import { createJsonlSink } from './lib/jsonl-sink.mjs';
import { runPool } from './lib/worker-pool.mjs';
import { loadChampions } from './memory-probe.mjs';

const WORKER_URL = new URL('./drill-worker.mjs', import.meta.url);
const EVAL_WORKER_URL = new URL('./eval-worker.mjs', import.meta.url);
/** Ticks of the fresh world `--policy` drills the archive of. */
export const POLICY_TICKS = 20000;
const NAMES = DRILLS.map((d) => d.name);
const USAGE =
    'usage: drill (--champions <dir> | --archive <file> | --policy <name>) [--count <n>] [--drills <a,b>] [--seed <n>] [--trials <n>] [--config <file.json>] [--json] [--out <path>] [--workers <n>]';

/**
 * @typedef {object} DrillArgs
 * @property {string | null} champions a directory of champion files
 * @property {string | null} archive an archive file (`archive-<g>.json`)
 * @property {string | null} policy a registered policy to run for `POLICY_TICKS` and drill the best archive elites of
 * @property {number} count elites drilled with `--policy`
 * @property {string[]} drills the drills to run (default all)
 * @property {number} seed the base seed
 * @property {number} trials trials per drill
 * @property {string | null} config a config overrides file
 * @property {boolean} json whether to print JSON
 * @property {string | null} out a file to write the output to
 * @property {number | undefined} workers pool size
 */

/**
 * @param {string | undefined} value a comma-separated list of drill names
 * @returns {string[]} the names
 * @throws {Error} on an unknown name, listing the known ones
 */
function parseDrills(value) {
    const names = String(value).split(',');
    const bad = names.find((name) => !NAMES.includes(name));
    if (bad !== undefined) {
        throw new Error(`--drills: unknown drill "${bad}"; known: ${NAMES.join(', ')}\n${USAGE}`);
    }
    return names;
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {DrillArgs} parsed options
 * @throws {Error} unless exactly one of `--champions`, `--archive` and `--policy` is given
 */
export function parseArgs(argv) {
    const args = /** @type {DrillArgs} */ (
        parseFlags(argv, {
            valueFlags: {
                '--champions': (v) => ['champions', String(v)],
                '--archive': (v) => ['archive', String(v)],
                '--policy': (v) => ['policy', String(v)],
                '--count': (v, f) => ['count', intValue(f, v, 1, USAGE)],
                '--drills': (v) => ['drills', parseDrills(v)],
                '--seed': (v, f) => ['seed', intValue(f, v, 0, USAGE)],
                '--trials': (v, f) => ['trials', intValue(f, v, 1, USAGE)],
                '--config': (v) => ['config', String(v)],
                '--out': (v) => ['out', String(v)],
                '--workers': (v, f) => ['workers', intValue(f, v, 1, USAGE)],
            },
            booleanFlags: { '--json': 'json' },
            defaults: {
                champions: null,
                archive: null,
                policy: null,
                count: 8,
                drills: NAMES,
                seed: 1,
                trials: DRILL_TRIALS,
                config: null,
                json: false,
                out: null,
                workers: undefined,
            },
            usage: USAGE,
        })
    );
    const sources = [args.champions, args.archive, args.policy].filter((s) => s !== null);
    if (sources.length !== 1) {
        throw new Error(`give exactly one of --champions, --archive and --policy\n${USAGE}`);
    }
    return args;
}

/**
 * @param {DrillArgs} args the options
 * @param {{config: Record<string, any>, log: import('../js/sim/log.js').SimLog}} run the config overrides and the log
 * @returns {Promise<import('../js/evo/memory-probe-run.js').Subject[]>} the genomes to drill
 */
async function genomesOf(args, { config, log }) {
    if (args.champions !== null) {
        return loadChampions(args.champions, { config, log });
    }
    if (args.archive !== null) {
        const json = JSON.parse(readFileSync(args.archive, 'utf8'));
        return eliteSubjects(decodeArchive(json, createConfig(config), log));
    }
    const tasks = [
        {
            seed: args.seed,
            ticks: POLICY_TICKS,
            policy: String(args.policy),
            overrides: config,
            saveChampions: args.count,
        },
    ];
    const [result] = await runPool(tasks, { workerUrl: EVAL_WORKER_URL, workers: 1 });
    return result.champions.map((/** @type {Record<string, any>} */ file) => fileSubject(file, createConfig(config)));
}

/**
 * @param {import('../js/evo/memory-probe-run.js').Subject} subject a subject
 * @param {string | null} reference the reference kind, or null for a genome
 * @returns {Record<string, any>} the subject as a worker task field
 */
function taskSubject(subject, reference) {
    return { name: subject.name, id: subject.id, spec: subject.spec, weights: subject.weights, reference };
}

/**
 * Builds the pool's tasks: one per genome and drill it is not skipped on, the reference per drill and the random brains
 * per drill.
 * @param {DrillArgs} args the options
 * @param {{genomes: import('../js/evo/memory-probe-run.js').Subject[], config: Record<string, any>}} run the genomes and config
 * @returns {{kind: string, label: string, drill: string, index: number, task: Record<string, any>}[]} the tasks in order
 */
function buildTasks(args, { genomes, config }) {
    const base = createConfig(config);
    const common = { seed: args.seed, trials: args.trials, config };
    const tasks = [];
    for (const drill of DRILLS.filter((d) => args.drills.includes(d.name))) {
        const entries = [
            ...genomes.map((g) => ({ kind: 'genome', label: g.name, subject: taskSubject(g, null), live: g })),
            {
                kind: 'reference',
                label: 'memoryless',
                subject: taskSubject(referenceSubject('memoryless'), 'memoryless'),
                live: null,
            },
        ];
        for (const entry of entries) {
            if (entry.live === null || skipReason(drill, entry.live, base) === null) {
                tasks.push({
                    kind: entry.kind,
                    label: entry.label,
                    drill: drill.name,
                    index: -1,
                    task: { drill: drill.name, subject: entry.subject, ...common },
                });
            }
        }
        randomBrains(drill, { config, seed: args.seed }).forEach((brain, index) => {
            tasks.push({
                kind: 'random',
                label: brain.name,
                drill: drill.name,
                index,
                task: { drill: drill.name, subject: taskSubject(brain, null), ...common },
            });
        });
    }
    return tasks;
}

/**
 * Turns the pool's results into one row per genome and the reference.
 * @param {DrillArgs} args the options
 * @param {{genomes: import('../js/evo/memory-probe-run.js').Subject[], tasks: ReturnType<typeof buildTasks>, results: Record<string, any>[], log: import('../js/sim/log.js').SimLog}} run
 *   the genomes, the tasks, their results in order, and the log
 * @returns {import('./lib/drill-report.mjs').DrillRow[]} the rows
 */
function rowsOf(args, { genomes, tasks, results, log }) {
    const labels = [...genomes.map((g) => g.name), 'memoryless'];
    const rows = labels.map((label) => ({
        label: label === 'memoryless' ? 'reference memoryless' : label,
        cells: /** @type {Record<string, any>} */ ({}),
    }));
    for (const name of args.drills) {
        const baselines = tasks.flatMap((t, i) =>
            t.drill === name && t.kind === 'random' ? [results[i].winShare] : [],
        );
        labels.forEach((label, row) => {
            const at = tasks.findIndex((t) => t.drill === name && t.label === label && t.kind !== 'random');
            if (at < 0) {
                rows[row].cells[name] = null;
                return;
            }
            const records = results[at].records ?? [];
            const lossReasons = /** @type {Record<string, number>} */ ({});
            for (const record of records) {
                if (record.won || record.reason === null || record.reason === undefined) {
                    continue;
                }
                lossReasons[record.reason] = (lossReasons[record.reason] ?? 0) + 1;
            }
            const cell = { winShare: results[at].winShare, edge: edgeOf(results[at].winShare, baselines), lossReasons };
            rows[row].cells[name] = cell;
            log.log('info', 'DrillResult', { drill: name, subject: label, winShare: cell.winShare, edge: cell.edge });
        });
    }
    return rows;
}

/**
 * Drills the genomes and the reference on the pool.
 * @param {DrillArgs} args the options (`drills`, `seed`, `trials`, `workers`; the source flags are not read)
 * @param {{genomes: import('../js/evo/memory-probe-run.js').Subject[], config: Record<string, any>, log: import('../js/sim/log.js').SimLog}} run
 *   the genomes, the config overrides and the log
 * @returns {Promise<import('./lib/drill-report.mjs').DrillRow[]>} the rows: a genome per row, then the reference
 */
export async function drillGenomes(args, { genomes, config, log }) {
    const tasks = buildTasks(args, { genomes, config });
    const results = await runPool(
        tasks.map((t) => t.task),
        { workerUrl: WORKER_URL, workers: args.workers },
    );
    for (const record of results.flatMap((result) => result.records)) {
        log.log('debug', 'DrillTrial', record);
    }
    return rowsOf(args, { genomes, tasks, results, log });
}

/**
 * @param {DrillArgs} args the options
 * @param {import('../js/sim/log.js').SimLog} log the log
 * @returns {Promise<{rows: import('./lib/drill-report.mjs').DrillRow[], skip: import('./lib/skip-cells-report.mjs').SkipCellsReport | null}>}
 *   the rows (a genome per row, then the reference) and, for `--champions`, the predators' skip cells (T34)
 */
async function drillRows(args, log) {
    const config = args.config === null ? {} : JSON.parse(readFileSync(args.config, 'utf8'));
    const genomes = await genomesOf(args, { config, log });
    const rows = await drillGenomes(args, { genomes, config, log });
    return { rows, skip: args.champions === null ? null : genomeSkipCells(genomes, createConfig(config)) };
}

/**
 * @param {DrillArgs} args the options
 * @param {{logDir?: string, print?: (line: string) => void}} [io] where the log goes, and the output
 * @returns {Promise<import('./lib/drill-report.mjs').DrillRow[]>} the rows: a genome per row, then the reference
 */
export async function runDrills(args, { logDir = '.sim/logs', print = () => {} } = {}) {
    const path = join(logDir, `drill-${args.seed}x${args.trials}.jsonl`);
    rmSync(path, { force: true });
    const sinkFile = createJsonlSink(path);
    try {
        const { rows, skip } = await drillRows(args, createSimLog(sinkFile.sink, { level: 'debug' }));
        const table = args.json
            ? JSON.stringify({ ...reportJson(args.drills, rows), skipCells: skip?.json ?? null }, null, 2)
            : [...formatTable(args.drills, rows), ...(skip === null ? [] : ['', ...skip.lines])].join('\n');
        print(table);
        if (args.out !== null) {
            writeFileSync(args.out, `${table}\n`);
        }
        return rows;
    } finally {
        await sinkFile.close();
    }
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {{logDir?: string}} [io] where the log goes
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv, io = {}) {
    const code = await exitCodeOf(() => runDrills(parseArgs(argv), { ...io, print: console.log }));
    return code;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
