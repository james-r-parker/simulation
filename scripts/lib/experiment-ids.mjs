// Allocates the next experiment id: one above the highest `evals/ledger/E<id>.json` on the working tree, on
// `origin/main` and on every `origin/*` branch, so no id range is reserved by hand (docs/designs/agent-workflow.md,
// Experiment ledger). `git` is injected so a test runs it on a fixture repository or a stub.
import { spawnSync } from 'node:child_process';
import { readLedger } from './ledger.mjs';

/**
 * @typedef {(args: string[]) => string} Git runs git in the repository and returns its stdout, empty on failure
 */

/**
 * @param {string} root the repository root
 * @returns {Git} a runner that returns the standard output of `git <args>` run in `root`, empty when git fails
 */
export function gitIn(root) {
    return (args) => {
        const run = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        return run.status === 0 ? run.stdout : '';
    };
}

/**
 * @param {string} text git output, one path per line
 * @returns {number[]} the ids of the `E<id>.json` paths in it
 */
export function idsInPaths(text) {
    return text
        .split('\n')
        .map((line) => /(?:^|\/)E(\d+)\.json$/.exec(line.trim()))
        .filter((match) => match !== null)
        .map((match) => Number(match?.[1]));
}

/**
 * @param {Git} git a git runner
 * @returns {string[]} `origin/main` and every `origin/*` branch
 */
export function remoteRefs(git) {
    const names = git(['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin']).split('\n');
    return [...new Set(['origin/main', ...names.filter((name) => name.startsWith('origin/'))])];
}

/**
 * @param {string} root the repository root
 * @param {Git} git a git runner
 * @returns {number} the highest id on the working tree, on `origin/main` and on every `origin/*` branch; 0 when none
 */
export function highestId(root, git) {
    const local = readLedger(root).map((record) => Number(String(record.id).slice(1)));
    const remote = remoteRefs(git).flatMap((ref) => idsInPaths(git(['ls-tree', '--name-only', ref, 'evals/ledger/'])));
    return Math.max(0, ...local, ...remote);
}

/**
 * @param {string} root the repository root
 * @param {Git} git a git runner
 * @returns {string} the next free id, `E<n>`
 */
export function nextId(root, git) {
    return `E${highestId(root, git) + 1}`;
}
