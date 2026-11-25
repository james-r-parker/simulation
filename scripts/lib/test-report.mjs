// The compact test report: which tests a scope runs, and a Vitest JSON result read down to a summary line, each failure and the
// tests close to their limit. Pure; scripts/test-report.mjs runs vitest (docs/commands.md, "Run the tests and read only the
// failures"). The CI log parser is scripts/lib/ci-log.mjs.
import { capLines, DEFAULT_CAP } from './ci-log.mjs';

export const SCOPES = ['fast', 'slow', 'affected', 'all'];

/**
 * @param {{ scope: string, files: string[], affected: string[] | null }} input the scope, the file filters and the affected
 *   list (null when scripts/affected.mjs says the whole suite)
 * @returns {{ env: Record<string, string>, filters: string[], empty: boolean, note: string }} the environment and the
 *   file filters for vitest; `empty` when nothing is selected
 */
export function selectTests({ scope, files, affected }) {
    if (!SCOPES.includes(scope)) {
        throw new Error(`--scope must be one of ${SCOPES.join(', ')}`);
    }
    if (scope === 'fast') {
        return { env: { TEST_SCOPE: 'fast' }, filters: files, empty: false, note: 'fast (no *.slow.test.js)' };
    }
    if (scope === 'slow') {
        const slow = files.map((f) => (f.endsWith('.slow.test.js') ? f : f.replace(/\.test\.js$/, '.slow.test.js')));
        return {
            env: {},
            filters: slow.length ? slow : ['.slow.test.js'],
            empty: false,
            note: 'slow (*.slow.test.js only)',
        };
    }
    if (scope === 'all' || affected === null) {
        const note = scope === 'all' ? 'all' : 'affected: the whole suite (the change reaches everything)';
        return { env: {}, filters: files, empty: false, note };
    }
    const reached = files.length ? affected.filter((t) => files.some((f) => t.includes(f))) : affected;
    return { env: {}, filters: reached, empty: reached.length === 0, note: `affected: ${reached.length} test file(s)` };
}

/**
 * @param {string} message a Vitest failure message with its stack
 * @param {string} root the repo root, stripped from paths
 * @returns {{ headline: string, detail: string[], where: string, timeout: number | null }} the first assertion, expected and
 *   received lines, the first frame inside the repo's tests or code, and the timeout when that was the cause
 */
export function readFailure(message, root) {
    const lines = message.replaceAll(`${root}/`, '').split('\n');
    const headline = (lines.find((l) => l.trim()) ?? '').trim();
    const detail = lines
        .map((l) => l.trim())
        .filter((l) => /^(- Expected|\+ Received|Expected:|Received:)/.test(l))
        .slice(0, 3);
    const frame = lines
        .map((l) => /(?<![\w-])\(?((?:test|js|scripts)\/[^\s():]+:\d+)(?::\d+)?\)?\s*$/.exec(l))
        .find(Boolean);
    const t = /timed out in (\d+)\s*ms/i.exec(headline);
    return { headline, detail, where: frame ? frame[1] : '', timeout: t ? Number(t[1]) : null };
}

/**
 * @param {any} a one failed assertion result
 * @param {string} rel the test file, relative
 * @param {string} root the repo root
 * @returns {string[]} its report lines
 */
function failedLines(a, rel, root) {
    const f = readFailure(a.failureMessages?.[0] ?? '', root);
    return [
        `${f.timeout === null ? 'FAIL' : 'TIMEOUT'} ${rel} > ${a.fullName}`,
        `  ${f.timeout === null ? f.headline : `timed out in ${f.timeout} ms`}`,
        ...f.detail.map((d) => `  ${d}`),
        `  at ${f.where || rel}`,
    ];
}

/**
 * @param {any} file one Vitest file result
 * @param {{ root: string, defaultTimeoutMs: number, limits?: any[] }} opts the repo root, the default limit and the
 *   reporter's near-limit list
 * @returns {{ lines: string[], slow: string[] }} the failure lines and the passing tests over half the limit
 */
function fileLines(file, { root, defaultTimeoutMs, limits }) {
    const rel = file.name.replace(`${root}/`, '');
    const lines = [];
    const slow = [];
    if (file.status === 'failed' && file.assertionResults.every((/** @type {any} */ a) => a.status !== 'failed')) {
        lines.push(`FAIL ${rel} (the file did not run)`, `  ${(file.message || '').split('\n')[0]}`);
    }
    for (const a of file.assertionResults) {
        if (a.status === 'failed') {
            lines.push(...failedLines(a, rel, root));
        } else if (limits === undefined && a.status === 'passed' && a.duration > defaultTimeoutMs / 2) {
            slow.push(`${(a.duration / 1000).toFixed(1)} s  ${rel} > ${a.fullName}`);
        }
    }
    return { lines, slow };
}

/**
 * @param {any} json the Vitest `--reporter=json` result
 * @param {{ root: string, defaultTimeoutMs: number, wallMs: number, full?: boolean, cap?: number, limits?: any[] }} opts
 *   the repo root, the default per-test limit, the wall time, the cap and the tests over half their own limit (from
 *   scripts/lib/limit-reporter.mjs; absent, the passing tests over half the default limit are listed instead)
 * @returns {string[]} the summary line, each failure, then tests over half the default limit
 */
export function formatReport(json, { root, defaultTimeoutMs, wallMs, full = false, cap = DEFAULT_CAP, limits }) {
    const skipped = json.numPendingTests + (json.numTodoTests ?? 0);
    const out = [
        `${json.numPassedTests} passed, ${json.numFailedTests} failed, ${skipped} skipped in ${(wallMs / 1000).toFixed(1)} s (${json.testResults.length} files)`,
    ];
    const slow = [];
    for (const file of json.testResults) {
        const r = fileLines(file, { root, defaultTimeoutMs, limits });
        out.push(...r.lines);
        slow.push(...r.slow);
    }
    if (limits?.length) {
        out.push(
            'WARNING: over half their own limit (move to a .slow.test.js file, or give an honest scaleTimeout):',
            ...limits.map((c) => `  ${(c.ms / 1000).toFixed(1)} s of ${c.limitMs / 1000} s  ${c.file} > ${c.name}`),
        );
    }
    if (slow.length) {
        out.push(
            `over half the ${defaultTimeoutMs} ms default limit (explicit timeouts are not read):`,
            ...slow.map((s) => `  ${s}`),
        );
    }
    return capLines(out, { full, cap });
}
