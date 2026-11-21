// The worker count a detached run claims, and the machine's view of runs in flight (docs/designs/agent-workflow.md,
// The state of the machine). Used by scripts/run-detached.sh (through run-registry.mjs) and scripts/state.mjs.
import { existsSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { defaultWorkers } from './worker-pool.mjs';

/** Scripts whose pool defaults to `defaultWorkers()` (AGENTS.md, "Worker budget for evals, screens and training"). */
const POOL_SCRIPT = /\b(?:eval|ladder|league|train|drill|reflex|screen)(?:\.mjs)?(?=\s|$)/;

/**
 * @param {string} cmd the run's command line (shell-quoted words joined by spaces)
 * @param {number} [cores] the core count the default is taken from
 * @returns {number | null} the workers the run claims: `--workers <n>` when given, `defaultWorkers()` for a pool
 *   command without it, null for any other command (it claims no pool)
 */
export function parseWorkers(cmd, cores = availableParallelism()) {
    const flag = /--workers(?:=|\s+)(\d+)(?=\s|$)/.exec(cmd);
    if (flag) {
        return Number(flag[1]);
    }
    return POOL_SCRIPT.test(cmd) ? defaultWorkers(cores) : null;
}

/**
 * @param {number} pid a process id
 * @returns {boolean} whether the process exists
 */
export function pidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return /** @type {NodeJS.ErrnoException} */ (error).code === 'EPERM';
    }
}

/**
 * @param {{name: string, pid: number, dir: string}} run a recorded run
 * @returns {boolean} whether it is in flight: no `.done` file beside its log and its process is alive
 */
export function inFlight(run) {
    return !existsSync(join(run.dir, `${run.name}.done`)) && pidAlive(run.pid);
}

/**
 * @param {string[]} files registry files (`runs.json`); a missing or damaged one is skipped, since this is a reading
 * @returns {({name: string, cmd: string, pid: number, dir: string, cwd: string, started: string, workers?: number | null})[]} every recorded run, each file read once
 */
export function collectRuns(files) {
    const out = [];
    for (const file of new Set(files)) {
        if (!existsSync(file)) {
            continue;
        }
        try {
            const runs = JSON.parse(readFileSync(file, 'utf8'));
            out.push(...(Array.isArray(runs) ? runs : []));
        } catch {
            // skipped
        }
    }
    return out;
}

/**
 * @param {{workers?: number | null}[]} flying the runs in flight
 * @param {number} [cores] the core count
 * @returns {{budget: number, claimed: number, free: number}} the worker budget, what in-flight runs claim, what is left
 */
export function workerLedger(flying, cores = availableParallelism()) {
    const budget = defaultWorkers(cores);
    const claimed = flying.reduce((sum, run) => sum + (run.workers ?? 0), 0);
    return { budget, claimed, free: Math.max(0, budget - claimed) };
}

/**
 * @param {number | null} workers the new run's claim
 * @param {{workers?: number | null}[]} others the other runs in flight
 * @param {number} [cores] the core count
 * @returns {string | null} one warning line when the run asks for fewer than half the free workers and no other run is
 *   in flight, else null
 */
export function underUseWarning(workers, others, cores = availableParallelism()) {
    if (workers === null || others.length > 0) {
        return null;
    }
    const { free } = workerLedger([], cores);
    if (workers * 2 >= free) {
        return null;
    }
    return `warning: this run uses ${workers} of ${free} free workers and nothing else is running; add --workers ${free}`;
}

/**
 * @param {string} log a run's log text
 * @returns {number} the `seed <n> done` lines it printed (scripts/eval.mjs)
 */
export function seedsDone(log) {
    return log.split('\n').filter((line) => /^seed \d+ done\b/.test(line)).length;
}

/**
 * @param {{name: string, dir: string}} run a recorded run
 * @returns {number | null} seeds done from its log, null when the log prints none or is missing
 */
export function seedsDoneOf(run) {
    const file = join(run.dir, `${run.name}.log`);
    if (!existsSync(file)) {
        return null;
    }
    const n = seedsDone(readFileSync(file, 'utf8'));
    return n > 0 ? n : null;
}
