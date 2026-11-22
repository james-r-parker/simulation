#!/usr/bin/env node
// Prints what failed in a PR's (or a run's) newest failed CI run: per failed job the failing tests with their first
// assertion, perf FAIL lines and timeouts. Usage: scripts/ci-failures.sh <pr-number|run-id> [--full]
// (docs/commands.md, "Read a failed CI run"). Parsing lives in scripts/lib/ci-log.mjs.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { summariseJob } from './lib/ci-log.mjs';

/** @param {string[]} args gh arguments @returns {string} stdout */
const gh = (args) =>
    execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
/** @param {string[]} args gh arguments @returns {any} parsed stdout */
const json = (args) => JSON.parse(gh(args));

/**
 * @param {string} id a PR number (up to 7 digits) or a run id
 * @returns {number} the run to read: the run id, or the newest failed run on the PR's head commit (else its branch)
 */
function resolveRun(id) {
    if (id.length > 7) {
        return Number(id);
    }
    const pr = json(['pr', 'view', id, '--json', 'headRefName,headRefOid']);
    const runs = json([
        'run',
        'list',
        '--branch',
        pr.headRefName,
        '--limit',
        '20',
        '--json',
        'databaseId,conclusion,headSha',
    ]);
    const failed = runs.filter((/** @type {any} */ r) => r.conclusion === 'failure');
    const run = failed.find((/** @type {any} */ r) => r.headSha === pr.headRefOid) ?? failed[0];
    if (!run) {
        throw new Error(`no failed run for PR ${id}`);
    }
    return run.databaseId;
}

/**
 * @param {string} id a PR number or run id
 * @param {{ full?: boolean }} [opts] `full` lifts the line cap
 * @returns {string[]} the summary lines
 */
export function ciFailures(id, { full = false } = {}) {
    const run = resolveRun(id);
    const { jobs } = json(['api', `repos/{owner}/{repo}/actions/runs/${run}/jobs?per_page=100`]);
    const bad = jobs.filter((/** @type {any} */ j) => j.conclusion === 'failure');
    const out = [`run ${run}: ${bad.length} failed job(s)`];
    for (const job of bad) {
        let log;
        try {
            log = gh(['api', `repos/{owner}/{repo}/actions/jobs/${job.id}/logs`, '--allow-escape-sequences']);
        } catch (error) {
            log = `##[error]could not read the log: ${String(/** @type {Error} */ (error).message).split('\n')[0]}`;
        }
        out.push(...summariseJob(job.name, log, { full }));
    }
    return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2);
    const id = args.find((a) => /^\d+$/.test(a));
    if (!id) {
        console.error('usage: ci-failures.sh <pr-number|run-id> [--full]');
        process.exit(2);
    }
    try {
        console.log(ciFailures(id, { full: args.includes('--full') }).join('\n'));
    } catch (error) {
        console.error(/** @type {Error} */ (error).message);
        process.exit(1);
    }
}
