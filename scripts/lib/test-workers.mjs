// How many Vitest workers a test run may start. Several agents run Vitest at once and each started a full pool, so the runs
// shared the machine badly. A run takes the workers the shared budget has free (`workerLedger` in run-workers.mjs: the budget
// less what detached eval/ladder/train runs claim) less what other test runs hold, at least 1. A test run is not a detached
// run, so it registers a lease file (a pid and a count) in a shared directory; a lease whose process is gone is ignored.
// `TEST_MAX_WORKERS=<n>` overrides it; CI is one job on its own runner and is never capped.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectRuns, inFlight, pidAlive, workerLedger } from './run-workers.mjs';
import { parseWorktreeList } from './worktree-gc.mjs';

/** @returns {string} the directory the leases live in */
export function leaseDir() {
    return process.env.TEST_LEASE_DIR || join(tmpdir(), 'blob-test-leases');
}

/**
 * @param {string} dir the lease directory
 * @param {(pid: number) => boolean} [alive] whether a process exists
 * @returns {{ pid: number, workers: number }[]} the leases of live processes; stale files are removed
 */
export function readLeases(dir, alive = pidAlive) {
    /** @type {string[]} */
    let names;
    try {
        names = readdirSync(dir);
    } catch {
        return [];
    }
    const out = [];
    for (const name of names) {
        try {
            const lease = JSON.parse(readFileSync(join(dir, name), 'utf8'));
            if (alive(lease.pid)) {
                out.push(lease);
            } else {
                rmSync(join(dir, name), { force: true });
            }
        } catch {
            // damaged or racing: skipped
        }
    }
    return out;
}

/**
 * @param {{ env?: Record<string, string | undefined>, cores?: number, flying: { workers?: number | null }[], leases: { workers: number }[] }} input
 *   the environment, the core count, the detached runs in flight and the other test runs' leases
 * @returns {number | null} the worker cap, null for no cap (CI)
 */
export function pickWorkers({ env = process.env, cores = availableParallelism(), flying, leases }) {
    const forced = Number(env.TEST_MAX_WORKERS);
    if (Number.isInteger(forced) && forced >= 1) {
        return forced;
    }
    if (env.CI) {
        return null;
    }
    const held = leases.reduce((sum, l) => sum + l.workers, 0);
    return Math.max(1, workerLedger(flying, cores, env).free - held);
}

/**
 * @param {string} root a checkout
 * @returns {{ workers?: number | null }[]} the runs in flight in every worktree of the repository
 */
function runsInFlight(root) {
    const listed = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8' });
    const dirs = listed.status === 0 ? parseWorktreeList(listed.stdout).map((e) => e.path) : [];
    return collectRuns([root, ...dirs].map((d) => join(d, '.runs', 'runs.json'))).filter(inFlight);
}

/**
 * Takes a lease for `pid` and returns the cap.
 * @param {number} pid the process the lease lives and dies with
 * @param {{ root?: string, env?: Record<string, string | undefined> }} [opts] the checkout and environment
 * @returns {number | null} the worker cap (null for none)
 */
export function claimWorkers(pid, { root = process.cwd(), env = process.env } = {}) {
    const dir = leaseDir();
    const leases = readLeases(dir).filter((l) => l.pid !== pid);
    const workers = pickWorkers({ env, flying: runsInFlight(root), leases });
    if (workers !== null) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${pid}.json`), JSON.stringify({ pid, workers }));
    }
    return workers;
}

/** @param {number} pid the process whose lease to drop */
export function releaseWorkers(pid) {
    rmSync(join(leaseDir(), `${pid}.json`), { force: true });
}
