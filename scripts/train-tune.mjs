// One night of trainer tuning (`npm run train:tune -- --spec evals/train-tune.json`; docs/designs/training-loop.md, Tuning lane):
// proposes one-change arms around the current ladder, screens them on the tuning offsets, confirms each `better` arm on the
// held-out offsets, exports the finalists' and the reference's best champions and trials them in whole worlds, then writes
// `summary.md`, `result.json` and `draft-experiment.json` to the results directory. It changes no file outside it (the training
// runs, the world reports and the log go under `.sim/`). A detector, never fitness.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ladderKey, proposeArms, withDefaults } from '../js/evo/train-tune.js';
import { createSimLog } from '../js/sim/log.js';
import { exitCodeOf, intValue, parseFlags } from './lib/cli-args.mjs';
import { createJsonlSink } from './lib/jsonl-sink.mjs';
import { draftExperiment, summaryText } from './lib/train-tune-report.mjs';
import { screenNight, worldNight } from './lib/train-tune-night.mjs';
import { historyOf } from './lib/train-tune-plan.mjs';
import { worldTrial } from './lib/train-tune-world.mjs';
import { runExport } from './train-export.mjs';
import { runTrainScreen } from './train-screen.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const USAGE =
    'usage: train:tune --spec <train-tune.json> [--date <YYYY-MM-DD>] [--workers <n>] [--dry-run] [--runs <dir>] [--results <dir>] [--log-dir <dir>]';

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {{spec: string, date: string, workers: number | null, dryRun: boolean, runs: string, results: string, logDir: string}}
 *   the options
 * @throws {Error} on an unknown argument or no `--spec`
 */
export function parseArgs(argv) {
    const opts = parseFlags(argv, {
        valueFlags: {
            '--spec': (v) => ['spec', String(v)],
            '--date': (v) => ['date', String(v)],
            '--workers': (v, f) => ['workers', intValue(f, v, 1, USAGE)],
            '--runs': (v) => ['runs', String(v)],
            '--results': (v) => ['results', String(v)],
            '--log-dir': (v) => ['logDir', String(v)],
        },
        booleanFlags: { '--dry-run': 'dryRun' },
        defaults: {
            spec: null,
            date: new Date().toISOString().slice(0, 10),
            workers: null,
            dryRun: false,
            runs: join(ROOT, '.sim', 'train-tune'),
            results: join(ROOT, 'evals', 'train-tune', 'results'),
            logDir: join(ROOT, '.sim', 'logs'),
        },
        usage: USAGE,
    });
    if (opts.spec === null) {
        throw new Error(`--spec is required\n${USAGE}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.date)) {
        throw new Error(`--date must be YYYY-MM-DD\n${USAGE}`);
    }
    return /** @type {any} */ (opts);
}

/**
 * @param {string} path a JSON file
 * @returns {any} its contents
 */
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/**
 * @param {string} root the results root
 * @returns {Record<string, any>[]} the parsed `result.json` of every past night (none for a missing root)
 */
export function readResults(root) {
    if (!existsSync(root)) {
        return [];
    }
    return readdirSync(root)
        .sort()
        .map((name) => join(root, name, 'result.json'))
        .filter((file) => existsSync(file))
        .map(readJson);
}

/**
 * @typedef {object} TuneIo
 * @property {typeof runTrainScreen} [screen] runs a ladder screen
 * @property {typeof runExport} [exportChampions] exports champion files
 * @property {typeof worldTrial} [trial] the world trial
 */

/**
 * @param {import('../js/sim/log.js').SimLog} log the log
 * @param {Record<string, any>} result the night's `result.json`
 * @returns {void}
 */
function logNight(log, { date, ladderHash, arms }) {
    for (const arm of arms) {
        log.log('info', 'TuneArm', {
            date,
            arm: arm.name,
            signature: arm.signature,
            tune: arm.tune.verdict,
            holdout: arm.holdout?.verdict ?? null,
            finalist: arm.finalist,
        });
    }
    const finalists = arms.filter((/** @type {any} */ a) => a.finalist).map((/** @type {any} */ a) => a.name);
    log.log('info', 'TuneResult', { date, ladderHash, arms: arms.length, finalists });
}

/**
 * @param {ReturnType<typeof parseArgs>} args the options
 * @param {TuneIo} [io] stand-ins (tests)
 * @param {(line: string) => void} [print] receives the plan and the summary
 * @returns {Promise<Record<string, any> | null>} the night's `result.json`, or null for a dry run
 */
export async function runTune(
    args,
    { screen = runTrainScreen, exportChampions = runExport, trial = worldTrial } = {},
    print = console.log,
) {
    const spec = withDefaults(readJson(args.spec));
    const ladder = readJson(resolve(ROOT, spec.curriculum));
    const proposed = proposeArms(spec, ladder, historyOf(readResults(args.results)));
    print(`proposed ${proposed.length} arm(s): ${proposed.map((a) => a.signature).join(', ') || 'none'}`);
    if (args.dryRun) {
        return null;
    }
    const out = join(args.results, args.date);
    mkdirSync(out, { recursive: true });
    const sink = createJsonlSink(join(args.logDir, `train-tune-${args.date}.jsonl`));
    try {
        const shared = { workers: args.workers, force: false, logDir: args.logDir };
        const { arms, yielded } =
            proposed.length === 0
                ? { arms: [], yielded: {} }
                : await screenNight({ spec, proposed, out, runs: args.runs, shared }, screen);
        const night = { spec, arms, yielded, out, runs: args.runs, date: args.date, workers: args.workers };
        const world = await worldNight(night, { exportChampions, trial });
        const result = {
            date: args.date,
            ladderHash: ladderKey(ladder),
            curriculum: spec.curriculum,
            until: spec.until ?? null,
            arms,
            world,
        };
        logNight(createSimLog(sink.sink, { level: 'info' }), result);
        writeFileSync(join(out, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
        writeFileSync(join(out, 'summary.md'), summaryText(result));
        writeFileSync(join(out, 'draft-experiment.json'), `${JSON.stringify(draftExperiment(result), null, 2)}\n`);
        print(summaryText(result));
        return result;
    } finally {
        await sink.close();
    }
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {(line: string) => void} [print] receives the plan and the summary
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv, print = console.log) {
    return exitCodeOf(async () => {
        await runTune(parseArgs(argv), {}, print);
    });
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
