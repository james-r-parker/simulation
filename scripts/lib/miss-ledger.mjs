// The miss ledger (docs/designs/agent-workflow.md, Affected tests in CI). A pull request runs the tests its change can reach;
// the full run on the merged result runs them all. A test that fails there and was not in the pull request's reached list
// is a miss: an edge the selection did not see. The red-main issue records each miss as a marker line, and
// `scripts/miss-ledger.mjs check` keeps failing a change until the test is reached by the paths of the miss.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { affectedTests } from './affected.mjs';

const MARKER = /<!-- affected-miss (\{.*?\}) -->/g;

/**
 * Names the test files that failed in JUnit reports.
 * @param {string[]} reports the text of each JUnit XML file of the run
 * @returns {string[]} the sorted, unique test file paths with a failed or errored test case
 */
export function failedTests(reports) {
    const files = new Set();
    for (const xml of reports) {
        for (const m of xml.matchAll(/<testcase classname="([^"]+)"[^>]*>((?:(?!<\/testcase>)[\s\S])*)<\/testcase>/g)) {
            if (/<(?:failure|error)\b/.test(m[2] ?? '')) {
                files.add((m[1] ?? '').replace(/&amp;/g, '&'));
            }
        }
    }
    return [...files].sort();
}

/**
 * Compares the failures of the full run with what the pull request ran.
 * @param {string[]} failed the failed test files of the full run
 * @param {{mode: string, tests: string[], changed?: string[]} | null} reached the pull request's `affected.json`, or null when it is gone
 * @returns {{test: string, changed: string[]}[]} the misses: failed tests the `affected` selection did not reach (none when the pull request ran the whole suite)
 */
export function findMisses(failed, reached) {
    if (reached === null || reached.mode !== 'affected') {
        return [];
    }
    return failed
        .filter((test) => !reached.tests.includes(test))
        .map((test) => ({ test, changed: reached.changed ?? [] }));
}

/**
 * @param {{pr: number | null, test: string, changed: string[]}[]} misses the misses, with their pull request
 * @returns {string} one marker line per miss, which `parseMisses` reads back
 */
export function renderMarkers(misses) {
    return misses.map((miss) => `<!-- affected-miss ${JSON.stringify(miss)} -->`).join('\n');
}

/**
 * @param {string} text an issue body
 * @returns {{pr: number | null, test: string, changed: string[]}[]} the misses its marker lines record
 */
export function parseMisses(text) {
    return [...text.matchAll(MARKER)].flatMap((m) => {
        try {
            return [JSON.parse(m[1] ?? '')];
        } catch {
            return [];
        }
    });
}

/**
 * The body of the red-main issue.
 * @param {{sha: string, run: string, pr: number | null, jobs: string[], failed: string[], misses: {test: string, changed: string[]}[], note: string}} facts what the full run found
 * @returns {string} Markdown
 */
export function renderIssueBody({ sha, run, pr, jobs, failed, misses, note }) {
    const lines = [
        `The full run on main is red at ${sha}${pr === null ? '' : ` (pull request #${pr})`}: ${run}`,
        '',
        `Failed jobs: ${jobs.length > 0 ? jobs.join(', ') : 'none named'}`,
        `Failed test files: ${failed.length > 0 ? failed.join(', ') : 'none named'}`,
    ];
    if (note !== '') {
        lines.push('', note);
    }
    if (misses.length > 0) {
        lines.push(
            '',
            `Misses: the pull request ran the tests its change reached and these were not among them. Declare the edge (a \`// reads:\` comment, or fix \`scripts/lib/affected.mjs\`); the \`affected-misses\` check fails every change until the test is reached by the paths below.`,
            ...misses.map((miss) => `- \`${miss.test}\` was not reached by ${miss.changed.length} changed path(s)`),
            '',
            renderMarkers(misses.map((miss) => ({ pr, ...miss }))),
        );
    }
    return `${lines.join('\n')}\n`;
}

/**
 * Lists the recorded misses this tree still does not reach.
 * @param {{pr: number | null, test: string, changed: string[]}[]} misses the open misses
 * @param {string} root repo root
 * @returns {string[]} one line per miss whose test the current selection still leaves out of its change
 */
export function unresolvedMisses(misses, root) {
    return misses
        .filter((miss) => {
            if (!existsSync(join(root, miss.test))) {
                return false; // the test is gone: nothing left to reach
            }
            const result = affectedTests(miss.changed, { root });
            return result.mode === 'affected' && !result.tests.includes(miss.test);
        })
        .map(
            (miss) =>
                `${miss.test}: a miss of pull request #${miss.pr ?? '?'} (not reached by its ${miss.changed.length} changed path(s)); declare the edge with "// reads: <path>" or teach scripts/lib/affected.mjs`,
        );
}
