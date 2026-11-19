// The exam of a training run's champion set (`npm run train:exam -- --run <dir> [--replicates <dir,dir>]`;
// docs/designs/training-stages.md, The exam): prints ten rows and writes `<dir>/exam.json`. Rows 1 to 5, 8 and 9 need no
// target world; rows 6 and 7 read the world reports and the saved champions given by flags (`not run`, with the command that feeds them, until given) and row 10 is the user's watch. Logs
// `ExamRow` per row to `.sim/logs/exam-<run>.jsonl`. A detector: nothing here reaches fitness or selection.
import { rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    diverseExamRow,
    drillExamRow,
    crossplayExamRow,
    judgeSet,
    leagueExamRow,
    namedDrills,
    notRun,
    reflexExamRow,
    replicatedExamRow,
    validRow,
} from '../js/evo/exam.js';
import { seedlessConfig } from '../js/evo/report.js';
import { configHash, createConfig } from '../js/sim/config.js';
import { inheritedExamRow, scenesExamRow } from '../js/evo/exam-target.js';
import { createSimLog } from '../js/sim/log.js';
import { exitCodeOf, intValue, parseFlags } from './lib/cli-args.mjs';
import {
    EXAM_SEED,
    EXAM_TRIALS,
    championChecks,
    drillTable,
    leagueStandings,
    loadRun,
    reflexScores,
    styleReadings,
} from './lib/exam-readings.mjs';
import { descendantShares, drillShares, readKeepReport, readWorldReport } from './lib/exam-world.mjs';
import { createJsonlSink } from './lib/jsonl-sink.mjs';
import { logRunConfig } from './lib/run-config.mjs';

const USAGE =
    'usage: train:exam --run <dir> [--replicates <dir,dir>] [--world-before <report.json> --world-after <report.json> --keep-rule-report <compare.json>] [--descendants <dir>] [--trials <n>] [--workers <n>]';

/**
 * @typedef {object} ExamArgs
 * @property {string} run the run directory
 * @property {string[]} replicates the run directories of the other training-seed offsets
 * @property {string | null} worldBefore row 6: the live policy's eval report (32 seeds x 200000 ticks)
 * @property {string | null} worldAfter row 6: the `champions-v1` eval report on the same seeds
 * @property {string | null} keepRuleReport row 6: `eval:compare --keep-rule --json` output on 64 seeds
 * @property {string | null} descendants row 7: a `--save-champions` directory of the `champions-v1` world run
 * @property {number} trials trials per champion and drill, and per reflex case (default `EXAM_TRIALS`, the gate's 64)
 * @property {number | undefined} workers pool size, default `defaultWorkers()`
 */

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {ExamArgs} parsed options
 * @throws {Error} without `--run`
 */
export function parseArgs(argv) {
    const args = /** @type {ExamArgs} */ (
        parseFlags(argv, {
            valueFlags: {
                '--run': (v) => ['run', String(v)],
                '--replicates': (v) => ['replicates', String(v).split(',').filter(Boolean)],
                '--world-before': (v) => ['worldBefore', String(v)],
                '--world-after': (v) => ['worldAfter', String(v)],
                '--keep-rule-report': (v) => ['keepRuleReport', String(v)],
                '--descendants': (v) => ['descendants', String(v)],
                '--trials': (v, f) => ['trials', intValue(f, v, 1, USAGE)],
                '--workers': (v, f) => ['workers', intValue(f, v, 1, USAGE)],
            },
            defaults: {
                run: null,
                replicates: [],
                worldBefore: null,
                worldAfter: null,
                keepRuleReport: null,
                descendants: null,
                trials: EXAM_TRIALS,
                workers: undefined,
            },
            usage: USAGE,
        })
    );
    if (args.run === null) {
        throw new Error(`--run is required\n${USAGE}`);
    }
    return args;
}

/**
 * Rows 3 and 4 of one run: the drills named by the gates of its passed stages, and its cross-play.
 * @param {import('./lib/exam-readings.mjs').LoadedRun} run the run
 * @param {import('./lib/exam-readings.mjs').DrillTable} table its drill table
 * @param {number} trials the trials the table ran
 * @returns {{row3: import('../js/evo/exam.js').ExamRow, row4: import('../js/evo/exam.js').ExamRow, named: string[]}} the rows
 *   and the named drills
 */
function rowsThreeAndFour(run, table, trials) {
    const named = namedDrills(run.manifest?.stages ?? []);
    return {
        row3: drillExamRow({ readings: table.readings, named, trials }),
        row4: crossplayExamRow(/** @type {any} */ (run.crossplay), run.dir),
        named,
    };
}

/**
 * @param {readonly import('../js/evo/exam.js').ExamRow[]} rows the rows
 * @returns {string[]} one line per row: number, name, verdict and what to know
 */
export function formatRows(rows) {
    return rows.map((r) => {
        const note = r.reason === undefined ? '' : ` - ${r.reason}`;
        const command = r.command === undefined ? '' : ` (${r.command})`;
        return `${String(r.row).padStart(2)}  ${r.name.padEnd(11)} ${r.verdict.padEnd(9)}${note}${command}`;
    });
}

/**
 * Runs the exam on a run and its replicates.
 * @param {ExamArgs} args the options
 * @param {{logDir?: string, print?: (line: string) => void, league?: {path: string, root: string, ticks: number}}} [io]
 *   where the log goes, the output and, for a test, the league file, its root and the ticks per game
 * @returns {Promise<{rows: import('../js/evo/exam.js').ExamRow[], good: boolean, open: number[]}>} the ten rows and
 *   whether the set is good
 */
export async function runExam(args, { logDir = '.sim/logs', print = () => {}, league } = {}) {
    const path = join(logDir, `exam-${basename(resolve(args.run))}.jsonl`);
    rmSync(path, { force: true });
    const sinkFile = createJsonlSink(path);
    try {
        const log = createSimLog(sinkFile.sink, { level: 'info' });
        const result = await examine(args, { log, logDir, league });
        for (const row of result.rows) {
            const { numbers, ...rest } = row;
            log.log('info', 'ExamRow', { ...rest, ...numbers });
        }
        writeFileSync(
            join(args.run, 'exam.json'),
            `${JSON.stringify({ ...result, seed: EXAM_SEED, trials: args.trials }, null, 2)}\n`,
        );
        formatRows(result.rows).forEach(print);
        print(`not good yet: rows ${result.open.join(', ')} are open`);
        return result;
    } finally {
        await sinkFile.close();
    }
}

/**
 * Rows 6 and 7, fed by the world reports and the descendants directory; `not run` for what is not given.
 * @param {ExamArgs} args the options
 * @param {{named: string[], founders: import('./lib/exam-readings.mjs').DrillTable, log: import('../js/sim/log.js').SimLog}} run
 *   the named drills, the founders' drill table and the log
 * @returns {Promise<import('../js/evo/exam.js').ExamRow[]>} rows 6 and 7
 */
async function worldRows(args, { named, founders, log }) {
    const row6 = scenesExamRow({
        before: readWorldReport(args.worldBefore),
        after: readWorldReport(args.worldAfter),
        keep: readKeepReport(args.keepRuleReport),
    });
    const groups =
        args.descendants === null
            ? null
            : {
                  unlabelled: await descendantShares(args.descendants, {
                      named,
                      trials: args.trials,
                      workers: args.workers,
                      log,
                  }),
              };
    const shares = drillShares(founders.rows, founders.subjects.length, named);
    return [row6, inheritedExamRow({ named, founders: shares, groups, replacement: null })];
}

/**
 * @param {ExamArgs} args the options
 * @param {{log: import('../js/sim/log.js').SimLog, logDir: string, league?: {path: string, root: string, ticks: number}}} io
 *   the log, its directory and the league
 * @returns {Promise<{rows: import('../js/evo/exam.js').ExamRow[], good: boolean, open: number[]}>} the rows and judgement
 */
async function examine(args, { log, logDir, league }) {
    const { workers, trials } = args;
    logRunConfig(log, {
        tool: 'train-exam',
        policy: null,
        configHash: configHash(seedlessConfig(createConfig({}))),
        seeds: [EXAM_SEED],
        ticks: null,
        extra: { run: args.run, replicates: args.replicates, trials },
    });
    const run = loadRun(args.run);
    const first = await drillTable(run, { workers, trials, log });
    const second = await drillTable(run, { workers, trials, log });
    const { row3, row4, named } = rowsThreeAndFour(run, first, trials);
    const replicateRuns = [];
    for (const dir of args.replicates) {
        const other = loadRun(dir);
        replicateRuns.push(rowsThreeAndFour(other, await drillTable(other, { workers, trials, log }), trials));
    }
    const style = styleReadings(first, named, trials);
    const rows = [
        validRow({ files: championChecks(run), first: first.rows, second: second.rows }),
        reflexExamRow(await reflexScores(first, { workers, trials, log })),
        row3,
        row4,
        leagueExamRow(await leagueStandings(run, { workers, logDir, league })),
        ...(await worldRows(args, { named, founders: first, log })),
        diverseExamRow({ ...style, recruitment: { low: null, high: null } }),
        replicatedExamRow(
            [{ row3, row4 }, ...replicateRuns].map((r) => ({ row3: r.row3.verdict, row4: r.row4.verdict })),
        ),
        notRun(10, "needs the user's watch of /?policy=champions-v1", undefined),
    ];
    return { rows, ...judgeSet(rows, false) };
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {{logDir?: string}} [io] where the log goes
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv, io = {}) {
    return exitCodeOf(async () => {
        await runExam(parseArgs(argv), { ...io, print: console.log });
    });
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
