#!/usr/bin/env node
// Picks the tests a pull request runs (docs/designs/agent-workflow.md, Affected tests in CI): the mode, the reached test
// files and the `test` job matrix of .github/workflows/check.yml. Anything it cannot read or classify is the full suite.
//
// Usage:
//   node scripts/affected.mjs <base-ref> [--out <file>] [--github-output <file>]   # the paths changed since <base-ref>
//   node scripts/affected.mjs --stdin ...                                          # the paths on stdin, one per line
//   node scripts/affected.mjs --full ...                                           # the whole suite (a push, a queue run)
//
// --out writes the result as JSON (the pull request's reached list, which the full run compares with its failures);
// --github-output appends `mode`, `has_tests`, `coverage` and `matrix` lines for a workflow step.
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { affectedTests } from './lib/affected.mjs';
import { affectedMatrix, fullMatrix } from './lib/affected-matrix.mjs';

/**
 * Lists the paths changed on HEAD since it left `base`.
 * @param {string} root repo root
 * @param {string} base ref or sha
 * @returns {string[]} the changed paths; throws when git cannot say
 */
export function diffPaths(root, base) {
    const run = spawnSync('git', ['diff', '--name-only', '--no-renames', `${base}...HEAD`], {
        cwd: root,
        encoding: 'utf8',
    });
    if (run.status !== 0) {
        throw new Error(`git diff ${base}...HEAD exited ${run.status}: ${run.stderr.trim()}`);
    }
    return run.stdout.split('\n').filter(Boolean);
}

/**
 * Computes the result for a run.
 * @param {{paths: string[] | null, root: string, reason?: string}} input the changed paths, or null for the full suite
 * @returns {{mode: string, tests: string[], why: Record<string, string>, changed: string[], matrix: {include: object[]}, has_tests: boolean, coverage: string}}
 *   the mode, reached files, reasons, the matrix, whether any job runs and the coverage the pull request runs
 */
export function select({ paths, root, reason = 'the whole suite was asked for' }) {
    const found = paths === null ? { mode: 'full', tests: [], why: { '*': reason } } : affectedTests(paths, { root });
    const include = found.mode === 'full' ? fullMatrix() : affectedMatrix(found.tests);
    const coverage = { full: 'whole', affected: 'related' }[found.mode] ?? 'none';
    return { ...found, changed: paths ?? [], matrix: { include }, has_tests: include.length > 0, coverage };
}

/**
 * Splits the arguments.
 * @param {string[]} argv the command line
 * @returns {{base: string | null, stdin: boolean, full: boolean, out: string | null, githubOutput: string | null}} the options
 */
function parseArgs(argv) {
    const value = (/** @type {string} */ flag) => (argv.includes(flag) ? (argv[argv.indexOf(flag) + 1] ?? null) : null);
    const flagged = new Set([value('--out'), value('--github-output')]);
    const base = argv.find((arg) => !arg.startsWith('--') && !flagged.has(arg)) ?? null;
    return {
        base,
        stdin: argv.includes('--stdin'),
        full: argv.includes('--full'),
        out: value('--out'),
        githubOutput: value('--github-output'),
    };
}

/**
 * Reads the changed paths the arguments name.
 * @param {ReturnType<typeof parseArgs>} args the options
 * @param {{root: string, stdin: () => string}} env repo root and a stdin reader
 * @returns {{paths: string[] | null, reason: string}} the paths, or null (with why) for the whole suite
 */
function readPaths(args, { root, stdin }) {
    if (args.full) {
        return { paths: null, reason: 'the whole suite was asked for' };
    }
    try {
        if (args.stdin) {
            return { paths: stdin().split('\n').filter(Boolean), reason: '' };
        }
        if (args.base !== null) {
            return { paths: diffPaths(root, args.base), reason: '' };
        }
    } catch (error) {
        return {
            paths: null,
            reason: `the diff could not be read (${error instanceof Error ? error.message : String(error)})`,
        };
    }
    return { paths: null, reason: 'no base ref: not a pull request' };
}

/**
 * @param {string[]} argv the command line
 * @param {{root: string, stdin?: () => string, log?: (line: string) => void}} env repo root, a stdin reader and a logger
 * @returns {number} the exit code
 */
export function main(argv, { root, stdin = () => readFileSync(0, 'utf8'), log = console.log }) {
    const args = parseArgs(argv);
    const result = select({ ...readPaths(args, { root, stdin }), root });
    log(
        `affected: ${result.mode}, ${result.tests.length} test file(s), ${result.matrix.include.length} job(s): ${Object.values(result.why)[0] ?? ''}`,
    );
    if (args.out !== null) {
        writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`);
    }
    if (args.githubOutput !== null) {
        const lines = [
            `mode=${result.mode}`,
            `has_tests=${result.has_tests}`,
            `coverage=${result.coverage}`,
            `matrix=${JSON.stringify(result.matrix)}`,
        ];
        appendFileSync(args.githubOutput, `${lines.join('\n')}\n`);
    }
    return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    process.exitCode = main(process.argv.slice(2), { root: fileURLToPath(new URL('..', import.meta.url)) });
}
