// The Runs, Machine, Ladder, Experiments, Pull requests, Ships and Worktrees blocks of `npm run state`: each a pure
// function of what the shell read, so each is tested on its own.
import { workerLedger } from './run-workers.mjs';

/**
 * @param {{name: string, cmd: string, workers?: number | null, started: string, pid: number, dir: string}[]} runs every
 *   recorded run
 * @param {(run: {name: string, dir: string}) => number | null} seeds seeds done from the run's log
 * @param {(run: {name: string, pid: number, dir: string}) => boolean} flying whether the run is in flight
 * @param {number} [doneLimit] how many finished runs to keep (the newest)
 * @returns {{name: string, cmd: string, workers: number | null, started: string, state: 'in flight' | 'done',
 *   seedsDone: number | null}[]} every run in flight, then the newest finished ones, newest first within each
 */
export function runsBlock(runs, seeds, flying, doneLimit = 10) {
    const rows = runs.map((run) => ({
        name: run.name,
        cmd: run.cmd,
        workers: run.workers ?? null,
        started: run.started,
        state: flying(run) ? /** @type {const} */ ('in flight') : /** @type {const} */ ('done'),
        seedsDone: seeds(run),
    }));
    rows.sort((a, b) => b.started.localeCompare(a.started));
    const flyingRows = rows.filter((r) => r.state === 'in flight');
    return [...flyingRows, ...rows.filter((r) => r.state === 'done').slice(0, doneLimit)];
}

/**
 * @param {{state: string, workers: number | null}[]} runs the Runs block
 * @param {{threads: number, load: number}} host the machine's thread count and one-minute load
 * @returns {{threads: number, load: number, budget: number, claimed: number, free: number}} the worker budget, what runs
 *   in flight claim and what is free
 */
export function machineBlock(runs, host) {
    const { budget, claimed, free } = workerLedger(
        runs.filter((r) => r.state === 'in flight'),
        host.threads,
    );
    return { threads: host.threads, load: host.load, budget, claimed, free };
}

/**
 * @param {Record<string, any>} yieldFile a `yield.json`
 * @returns {{arm: string, runs: number, stages: {stage: string, passShare: number}[]} | null} the reference arm's pass
 *   share per stage (arm `base` when present, else the first arm), null when the file holds no arm
 */
export function ladderBlock(yieldFile) {
    const arm = 'base' in yieldFile ? 'base' : Object.keys(yieldFile)[0];
    const data = arm === undefined ? null : yieldFile[arm];
    if (!data || !Array.isArray(data.stages)) {
        return null;
    }
    return {
        arm,
        runs: data.runs,
        stages: data.stages.map((/** @type {{stage: string, passShare: number}} */ s) => ({
            stage: s.stage,
            passShare: s.passShare,
        })),
    };
}

/**
 * @param {{id: string, date: string, outcome?: string, plan?: string}[]} records every experiment record
 * @param {string} today the date to count the week back from, `YYYY-MM-DD`
 * @returns {{last: {id: string, date: string, outcome: string}[], tally: Record<string, number>, since: string}} the last
 *   10 records by id and the count per outcome over the 7 days to `today`
 */
export function experimentsBlock(records, today) {
    const idOf = (/** @type {{id: string}} */ r) => Number(r.id.replace(/\D/g, ''));
    const sorted = [...records].sort((a, b) => idOf(a) - idOf(b));
    const since = new Date(Date.parse(today) - 7 * 86_400_000).toISOString().slice(0, 10);
    const tally = /** @type {Record<string, number>} */ ({});
    for (const r of sorted.filter((x) => x.date >= since)) {
        tally[r.outcome ?? 'unrecorded'] = (tally[r.outcome ?? 'unrecorded'] ?? 0) + 1;
    }
    return {
        last: sorted.slice(-10).map((r) => ({ id: r.id, date: r.date, outcome: r.outcome ?? 'unrecorded' })),
        tally,
        since,
    };
}

/**
 * @param {{number: number, title: string, headRefName: string, statusCheckRollup?: {status?: string, conclusion?: string}[]}[]} prs
 *   the output of `gh pr list --json number,title,headRefName,statusCheckRollup`
 * @returns {{number: number, title: string, branch: string, checks: 'pass' | 'fail' | 'pending' | 'none'}[]} one row per PR
 */
export function prsBlock(prs) {
    return prs.map((pr) => {
        const checks = pr.statusCheckRollup ?? [];
        let state = /** @type {'pass' | 'fail' | 'pending' | 'none'} */ ('pass');
        if (checks.length === 0) {
            state = 'none';
        } else if (checks.some((c) => ['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ERROR'].includes(c.conclusion ?? ''))) {
            state = 'fail';
        } else if (checks.some((c) => c.status !== undefined && c.status !== 'COMPLETED')) {
            state = 'pending';
        }
        return { number: pr.number, title: pr.title, branch: pr.headRefName, checks: state };
    });
}

/**
 * @param {number[]} values numbers
 * @returns {number | null} their median, null when there are none
 */
function median(values) {
    if (values.length === 0) {
        return null;
    }
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * @param {string} jsonl `.checklogs/ship.jsonl`, one `ship.sh` run per line
 * @returns {{ships: number, medianMinutes: number | null, firstRunGreen: number | null}} over the last 20 merged
 *   ships: the median minutes from push to merge and the share that merged on their first CI run
 */
export function shipsBlock(jsonl) {
    const lines = [];
    for (const raw of jsonl.split('\n').filter((l) => l.trim() !== '')) {
        try {
            lines.push(JSON.parse(raw));
        } catch {
            // a torn last line is skipped
        }
    }
    const merged = lines.filter((l) => l.result === 'merged').slice(-20);
    const minutes = merged.map((l) => l.minutes).filter((m) => typeof m === 'number');
    const first = merged.filter((l) => l.ciRuns === 1).length;
    return {
        ships: merged.length,
        medianMinutes: median(minutes),
        firstRunGreen: merged.length === 0 ? null : first / merged.length,
    };
}
