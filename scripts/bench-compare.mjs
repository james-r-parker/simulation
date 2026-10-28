// bench-compare: fails when a `bench.*` metric's head median is over 10% above the base median (`--base <ref>`).
// `--threshold=<fraction>` changes the 10%. `--noise=<k>` widens each metric's limit to `k` times its measured noise
// (the larger relative standard deviation of the base and head runs) when that is above the threshold, so a noisy
// shared runner does not fail the nightly (docs/designs/quality-gates-and-test-tiers.md).
// Exit codes: 0 within the limit, 1 regression or error, 3 skipped (the reason is on stdout as `skipped: ...`).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { median } from './bench.mjs';

/** Fraction above the base median a head median may be. */
export const TOLERANCE = 0.1;
export const SKIP_EXIT = 3;
// The base worktree's install: errors only, so a peer-range warning flood cannot bury the bench table in the digest.
export const BASE_INSTALL_ARGS = ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'];
const DEFAULT_RUNS = 5;
const OPTION_VALUE = /^\d+(\.\d+)?$/;
const DEFAULT_SIZES = '500';
const STALE_HOURS = 25;
const METRIC_PREFIX = 'bench.';

// Git exports GIT_DIR and friends to hooks; a child git that inherits them acts on the wrong repository.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

/**
 * @param {string} arg a `--runs=<n>` argument
 * @returns {number} the run count
 */
function parseRuns(arg) {
    const runs = Number(arg.slice('--runs='.length));
    if (!Number.isInteger(runs) || runs < 1) {
        throw new Error(`--runs must be a positive integer, got: ${arg}`);
    }
    return runs;
}

/**
 * @param {string} arg a `--sizes=<list>` argument
 * @returns {string} the comma-separated agent counts
 */
function parseSizes(arg) {
    const sizes = arg.slice('--sizes='.length);
    if (!/^\d+(,\d+)*$/.test(sizes)) {
        throw new Error(`--sizes must be comma-separated positive integers, got: ${arg}`);
    }
    return sizes;
}

/**
 * @param {string} arg a `--name=<number>` argument
 * @returns {number} the non-negative number
 */
function parseNumber(arg) {
    const text = arg.slice(arg.indexOf('=') + 1);
    if (!OPTION_VALUE.test(text)) {
        throw new Error(`${arg.slice(0, arg.indexOf('='))} must be a non-negative number, got: ${arg}`);
    }
    return Number(text);
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {{base: string | null, sizes: string, skipCheck: boolean, runs: number, threshold: number, noise: number}} parsed
 * options; `base` null means the default
 */
export function parseArgs(argv) {
    let base = null;
    let sizes = DEFAULT_SIZES;
    let skipCheck = false;
    let runs = DEFAULT_RUNS;
    let threshold = TOLERANCE;
    let noise = 0;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--base') {
            base = argv[++i];
            if (!base) {
                throw new Error('--base needs a git ref');
            }
        } else if (arg.startsWith('--base=')) {
            base = arg.slice('--base='.length);
        } else if (arg.startsWith('--sizes=')) {
            sizes = parseSizes(arg);
        } else if (arg.startsWith('--runs=')) {
            runs = parseRuns(arg);
        } else if (arg.startsWith('--threshold=')) {
            threshold = parseNumber(arg);
        } else if (arg.startsWith('--noise=')) {
            noise = parseNumber(arg);
        } else if (arg === '--skip-check') {
            skipCheck = true;
        } else {
            throw new Error(
                `unknown argument: ${arg} (expected --base <ref>, --sizes=500, --runs=5, --threshold=0.1, --noise=3 or --skip-check)`,
            );
        }
    }
    return { base, sizes, skipCheck, runs, threshold, noise };
}

/**
 * @param {{baseSha: string, headSha: string, basePackageJson: string | null}} input the resolved base and its package.json text
 * @returns {string | null} why the comparison is skipped, or null to run it
 */
export function skipReason({ baseSha, headSha, basePackageJson }) {
    if (baseSha === headSha) {
        return 'the base is HEAD';
    }
    /** @type {{scripts?: Record<string, string>}} */
    let parsed;
    try {
        parsed = JSON.parse(basePackageJson ?? '{}');
    } catch {
        throw new Error('the base package.json is not valid JSON');
    }
    return parsed.scripts?.bench ? null : 'the base has no bench script';
}

/**
 * @param {number[]} values one metric over the runs of one tree
 * @returns {number} the relative standard deviation (standard deviation over the mean), 0 for one run or a zero mean
 */
export function relativeNoise(values) {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    if (values.length < 2 || mean <= 0) {
        return 0;
    }
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance) / mean;
}

/**
 * @param {Array<Record<string, number>>} baseRuns bench JSON objects from the base tree
 * @param {Array<Record<string, number>>} headRuns bench JSON objects from the head tree
 * @param {number} [tolerance] allowed fraction above the base median
 * @param {number} [noiseMultiplier] when above 0, a metric's limit is at least this times its measured noise
 * @returns {Array<{metric: string, base: number, head: number, change: number, limit: number, ok: boolean}>} one row per
 * `bench.*` metric in both
 */
export function compare(baseRuns, headRuns, tolerance = TOLERANCE, noiseMultiplier = 0) {
    const rows = [];
    for (const metric of Object.keys(baseRuns[0] ?? {}).sort()) {
        const baseValues = baseRuns.map((run) => run[metric]);
        const headValues = headRuns.map((run) => run[metric]);
        /** @param {number[]} values */
        const present = (values) => values.length > 0 && values.every((v) => Number.isFinite(v));
        if (!metric.startsWith(METRIC_PREFIX) || !present(baseValues) || !present(headValues)) {
            continue;
        }
        const base = median(baseValues);
        const head = median(headValues);
        const change = base > 0 ? head / base - 1 : head > 0 ? Infinity : 0;
        const noise = Math.max(relativeNoise(baseValues), relativeNoise(headValues));
        const limit = Math.max(tolerance, noiseMultiplier * noise);
        rows.push({ metric, base, head, change, limit, ok: change <= limit });
    }
    return rows;
}

/**
 * @param {ReturnType<typeof compare>} rows the comparison rows
 * @returns {string[]} one line per metric with base median, head median and change, `FAIL` marking regressions
 */
export function formatRows(rows) {
    return rows.map((row) => {
        const pct = `${row.change >= 0 ? '+' : ''}${(row.change * 100).toFixed(1)}%`;
        const mark = row.ok ? 'ok  ' : 'FAIL';
        return `${mark} ${row.metric}: base ${row.base}, head ${row.head}, change ${pct} (limit +${(row.limit * 100).toFixed(1)}%)`;
    });
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
 * @param {string[]} args git arguments
 * @param {string} cwd working directory
 * @returns {string | null} trimmed stdout, or null when git fails
 */
function gitOrNull(args, cwd) {
    try {
        return git(args, cwd);
    } catch {
        return null;
    }
}

/**
 * @param {string | null} ref the --base value, or null for the default
 * @param {number} nowSeconds the current time in epoch seconds
 * @param {string} cwd the repository
 * @returns {string | null} the base commit sha, or null when origin/main is unavailable
 */
function resolveBase(ref, nowSeconds, cwd) {
    if (ref) {
        return git(['rev-parse', '--verify', `${ref}^{commit}`], cwd);
    }
    try {
        const head = git(['rev-parse', 'HEAD'], cwd);
        const mergeBase = git(['merge-base', 'HEAD', 'origin/main'], cwd);
        if (mergeBase !== head) {
            return mergeBase;
        }
        const before = String(nowSeconds - STALE_HOURS * 3600);
        return git(['rev-list', '-1', `--before=${before}`, 'origin/main'], cwd) || null;
    } catch {
        return null;
    }
}

/**
 * @param {string} cwd the tree to benchmark
 * @param {string} sizes the --sizes value
 * @returns {Record<string, number>} one bench run's flat metrics
 */
function runBench(cwd, sizes) {
    const out = execFileSync('npm', ['run', '--silent', 'bench', '--', '--json', `--sizes=${sizes}`], {
        cwd,
        env: ENV,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
        maxBuffer: 1 << 24,
    });
    return JSON.parse(out);
}

/**
 * Checks the base out into a temporary worktree, runs `work` with its path, and always removes the worktree.
 * @param {string} baseSha the commit to check out
 * @param {(dir: string) => void} work the work to do in the worktree
 * @param {string} cwd the repository
 *
 * The bench runs are synchronous, so a SIGTERM sent to this process alone is handled only after the running bench
 * exits; Ctrl-C reaches the whole process group and cleans up at once.
 */
function withWorktree(baseSha, work, cwd) {
    const dir = join(mkdtempSync(join(tmpdir(), 'bench-compare-')), 'base');
    const remove = () => {
        try {
            git(['worktree', 'remove', '--force', dir], cwd);
        } catch {
            // never added, or already removed
        }
        git(['worktree', 'prune'], cwd);
    };
    /** @param {string} signal */
    const onSignal = (signal) => {
        remove();
        rmSync(dirname(dir), { recursive: true, force: true });
        process.exit(signal === 'SIGINT' ? 130 : 143);
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    try {
        git(['worktree', 'add', '--detach', dir, baseSha], cwd);
        execFileSync('npm', BASE_INSTALL_ARGS, {
            cwd: dir,
            env: ENV,
            stdio: ['ignore', 'ignore', 'inherit'],
        });
        work(dir);
    } finally {
        remove();
        rmSync(dirname(dir), { recursive: true, force: true });
        process.off('SIGINT', onSignal);
        process.off('SIGTERM', onSignal);
    }
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {string} [cwd] the repository to compare in
 * @returns {number} the process exit code
 */
export function main(argv, cwd = process.cwd()) {
    const { base, sizes, skipCheck, runs, threshold, noise } = parseArgs(argv);
    const baseSha = resolveBase(base, Math.floor(Date.now() / 1000), cwd);
    if (baseSha === null) {
        console.log('skipped: no base (origin/main is missing or has no commit old enough)');
        return SKIP_EXIT;
    }
    const headSha = git(['rev-parse', 'HEAD'], cwd);
    const basePackageJson = gitOrNull(['show', `${baseSha}:package.json`], cwd);
    const reason = skipReason({ baseSha, headSha, basePackageJson });
    if (reason) {
        console.log(`skipped: ${reason}`);
        return SKIP_EXIT;
    }
    if (skipCheck) {
        return 0;
    }
    /** @type {Array<Record<string, number>>} */
    const baseRuns = [];
    /** @type {Array<Record<string, number>>} */
    const headRuns = [];
    withWorktree(
        baseSha,
        (dir) => {
            for (let i = 0; i < runs; i++) {
                baseRuns.push(runBench(dir, sizes));
                headRuns.push(runBench(cwd, sizes));
            }
        },
        cwd,
    );
    const rows = compare(baseRuns, headRuns, threshold, noise);
    if (rows.length === 0) {
        throw new Error('no bench.* metric is present in both trees');
    }
    console.log(`base ${baseSha.slice(0, 9)} head ${headSha.slice(0, 9)}, median of ${runs} runs, --sizes=${sizes}`);
    console.log(formatRows(rows).join('\n'));
    return rows.every((row) => row.ok) ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        process.exitCode = main(process.argv.slice(2));
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}
