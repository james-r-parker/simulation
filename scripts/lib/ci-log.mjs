// Reads a CI job log (GitHub Actions, Vitest output) down to what failed. Pure: text in, lines out; scripts/ci-failures.mjs
// fetches the logs. A failed shard's log is ~1000 lines; the answer is a test name, one assertion and a file:line.

/** The default cap on a job's summary, in lines. */
export const DEFAULT_CAP = 40;
const MAX_LINE = 200;
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, 'g');
const STAMP = /^\uFEFF?\d{4}-\d\d-\d\dT[\d:.]+Z ?/;
const TEST_FAIL = /^\s*FAIL\s+(\S+?)(?: > (.+))?$/;
const TEST_FILE = /\.(test|spec)\.[cm]?js$/;

/**
 * @param {string} text a log with ANSI escapes and Actions timestamps
 * @returns {string[]} its lines, both stripped
 */
export function cleanLines(text) {
    return text
        .replace(ANSI, '')
        .split('\n')
        .map((line) => line.replace(STAMP, '').replace(/\r$/, ''));
}

/**
 * @param {string[]} lines the lines after a `FAIL` header
 * @returns {{ message: string, detail: string[], where: string }} the first error line, the expected/received lines and the
 *   first `file:line:col` frame
 */
export function readBlock(lines) {
    let message = '';
    let where = '';
    const detail = [];
    for (const line of lines) {
        const text = line.trim();
        if (!message && /^(\w*Error|AssertionError)\b|Test timed out/.test(text)) {
            message = text;
        } else if (message && detail.length < 3 && /^(- Expected|\+ Received|Expected:|Received:)/.test(text)) {
            detail.push(text);
        } else if (!where && text.startsWith('❯')) {
            where = text.slice(1).trim();
        }
    }
    return { message, detail, where };
}

/**
 * @param {string[]} lines the cleaned log lines
 * @returns {{ file: string, name: string, message: string, detail: string[], where: string, timeout: number | null }[]} one
 *   entry per failed test (Vitest prints each header once in its "Failed Tests" section)
 */
export function parseTestFailures(lines) {
    const seen = new Set();
    /** @type {{ file: string, name: string, message: string, detail: string[], where: string, timeout: number | null }[]} */
    const out = [];
    lines.forEach((line, i) => {
        const m = TEST_FAIL.exec(line);
        if (!m || !TEST_FILE.test(m[1]) || seen.has(line.trim())) {
            return;
        }
        seen.add(line.trim());
        const block = [];
        for (let j = i + 1; j < lines.length && !TEST_FAIL.test(lines[j]) && !lines[j].startsWith('⎯'); j++) {
            block.push(lines[j]);
        }
        const { message, detail, where } = readBlock(block);
        const t = /timed out in (\d+)\s*ms/i.exec(message);
        out.push({ file: m[1], name: m[2] ?? '', message, detail, where, timeout: t ? Number(t[1]) : null });
    });
    return out;
}

/**
 * @param {string[]} lines the cleaned log lines
 * @returns {string[]} gate lines that say FAIL outside a Vitest header or a table row (perf, bench and alloc gates)
 */
export function parsePerfFails(lines) {
    return lines
        .filter((line) => /\bFAIL\b/.test(line) && !line.includes('|') && !/^\s*FAIL\s/.test(line))
        .map((line) => line.trim());
}

/**
 * @param {string[]} lines the cleaned log lines
 * @returns {string[]} the `##[error]` annotations other than the bare exit-code one
 */
export function parseErrorLines(lines) {
    return lines
        .filter((line) => line.startsWith('##[error]') && !/Process completed with exit code/.test(line))
        .map((line) => line.slice('##[error]'.length).trim());
}

/** @param {string} s a line @returns {string} the line cut to MAX_LINE */
const clip = (s) => (s.length > MAX_LINE ? `${s.slice(0, MAX_LINE - 1)}...` : s);

/**
 * @param {{ file: string, name: string, message: string, detail: string[], where: string, timeout: number | null }} f a failure
 * @returns {string[]} its lines: header, first assertion, expected/received, where
 */
export function failureLines(f) {
    /** @type {string[]} */
    const out = [`${f.timeout === null ? 'FAIL' : 'TIMEOUT'} ${f.file}${f.name ? ` > ${f.name}` : ''}`];
    if (f.timeout !== null) {
        out.push(`  timed out in ${f.timeout} ms (not an assertion: a slow runner, or a slow test)`);
    } else if (f.message) {
        out.push(`  ${f.message}`);
    }
    out.push(...f.detail.map((d) => `  ${d}`));
    if (f.where) {
        out.push(`  at ${f.where}`);
    }
    return out;
}

/**
 * @param {string[]} lines the lines to cap
 * @param {{ full?: boolean, cap?: number }} [opts] `full` lifts the cap
 * @returns {string[]} the lines, clipped, with a note when cut
 */
export function capLines(lines, { full = false, cap = DEFAULT_CAP } = {}) {
    const clipped = lines.map(clip);
    if (full || clipped.length <= cap) {
        return clipped;
    }
    return [...clipped.slice(0, cap), `... ${clipped.length - cap} more lines (--full)`];
}

/**
 * @param {string} jobName the job's name
 * @param {string} log the raw job log
 * @param {{ full?: boolean, cap?: number }} [opts] `full` lifts the cap
 * @returns {string[]} the summary: the job, then each failing test, its first assertion and where
 */
export function summariseJob(jobName, log, opts = {}) {
    const lines = cleanLines(log);
    const out = [`== ${jobName}`];
    for (const f of parseTestFailures(lines)) {
        out.push(...failureLines(f));
    }
    out.push(...parsePerfFails(lines).map((l) => `PERF ${l}`));
    if (out.length === 1) {
        const errors = parseErrorLines(lines);
        out.push(
            ...(errors.length
                ? errors.map((e) => `ERROR ${e}`)
                : ['(no failing test or gate line found; open the log)']),
        );
    }
    return capLines(out, opts);
}
