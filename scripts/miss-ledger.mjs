#!/usr/bin/env node
// The red-main issue and the miss comparison (docs/designs/agent-workflow.md, Affected tests in CI, The miss ledger).
//
//   node scripts/miss-ledger.mjs report   # on a red full run on main: open (or add to) the red-main issue
//   node scripts/miss-ledger.mjs check    # fail while an open miss is still not reached by the selection
//
// `report` reads GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_RUN_ID and a GH_TOKEN for `gh`. It names the merge commit, the
// failed jobs and test files (from the JUnit reports the failed jobs uploaded), finds the merged pull request and its
// `affected` artifact, and records each failed test the pull request did not reach as a miss. `check` reads the open
// issues labelled `affected-miss` and runs the selection on this tree for each recorded miss.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { failedTests, findMisses, parseMisses, renderIssueBody, unresolvedMisses } from './lib/miss-ledger.mjs';

/**
 * Runs `gh`.
 * @param {string[]} args the arguments
 * @returns {string} stdout; throws when `gh` fails
 */
export function gh(args) {
    const run = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 1e8 });
    if (run.status !== 0) {
        throw new Error(`gh ${args.slice(0, 3).join(' ')} exited ${run.status}: ${run.stderr.trim()}`);
    }
    return run.stdout;
}

/**
 * @param {string} dir a directory to search
 * @param {RegExp} pattern the file names to read
 * @returns {string[]} the text of each matching file, depth first
 */
function readAll(dir, pattern) {
    if (!existsSync(dir)) {
        return [];
    }
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            return readAll(path, pattern);
        }
        return pattern.test(entry.name) ? [readFileSync(path, 'utf8')] : [];
    });
}

/**
 * Downloads artifacts of a run, or nothing when there are none.
 * @param {(args: string[]) => string} run the `gh` runner
 * @param {string} id the run id
 * @param {string[]} filter `--name <n>` or `--pattern <p>`
 * @param {string} dir where they go
 * @returns {boolean} whether the download worked
 */
function download(run, id, filter, dir) {
    try {
        run(['run', 'download', id, ...filter, '--dir', dir]);
        return true;
    } catch {
        return false;
    }
}

/**
 * Finds the pull request that made a commit on main and the reached list of its last green run.
 * @param {{run: (args: string[]) => string, repo: string, sha: string, dir: string}} env the `gh` runner and the commit
 * @returns {{pr: number | null, reached: {mode: string, tests: string[], changed?: string[]} | null, note: string}} what was found, and a note when something is missing
 */
export function pullRequestOf({ run, repo, sha, dir }) {
    try {
        const pulls = JSON.parse(run(['api', `repos/${repo}/commits/${sha}/pulls`]));
        const pull = pulls[0];
        if (!pull) {
            return { pr: null, reached: null, note: 'No pull request is linked to this commit (a direct push).' };
        }
        const runs = JSON.parse(
            run([
                'run',
                'list',
                '--workflow',
                'check.yml',
                '--event',
                'pull_request',
                '--branch',
                pull.head.ref,
                '--limit',
                '30',
                '--json',
                'databaseId,headSha,conclusion',
            ]),
        );
        const green = runs.find((/** @type {any} */ r) => r.headSha === pull.head.sha && r.conclusion === 'success');
        const found = green !== undefined && download(run, String(green.databaseId), ['--name', 'affected'], dir);
        if (!found) {
            return {
                pr: pull.number,
                reached: null,
                note: 'The pull request has no reached list (its green run or its `affected` artifact is gone), so no miss can be read.',
            };
        }
        return { pr: pull.number, reached: JSON.parse(readAll(dir, /^affected\.json$/)[0] ?? 'null'), note: '' };
    } catch (error) {
        return {
            pr: null,
            reached: null,
            note: `The pull request could not be read: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

/**
 * Opens the red-main issue, or adds to the one that is open.
 * @param {(args: string[]) => string} run the `gh` runner
 * @param {{title: string, body: string, misses: boolean}} issue what to write
 * @param {string} dir a scratch directory for the body file
 * @returns {string} what was done, for the log
 */
export function writeIssue(run, { title, body, misses }, dir) {
    const file = join(dir, 'body.md');
    writeFileSync(file, body);
    const open = JSON.parse(
        run(['issue', 'list', '--label', 'red-main', '--state', 'open', '--limit', '1', '--json', 'number']),
    );
    if (open.length > 0) {
        run(['issue', 'comment', String(open[0].number), '--body-file', file]);
        return `commented on #${open[0].number}`;
    }
    const labels = misses ? ['red-main', 'affected-miss'] : ['red-main'];
    for (const label of labels) {
        run(['label', 'create', label, '--force', '--color', label === 'red-main' ? 'B60205' : 'FBCA04']);
    }
    run(['issue', 'create', '--title', title, '--label', labels.join(','), '--body-file', file]);
    return `opened ${title}`;
}

/**
 * The `report` command.
 * @param {{run: (args: string[]) => string, env: Record<string, string | undefined>, log: (line: string) => void}} io the `gh` runner, the environment and a logger
 * @returns {number} the exit code
 */
export function report({ run, env, log }) {
    const { GITHUB_REPOSITORY: repo = '', GITHUB_SHA: sha = '', GITHUB_RUN_ID: id = '' } = env;
    const dir = mkdtempSync(join(tmpdir(), 'miss-ledger-'));
    try {
        const jobs = JSON.parse(run(['run', 'view', id, '--json', 'jobs']))
            .jobs.filter((/** @type {any} */ job) => job.conclusion === 'failure')
            .map((/** @type {any} */ job) => job.name);
        download(run, id, ['--pattern', 'test-results-*'], join(dir, 'junit'));
        const failed = failedTests(readAll(join(dir, 'junit'), /^junit-.*\.xml$/));
        const { pr, reached, note } = pullRequestOf({ run, repo, sha, dir: join(dir, 'affected') });
        const misses = findMisses(failed, reached).map((miss) => ({ pr, ...miss }));
        const body = renderIssueBody({
            sha: sha.slice(0, 7),
            run: `https://github.com/${repo}/actions/runs/${id}`,
            pr,
            jobs,
            failed,
            misses,
            note,
        });
        log(writeIssue(run, { title: `main is red at ${sha.slice(0, 7)}`, body, misses: misses.length > 0 }, dir));
        return 0;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * The `check` command: fails while an open miss is still not reached.
 * @param {{run: (args: string[]) => string, root: string, log: (line: string) => void}} io the `gh` runner, the repo root and a logger
 * @returns {number} 1 when a recorded miss is still unreached, else 0 (also when the issues cannot be listed: a fork has no token)
 */
export function check({ run, root, log }) {
    let bodies;
    try {
        bodies = JSON.parse(
            run(['issue', 'list', '--label', 'affected-miss', '--state', 'open', '--json', 'body']),
        ).map((/** @type {{body: string}} */ issue) => issue.body);
    } catch (error) {
        log(
            `affected-misses: the open issues could not be listed (${error instanceof Error ? error.message : String(error)}); skipped`,
        );
        return 0;
    }
    const problems = unresolvedMisses(bodies.flatMap(parseMisses), root);
    problems.forEach((line) => log(line));
    log(
        problems.length === 0
            ? 'affected-misses: no open miss is left unreached'
            : `affected-misses: ${problems.length} open miss(es)`,
    );
    return problems.length === 0 ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const command = process.argv[2];
    if (command === 'report') {
        process.exitCode = report({ run: gh, env: process.env, log: console.log });
    } else if (command === 'check') {
        process.exitCode = check({ run: gh, root, log: console.log });
    } else {
        console.log('usage: node scripts/miss-ledger.mjs report | check');
        process.exitCode = 2;
    }
}
