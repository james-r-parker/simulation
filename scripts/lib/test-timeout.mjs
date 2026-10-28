// Test timeouts under coverage. V8 coverage slows the CPU-bound sim tests several times (measured 2026-10-28 with
// `vitest --coverage`: host-world tickOnce 4.2x, golden runs 4.2x and 5.3x, bench main 9x for a 3 s test), and the
// nightly runs them beside each other on 4 shared vCPUs. vitest.config.js reads these; tests wrap an explicit timeout
// in `scaleTimeout`.

/** Vitest's default per-test timeout in ms. */
export const DEFAULT_TIMEOUT_MS = 5000;
/** The default per-test timeout in ms when coverage is on. */
export const COVERAGE_TIMEOUT_MS = 20000;
/** What an explicit test timeout is multiplied by when coverage is on: above the 4x to 5x of the long worlds and in
 *  line with the 20000 / 5000 default; the 9x of the short bench test is startup-bound and far inside its 60 s limit. */
export const COVERAGE_TIMEOUT_FACTOR = 6;

/**
 * @param {string[]} argv the Vitest command line
 * @returns {boolean} whether coverage is on
 */
function coverageOn(argv) {
    return argv.some((arg) => /^--coverage(\.enabled)?$/.test(arg) || /^--coverage(\.enabled)?=true$/.test(arg));
}

/**
 * @param {string[]} argv the Vitest command line
 * @returns {number} the default per-test timeout in ms
 */
export function testTimeoutFor(argv) {
    return coverageOn(argv) ? COVERAGE_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
}

/**
 * @param {string[]} argv the Vitest command line
 * @returns {number} the multiplier for explicit test timeouts
 */
export function timeoutFactorFor(argv) {
    return coverageOn(argv) ? COVERAGE_TIMEOUT_FACTOR : 1;
}

/**
 * Scales an explicit test timeout by the factor `vitest.config.js` put in `TEST_TIMEOUT_FACTOR`. Never shortens it.
 * @param {number} ms the timeout without coverage
 * @param {Record<string, string | undefined>} [env] the environment to read the factor from
 * @returns {number} the timeout in ms
 */
export function scaleTimeout(ms, env = process.env) {
    const factor = Number(env.TEST_TIMEOUT_FACTOR);
    return Number.isFinite(factor) && factor > 1 ? ms * factor : ms;
}
