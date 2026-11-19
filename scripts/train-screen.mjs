// The ladder screen (`npm run train:screen -- --grid <grid.json>`; docs/designs/training-loop.md, Ladder screen): runs every
// arm of a ladder grid on the same seed offsets and compares each with the reference arm on the ladder yield. It does not
// take the CPU lock: training runs are deterministic under load. A detector, never fitness.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSimLog } from '../js/sim/log.js';
import { exitCodeOf, intValue, parseFlags } from './lib/cli-args.mjs';
import { createJsonlSink } from './lib/jsonl-sink.mjs';
import { planScreen } from './lib/train-screen-grid.mjs';
import { screenReport } from './lib/train-screen-report.mjs';
import { runScreen } from './lib/train-screen-run.mjs';
import { defaultWorkers } from './lib/worker-pool.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const USAGE =
    'usage: train:screen --grid <grid.json> [--out <dir>] [--runs <dir>] [--workers <total>] [--force] [--log-dir <dir>]';

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {{grid: string, out: string | null, runs: string | null, workers: number | null, force: boolean, logDir: string}}
 *   the options
 * @throws {Error} on an unknown argument or no `--grid`
 */
export function parseArgs(argv) {
    const opts = parseFlags(argv, {
        valueFlags: {
            '--grid': (v) => ['grid', String(v)],
            '--out': (v) => ['out', String(v)],
            '--runs': (v) => ['runs', String(v)],
            '--workers': (v, f) => ['workers', intValue(f, v, 1, USAGE)],
            '--log-dir': (v) => ['logDir', String(v)],
        },
        booleanFlags: { '--force': 'force' },
        defaults: { grid: null, out: null, runs: null, workers: null, force: false, logDir: '.sim/logs' },
        usage: USAGE,
    });
    if (opts.grid === null) {
        throw new Error(`--grid is required\n${USAGE}`);
    }
    return /** @type {any} */ (opts);
}

/**
 * @param {string} file a ladder file, relative to the repository root
 * @returns {Record<string, any>[]} its entries
 */
const readLadder = (file) => JSON.parse(readFileSync(resolve(ROOT, file), 'utf8'));

/**
 * @param {ReturnType<typeof parseArgs>} args the options
 * @param {{exec?: import('./lib/train-screen-run.mjs').ScreenRunOptions['exec']}} [io] a stand-in trainer (tests)
 * @returns {Promise<{plan: import('./lib/train-screen-grid.mjs').ScreenPlan, report: ReturnType<typeof screenReport>, out: string}>}
 *   the plan, the report and the directory written
 */
export async function runTrainScreen(args, { exec } = {}) {
    const plan = planScreen(JSON.parse(readFileSync(args.grid, 'utf8')), readLadder);
    const name = basename(args.grid).replace(/\.grid\.json$|\.json$/, '');
    const out = args.out ?? join(ROOT, 'evals', 'train-screens', 'results', name);
    const runs = args.runs ?? out;
    mkdirSync(out, { recursive: true });
    const sink = createJsonlSink(join(args.logDir, `train-screen-${name}.jsonl`));
    try {
        const log = createSimLog(sink.sink, { level: 'info' });
        const slots = Math.max(1, Math.floor((args.workers ?? defaultWorkers()) / plan.workersPerRun));
        const outcomes = await runScreen(plan, { runs, slots, force: args.force, log, exec });
        const report = screenReport(plan, outcomes);
        for (const [arm, verdict] of Object.entries(report.verdicts.arms)) {
            const { compare, ...rest } = /** @type {any} */ (verdict);
            log.log('info', 'TrainScreenVerdict', {
                arm,
                reference: plan.reference,
                ...rest,
                ...(compare === undefined
                    ? {}
                    : { meanDiff: compare.meanDiff, p: compare.p, matched: compare.matched }),
            });
        }
        writeFileSync(join(out, 'yield.json'), `${JSON.stringify(report.yield, null, 2)}\n`);
        writeFileSync(join(out, 'verdicts.json'), `${JSON.stringify(report.verdicts, null, 2)}\n`);
        writeFileSync(join(out, 'table.md'), report.table);
        return { plan, report, out };
    } finally {
        await sink.close();
    }
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {(line: string) => void} [print] receives the table
 * @returns {Promise<number>} the process exit code: 0 done, 1 on bad input or a failed run
 */
export async function main(argv, print = console.log) {
    return exitCodeOf(async () => {
        const { report, out } = await runTrainScreen(parseArgs(argv));
        print(report.table);
        print(`wrote ${out}`);
        const failed = report.results.reduce((sum, r) => sum + r.failed, 0);
        if (failed > 0) {
            throw new Error(`${failed} training run(s) failed; see TrainScreenRunFailed in the log`);
        }
    });
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
