// The shell of scripts/worktree-gc.sh: gathers each worktree's facts from git, gh and /proc, classes them
// (worktree-gc.mjs) and, without --list, removes the `safe` ones with `git worktree remove` (never --force).
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectRuns, inFlight } from './run-workers.mjs';
import { classify, countByClass, parseWorktreeList } from './worktree-gc.mjs';

/**
 * @param {string[]} args git arguments
 * @param {string} cwd where to run git
 * @returns {{status: number | null, stdout: string, stderr: string}} the outcome
 */
function git(args, cwd) {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/**
 * @returns {string[]} the numeric entries of /proc (none where there is no /proc)
 */
function procIds() {
    try {
        return readdirSync('/proc').filter((p) => /^\d+$/.test(p));
    } catch {
        return [];
    }
}

/**
 * @param {string} dir a directory
 * @returns {number[]} pids of other processes whose working directory is `dir` or inside it (Linux /proc)
 */
export function processesIn(dir) {
    const out = [];
    const prefix = dir.endsWith(sep) ? dir : dir + sep;
    for (const pid of procIds()) {
        try {
            const cwd = readlinkSync(`/proc/${pid}/cwd`);
            if (Number(pid) !== process.pid && (cwd === dir || cwd.startsWith(prefix))) {
                out.push(Number(pid));
            }
        } catch {
            // the process ended or is not ours to read
        }
    }
    return out;
}

/**
 * @param {string} path a worktree directory
 * @param {string} branch its branch
 * @returns {{number: number, headRefOid: string}[] | null} the branch's merged PRs, null when gh cannot say
 */
function mergedPrs(path, branch) {
    const r = spawnSync(
        'gh',
        ['pr', 'list', '--head', branch, '--state', 'merged', '--json', 'number,headRefOid', '--limit', '10'],
        { cwd: path, encoding: 'utf8' },
    );
    if (r.status !== 0) {
        return null;
    }
    try {
        return JSON.parse(r.stdout);
    } catch {
        return null;
    }
}

/**
 * @param {string} dir a worktree directory
 * @returns {boolean} whether its `.runs/` holds a run log
 */
function hasRunLog(dir) {
    try {
        return readdirSync(join(dir, '.runs')).some((f) => f.endsWith('.log'));
    } catch {
        return false;
    }
}

/**
 * @param {ReturnType<typeof parseWorktreeList>[number]} entry a listed worktree
 * @param {{main: string, caller: string}} where the main checkout and the calling session's worktree
 * @returns {import('./worktree-gc.mjs').WorktreeFacts} its facts
 */
function gather(entry, where) {
    const missing = !existsSync(entry.path);
    const real = missing ? entry.path : realpathSync(entry.path);
    const base = {
        path: entry.path,
        branch: entry.branch,
        head: entry.head,
        isMain: entry.path === where.main,
        isCaller: real === where.caller,
        locked: entry.locked,
        missing,
    };
    if (missing) {
        return {
            ...base,
            processes: [],
            runInFlight: false,
            runLogs: false,
            porcelain: '',
            headInMain: false,
            mergedPrs: null,
        };
    }
    return {
        ...base,
        processes: processesIn(real),
        runInFlight: collectRuns([join(real, '.runs', 'runs.json')]).some(inFlight),
        runLogs: hasRunLog(real),
        porcelain: git(['status', '--porcelain'], real).stdout,
        headInMain: git(['merge-base', '--is-ancestor', 'HEAD', 'origin/main'], real).status === 0,
        mergedPrs: entry.branch ? mergedPrs(real, entry.branch) : null,
    };
}

/**
 * @param {string} cwd where the script runs
 * @returns {{cls: string, reason: string, path: string, branch: string | null, outside: boolean}[] | null} every worktree classed
 *   (`outside`: not under `<main checkout>/.claude/worktrees/`), null
 *   outside a repository
 */
export function listWorktrees(cwd) {
    const top = git(['rev-parse', '--show-toplevel'], cwd);
    const listed = git(['worktree', 'list', '--porcelain'], cwd);
    if (top.status !== 0 || listed.status !== 0) {
        return null;
    }
    git(['fetch', 'origin', '--quiet'], cwd); // best effort: a stale origin/main only makes a worktree look less merged
    const entries = parseWorktreeList(listed.stdout);
    const where = { main: entries[0].path, caller: realpathSync(top.stdout.trim()) };
    const agentDir = join(realpathSync(where.main), '.claude', 'worktrees') + sep;
    return entries.map((entry) => ({
        ...classify(gather(entry, where)),
        path: entry.path,
        branch: entry.branch,
        outside: !(existsSync(entry.path) ? realpathSync(entry.path) : entry.path).startsWith(agentDir),
    }));
}

/**
 * Removes the `safe` worktrees: `git worktree remove` (no --force: git itself refuses a dirty tree), then the branch.
 * Worktrees outside `<main>/.claude/worktrees/` are named stream checkouts: skipped unless `all`.
 * @param {{cls: string, path: string, branch: string | null, outside: boolean}[]} rows the classified worktrees
 * @param {string} cwd where the script runs
 * @param {boolean} all also remove the `outside` ones
 * @returns {number} how many were not removed
 */
function removeSafe(rows, cwd, all) {
    let failed = 0;
    for (const row of rows.filter((r) => r.cls === 'safe' && (all || !r.outside))) {
        const removed = git(['worktree', 'remove', row.path], cwd);
        if (removed.status !== 0) {
            console.error(`kept ${row.path}: ${removed.stderr.trim()}`);
            failed += 1;
            continue;
        }
        // The branch is wholly in a merged PR (class `safe`), so -D only skips git's own merged-into-HEAD check.
        git(['branch', '-D', String(row.branch)], cwd);
        console.log(`removed ${row.path} (${row.branch})`);
    }
    return failed;
}

/**
 * @param {string[]} argv arguments after the script name
 * @returns {number} the exit code
 */
export function main(argv) {
    const flags = new Set(argv);
    const unknown = argv.filter((a) => !['--list', '--json', '--all'].includes(a));
    if (unknown.length > 0) {
        console.error('usage: worktree-gc.sh [--list] [--json] [--all]');
        return 2;
    }
    const rows = listWorktrees(process.cwd());
    if (rows === null) {
        console.error('worktree-gc: not inside a git repository');
        return 1;
    }
    const counts = countByClass(/** @type {any} */ (rows));
    if (flags.has('--json')) {
        console.log(JSON.stringify({ counts, worktrees: rows }, null, 2));
    } else {
        for (const row of rows) {
            console.log(
                `${row.cls.padEnd(8)} ${row.path}  ${row.branch ?? '(detached)'}  ${row.reason}${row.outside ? ' [outside .claude/worktrees: kept unless --all]' : ''}`,
            );
        }
        console.log(
            Object.entries(counts)
                .map(([k, v]) => `${k}=${v}`)
                .join(' '),
        );
    }
    return flags.has('--list') ? 0 : removeSafe(rows, process.cwd(), flags.has('--all')) > 0 ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    process.exitCode = main(process.argv.slice(2));
}
