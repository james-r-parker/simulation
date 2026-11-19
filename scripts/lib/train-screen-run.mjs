// Runs a ladder screen's training runs (docs/designs/training-loop.md, Ladder screen): writes each arm's merged ladder, skips
// a run whose `manifest.json` already matches the arm's ladder hash, trainer options and offset, and trains the rest as
// child `scripts/train.mjs` processes, as many at once as the worker budget allows. A run that stalls (exit code 3) is a
// result; any other failure leaves the run out of the yield.
import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ladderText, screenRuns, textHash, trainArgs } from './train-screen-grid.mjs';
import { parseArgs as parseTrainArgs } from './train-args.mjs';

const TRAIN_SCRIPT = fileURLToPath(new URL('../train.mjs', import.meta.url));
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
/** The exit code of a run a required stage stalled (`TrainStalled`): its archive and curve are a result. */
const STALLED = 3;

/**
 * @typedef {object} RunOutcome
 * @property {string} arm the arm
 * @property {number} offset the seed offset
 * @property {string} dir the run's directory
 * @property {'ran' | 'reused' | 'failed'} status whether the run trained now, was kept from before, or failed
 * @property {number} [exitCode] the exit code of a run that trained or failed
 * @property {number} seconds wall seconds the run took (0 when reused)
 */

/**
 * @param {string} runs the directory the runs live under
 * @param {string} arm an arm
 * @param {number} offset a seed offset
 * @returns {string} the run's directory, `<runs>/<arm>/o<offset>`
 */
export function runDir(runs, arm, offset) {
    return join(runs, arm, `o${offset}`);
}

/**
 * @param {readonly string[]} argv the `train.mjs` arguments of a run
 * @returns {Record<string, any>} the options the run's `manifest.json` will record
 */
function expectedOptions(argv) {
    const args = parseTrainArgs([...argv, '--out', 'x']);
    return {
        generations: args.generations,
        episodes: args.episodes,
        seedOffset: args.seedOffset,
        until: args.until,
        ticks: args.ticks ?? null,
        checkpointEvery: args.checkpointEvery,
        offerFrom: args.offerFrom ?? null,
    };
}

/**
 * @param {string} dir a run directory
 * @param {{hash: string, argv: readonly string[]}} expected the arm's ladder hash and the run's `train.mjs` arguments
 * @returns {boolean} whether the directory holds a finished run (a manifest that is not `running`) of this ladder, with
 *   these trainer options and offset
 */
export function reusable(dir, { hash, argv }) {
    const path = join(dir, 'manifest.json');
    if (!existsSync(path)) {
        return false;
    }
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    const options = expectedOptions(argv);
    return (
        manifest.status !== 'running' &&
        manifest.curriculum?.hash === hash &&
        Object.entries(options).every(([key, value]) => manifest.options?.[key] === value)
    );
}

/**
 * @param {readonly string[]} argv `train.mjs` arguments
 * @param {string} dir the run directory, whose `stdout.log` receives the output
 * @returns {Promise<number>} the exit code
 */
function spawnTrain(argv, dir) {
    const fd = openSync(join(dir, 'stdout.log'), 'w');
    const scratch = /^\/tmp(\/|$)/.test(resolve(dir)) ? ['--scratch'] : [];
    return new Promise((done, fail) => {
        const child = spawn(process.execPath, [TRAIN_SCRIPT, ...argv, '--out', dir, ...scratch], {
            cwd: ROOT,
            stdio: ['ignore', fd, fd],
        });
        child.on('error', fail);
        child.on('close', (code) => done(code ?? 1));
    }).finally(() => closeSync(fd));
}

/**
 * @typedef {object} ScreenRunOptions
 * @property {string} runs the directory the runs live under (each arm's `ladder.json` is written beside its runs)
 * @property {number} slots training runs in flight at once
 * @property {boolean} [force] retrain a run that could be reused
 * @property {import('../../js/sim/log.js').SimLog} log receives `TrainScreenRun` and `TrainScreenRunFailed`
 * @property {(argv: string[], dir: string) => Promise<number>} [exec] trains one run and returns its exit code (default:
 *   a child `scripts/train.mjs`); a test stands in for it
 */

/**
 * @param {import('./train-screen-grid.mjs').ScreenPlan} plan the plan
 * @param {ScreenRunOptions} options the run options
 * @returns {Promise<RunOutcome[]>} one outcome per arm and offset, in run order
 */
export async function runScreen(plan, { runs, slots, force = false, log, exec = spawnTrain }) {
    /** @type {Map<string, {file: string, hash: string}>} */
    const ladders = new Map();
    for (const arm of plan.arms) {
        const text = ladderText(arm.ladder);
        mkdirSync(join(runs, arm.name), { recursive: true });
        const file = resolve(join(runs, arm.name, 'ladder.json'));
        writeFileSync(file, text);
        ladders.set(arm.name, { file, hash: textHash(text) });
    }
    const pending = screenRuns(plan);
    /** @type {RunOutcome[]} */
    const outcomes = new Array(pending.length);
    let next = 0;
    const lane = async () => {
        while (next < pending.length) {
            const at = next++;
            const { arm, offset } = pending[at];
            const ladder = /** @type {{file: string, hash: string}} */ (ladders.get(arm.name));
            const dir = runDir(runs, arm.name, offset);
            const argv = [
                '--curriculum',
                ladder.file,
                '--workers',
                String(plan.workersPerRun),
                ...trainArgs(plan, arm, offset),
            ];
            outcomes[at] = await runOne({ arm: arm.name, offset, dir, argv, hash: ladder.hash }, { force, log, exec });
        }
    };
    await Promise.all(Array.from({ length: Math.max(1, slots) }, lane));
    return outcomes;
}

/**
 * @param {{arm: string, offset: number, dir: string, argv: string[], hash: string}} run the run
 * @param {{force: boolean, log: import('../../js/sim/log.js').SimLog, exec: (argv: string[], dir: string) => Promise<number>}} io
 *   whether to retrain a reusable run, the log and the trainer
 * @returns {Promise<RunOutcome>} what became of the run
 */
async function runOne({ arm, offset, dir, argv, hash }, { force, log, exec }) {
    if (!force && reusable(dir, { hash, argv })) {
        log.log('info', 'TrainScreenRun', { arm, offset, dir, reused: true, exitCode: null, seconds: 0 });
        return { arm, offset, dir, status: 'reused', seconds: 0 };
    }
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const started = performance.now();
    const exitCode = await exec(argv, dir);
    const seconds = (performance.now() - started) / 1000;
    if (exitCode !== 0 && exitCode !== STALLED) {
        log.log('error', 'TrainScreenRunFailed', { arm, offset, dir, exitCode, seconds });
        return { arm, offset, dir, status: 'failed', exitCode, seconds };
    }
    log.log('info', 'TrainScreenRun', { arm, offset, dir, reused: false, exitCode, seconds });
    return { arm, offset, dir, status: 'ran', exitCode, seconds };
}
