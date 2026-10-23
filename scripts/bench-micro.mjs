// Function microbenchmarks (`npm run bench:micro`): runs bench/micro/*.bench.js with Vitest's bench mode and prints
// ops/s per function. `--compare <ref>` runs the same files on a detached worktree of <ref> and on this tree,
// alternating, and prints the change per function against the margin of error. A tool, not a gate: exit code 0.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exitCodeOf, intValue, parseFlags } from './lib/cli-args.mjs';
import {
    clearResults,
    compareRows,
    formatCompare,
    formatResults,
    medianResults,
    readResults,
} from './lib/micro-bench.mjs';

/** @typedef {import('./lib/micro-bench.mjs').MicroResult} MicroResult */

const USAGE = 'usage: bench-micro [--compare <ref>] [--runs <n>] [--filter <text>]';
const DEFAULT_RUNS = 3;
// Git exports GIT_DIR and friends to hooks; a child git that inherits them acts on the wrong repository.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
// Quiet install for a ref whose lockfile differs: errors only, no scripts.
const INSTALL_ARGS = ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'];

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {{compare: string | null, runs: number, filter: string | null}} parsed options
 */
export function parseArgs(argv) {
    /**
     * @param {string} flag the flag name
     * @param {string} key the option it sets
     * @returns {(value: string | undefined) => [string, string]} the value parser
     */
    const text = (flag, key) => (value) => {
        if (value === undefined || value === '') {
            throw new Error(`${flag} needs a value\n${USAGE}`);
        }
        return [key, value];
    };
    const opts = parseFlags(argv, {
        valueFlags: {
            '--compare': text('--compare', 'compare'),
            '--filter': text('--filter', 'filter'),
            '--runs': (value, flag) => ['runs', intValue(flag, value, 1, USAGE)],
        },
        defaults: { compare: null, runs: DEFAULT_RUNS, filter: null },
        usage: USAGE,
    });
    return /** @type {{compare: string | null, runs: number, filter: string | null}} */ (opts);
}

/**
 * @param {string[]} args git arguments
 * @param {string} cwd working directory
 * @returns {string} trimmed stdout
 */
function git(args, cwd) {
    return execFileSync('git', args, { cwd, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/**
 * Runs the bench files in a tree, quietly, and reads back what they wrote.
 * @param {string} tree the tree to bench
 * @param {string | null} filter a file-name filter handed to Vitest
 * @returns {Map<string, MicroResult>} the results
 */
export function runSuite(tree, filter) {
    clearResults(tree);
    execFileSync('npx', ['vitest', 'bench', '--run', ...(filter ? [filter] : [])], {
        cwd: tree,
        env: ENV,
        stdio: ['ignore', 'ignore', 'inherit'],
    });
    return readResults(tree);
}

/**
 * Makes the ref's tree able to run this tree's bench files: they and the Vitest config are copied over it, and its
 * dependencies are this tree's (a link) when the lockfile is the same, else installed.
 * @param {string} refTree a checkout of the ref
 * @param {string} head the tree being benchmarked
 * @param {string} ref the ref the checkout is of
 * @returns {void}
 */
export function prepareRefTree(refTree, head, ref) {
    cpSync(join(head, 'bench', 'micro'), join(refTree, 'bench', 'micro'), { recursive: true });
    cpSync(join(head, 'vitest.config.js'), join(refTree, 'vitest.config.js'));
    if (git(['diff', '--name-only', ref, 'HEAD', '--', 'package-lock.json'], head) === '') {
        symlinkSync(join(head, 'node_modules'), join(refTree, 'node_modules'), 'dir');
    } else {
        execFileSync('npm', INSTALL_ARGS, { cwd: refTree, env: ENV, stdio: ['ignore', 'ignore', 'pipe'] });
    }
}

/**
 * Checks the ref out into a temporary worktree, runs `work` with its path, and always removes the worktree.
 * @param {string} ref the git ref
 * @param {string} head the tree being benchmarked
 * @param {(dir: string) => void} work the work to do in the worktree
 * @returns {void}
 */
function withRefTree(ref, head, work) {
    const sha = git(['rev-parse', '--verify', `${ref}^{commit}`], head);
    const parent = mkdtempSync(join(tmpdir(), 'bench-micro-'));
    const dir = join(parent, 'ref');
    try {
        git(['worktree', 'add', '--detach', dir, sha], head);
        prepareRefTree(dir, head, sha);
        work(dir);
    } finally {
        // Deleting the checkout and pruning drops the worktree's registration, whether or not it was ever added.
        rmSync(parent, { recursive: true, force: true });
        git(['worktree', 'prune'], head);
    }
}

/**
 * @param {string} ref the ref to compare against
 * @param {{runs: number, filter: string | null}} options runs per tree and the file filter
 * @param {string} head the tree being benchmarked
 * @returns {string[]} the report lines
 */
function compareWithRef(ref, { runs, filter }, head) {
    /** @type {Array<Map<string, MicroResult>>} */
    const baseRuns = [];
    /** @type {Array<Map<string, MicroResult>>} */
    const headRuns = [];
    withRefTree(ref, head, (dir) => {
        for (let i = 0; i < runs; i++) {
            baseRuns.push(runSuite(dir, filter));
            headRuns.push(runSuite(head, filter));
        }
    });
    const sha = (/** @type {string} */ rev) => git(['rev-parse', '--short=9', rev], head);
    return [
        `base ${ref} (${sha(ref)}) head ${sha('HEAD')}, median of ${runs} alternating runs`,
        ...formatCompare(compareRows(medianResults(baseRuns), medianResults(headRuns))),
    ];
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {string} [cwd] the repository to benchmark
 * @returns {Promise<number>} the process exit code
 */
export function main(argv, cwd = process.cwd()) {
    return exitCodeOf(async () => {
        const options = parseArgs(argv);
        const lines =
            options.compare === null
                ? formatResults(runSuite(cwd, options.filter))
                : compareWithRef(options.compare, options, cwd);
        console.log(lines.join('\n'));
    });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
