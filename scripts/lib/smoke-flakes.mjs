// The browser smoke's flakes (docs/designs/agent-workflow.md, Before the push, Browser smoke). Playwright reruns a
// failed test once (`retries` in playwright.config.js); a test that passes on the rerun is `flaky` in its JSON report.
// `report` turns that report into `.checklogs/smoke-flakes.json`; `digest` merges the files of many runs into the body
// of the one `smoke-flakes` issue that the nightly workflow keeps open.
//
// Usage: node scripts/lib/smoke-flakes.mjs report <playwright-report.json> <smoke-flakes.json>
//        node scripts/lib/smoke-flakes.mjs digest <dir-of-smoke-flakes-files> [--runs-url <url>]
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ESC = String.fromCharCode(27);
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');
const MAX_ERROR_CHARS = 400;

/**
 * @typedef {{spec: string, title: string, error: string, trace: string | null}} Flake
 */

/**
 * Walks a Playwright JSON report's suites, calling `visit` on every spec.
 * @param {any[]} suites report.suites or a suite's suites
 * @param {(spec: any) => void} visit called with each spec object
 * @returns {void}
 */
function eachSpec(suites, visit) {
    for (const suite of suites ?? []) {
        (suite.specs ?? []).forEach(visit);
        eachSpec(suite.suites, visit);
    }
}

/**
 * @param {any} spec a spec of the report
 * @param {any} test one of its tests, whose status is `flaky`
 * @returns {Flake} the spec file, its title, the first error and the trace of the rerun
 */
function flakeOf(spec, test) {
    const results = test.results ?? [];
    const failed = results.find((/** @type {any} */ r) => r.status !== 'passed') ?? {};
    // Tracing is on for the rerun only (playwright.config.js), so the trace sits on a later attempt.
    const trace = results
        .flatMap((/** @type {any} */ r) => r.attachments ?? [])
        .find((/** @type {any} */ a) => a.name === 'trace');
    const message = String(failed.error?.message ?? 'no error recorded').replace(ANSI, '');
    return { spec: spec.file, title: spec.title, error: message.slice(0, MAX_ERROR_CHARS), trace: trace?.path ?? null };
}

/**
 * Lists the tests that failed and then passed on the rerun.
 * @param {any} report a Playwright JSON report
 * @returns {Flake[]} one entry per flaky test
 */
export function collectFlakes(report) {
    /** @type {Flake[]} */
    const flakes = [];
    eachSpec(report.suites, (spec) => {
        for (const test of (spec.tests ?? []).filter((/** @type {any} */ t) => t.status === 'flaky')) {
            flakes.push(flakeOf(spec, test));
        }
    });
    return flakes;
}

/**
 * Writes the flakes file, or removes a stale one when nothing flaked.
 * @param {string} reportFile the Playwright JSON report; a missing file counts as no flakes
 * @param {string} outFile where `.checklogs/smoke-flakes.json` goes
 * @returns {number} how many flaky tests it wrote
 */
export function writeFlakes(reportFile, outFile) {
    const flakes = existsSync(reportFile) ? collectFlakes(JSON.parse(readFileSync(reportFile, 'utf8'))) : [];
    if (flakes.length === 0) {
        rmSync(outFile, { force: true });
        return 0;
    }
    writeFileSync(outFile, `${JSON.stringify(flakes, null, 2)}\n`);
    return flakes.length;
}

/**
 * Reads every `smoke-flakes.json` under a directory, one folder per run.
 * @param {string} dir directory holding the downloaded artifacts (`<run id>/smoke-flakes.json`)
 * @returns {Flake[][]} the flakes of each run that had a file
 */
export function readRuns(dir) {
    if (!existsSync(dir)) {
        return [];
    }
    const runs = [];
    for (const name of readdirSync(dir)) {
        const file = join(dir, name, 'smoke-flakes.json');
        if (statSync(join(dir, name)).isDirectory() && existsSync(file)) {
            runs.push(JSON.parse(readFileSync(file, 'utf8')));
        }
    }
    return runs;
}

/**
 * The body of the `smoke-flakes` issue: each flaked spec, how many runs it flaked in and its latest error.
 * @param {Flake[][]} runs the flakes of each run
 * @param {string} [runsUrl] where the runs are listed
 * @returns {string} Markdown; names no spec when none flaked
 */
export function issueBody(runs, runsUrl = '') {
    /** @type {Map<string, {runs: number, error: string}>} */
    const byTest = new Map();
    for (const run of runs) {
        for (const flake of run) {
            const key = `${flake.spec} > ${flake.title}`;
            byTest.set(key, { runs: (byTest.get(key)?.runs ?? 0) + 1, error: flake.error });
        }
    }
    const parts = [
        `Browser smoke specs that failed and passed on the rerun in the last 7 days of \`check\` runs${runsUrl ? ` (${runsUrl})` : ''}.`,
        '',
    ];
    if (byTest.size === 0) {
        return [...parts, 'None flaked.', ''].join('\n');
    }
    const ranked = [...byTest].sort((a, b) => b[1].runs - a[1].runs || a[0].localeCompare(b[0]));
    for (const [name, { runs: count, error }] of ranked) {
        parts.push(`- \`${name}\`: ${count} run(s). Last error: ${error.split('\n')[0]}`);
    }
    return [...parts, ''].join('\n');
}

/**
 * Runs the CLI.
 * @param {string[]} argv `report <report> <out>` or `digest <dir> [--runs-url <url>]`
 * @returns {number} exit status
 */
export function main(argv) {
    const [mode, a, b, c] = argv;
    if (mode === 'report' && a && b) {
        console.log(`smoke flakes: ${writeFlakes(a, b)}`);
        return 0;
    }
    if (mode === 'digest' && a) {
        console.log(issueBody(readRuns(a), b === '--runs-url' ? c : ''));
        return 0;
    }
    console.error('usage: smoke-flakes.mjs report <report.json> <out.json> | digest <dir> [--runs-url <url>]');
    return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    process.exitCode = main(process.argv.slice(2));
}
