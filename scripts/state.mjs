// Prints one page of the machine's state: the queue, runs in flight on every worktree, the worker budget, the ladder, the
// experiments, ships, open pull requests and worktree classes. Read-only; writes no file
// (docs/designs/agent-workflow.md, The state of the machine).
//
// Usage: npm run state [-- --json] [-- --root <dir>]
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { availableParallelism, loadavg } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLedger } from './lib/ledger.mjs';
import { collectRuns, inFlight, seedsDoneOf } from './lib/run-workers.mjs';
import { experimentsBlock, ladderBlock, machineBlock, prsBlock, runsBlock, shipsBlock } from './lib/state-blocks.mjs';
import { renderState } from './lib/state-format.mjs';
import { queueBlock } from './lib/state-queue.mjs';
import { countByClass } from './lib/worktree-gc.mjs';
import { listWorktrees } from './lib/worktree-gc-main.mjs';

/**
 * @param {string} file a file
 * @returns {string | null} its text, null when it cannot be read
 */
function readText(file) {
    try {
        return readFileSync(file, 'utf8');
    } catch {
        return null;
    }
}

/**
 * @param {string} root the repository root
 * @returns {{file: string, arm: string, runs: number, stages: {stage: string, passShare: number}[]} | null} the newest
 *   `yield.json` under `evals/train-screens/results/`, read as the Ladder block
 */
function newestLadder(root) {
    const base = join(root, 'evals', 'train-screens', 'results');
    if (!existsSync(base)) {
        return null;
    }
    const files = readdirSync(base)
        .map((d) => join(base, d, 'yield.json'))
        .filter((f) => existsSync(f))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    const text = files.length ? readText(files[0]) : null;
    const block = text === null ? null : ladderBlock(JSON.parse(text));
    return block && { file: files[0].slice(root.length + 1), ...block };
}

/**
 * @param {string} root the repository root
 * @returns {ReturnType<typeof prsBlock> | null} the open pull requests, null when `gh` is absent or fails
 */
function openPrs(root) {
    const r = spawnSync(
        'gh',
        ['pr', 'list', '--state', 'open', '--json', 'number,title,headRefName,statusCheckRollup', '--limit', '30'],
        { cwd: root, encoding: 'utf8' },
    );
    if (r.status !== 0) {
        return null;
    }
    try {
        return prsBlock(JSON.parse(r.stdout));
    } catch {
        return null;
    }
}

/**
 * @param {string} root the repository root
 * @param {{today?: string}} [options] `today` pins the date the week is counted back from (tests)
 * @returns {Record<string, any>} the state: every block
 */
export function gatherState(root, options = {}) {
    const trees = listWorktrees(root);
    const dirs = [root, ...(trees ?? []).map((t) => t.path)];
    const runs = runsBlock(collectRuns(dirs.map((d) => join(d, '.runs', 'runs.json'))), seedsDoneOf, inFlight);
    const readme = readText(join(root, 'docs', 'designs', 'README.md')) ?? '';
    return {
        queue: queueBlock(readme, (file) => readText(join(root, 'docs', 'designs', file))),
        runs,
        machine: machineBlock(runs, { threads: availableParallelism(), load: loadavg()[0] }),
        ladder: newestLadder(root),
        experiments: experimentsBlock(readLedger(root), options.today ?? new Date().toISOString().slice(0, 10)),
        ships: shipsBlock(readText(join(root, '.checklogs', 'ship.jsonl')) ?? ''),
        prs: openPrs(root),
        worktrees: trees ? countByClass(/** @type {any} */ (trees)) : null,
    };
}

/**
 * @param {string[]} argv arguments after the script name
 * @returns {number} the exit code
 */
export function main(argv, cwd = process.cwd()) {
    const rootAt = argv.indexOf('--root');
    const root = rootAt >= 0 ? argv[rootAt + 1] : cwd;
    const unknown = argv.filter((a, i) => !['--json', '--root'].includes(a) && argv[i - 1] !== '--root');
    if (unknown.length > 0 || (rootAt >= 0 && root === undefined)) {
        console.error('usage: npm run state [-- --json] [-- --root <dir>]');
        return 2;
    }
    const state = gatherState(root);
    process.stdout.write(argv.includes('--json') ? `${JSON.stringify(state, null, 2)}\n` : renderState(state));
    return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    process.exitCode = main(process.argv.slice(2));
}
