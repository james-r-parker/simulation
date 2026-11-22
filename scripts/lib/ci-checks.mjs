// What a PR's check list says, and how often it may be polled. Pure; scripts/ci-wait.mjs runs gh and sleeps.

/** The fastest poll in seconds. `gh run watch` loops from several watchers used up the 5000/hour API limit (2026-11-21). */
export const MIN_POLL_S = 120;
/** The longest one call waits in seconds: inside an agent's ~9 minute foreground limit. */
export const MAX_CALL_S = 510;

/**
 * @param {{ bucket?: string, state?: string }[]} checks `gh pr checks --json bucket,state`
 * @returns {'green' | 'red' | 'pending'} an empty list is pending (checks not created yet), any fail or cancel is red
 */
export function classifyChecks(checks) {
    if (!checks.length) {
        return 'pending';
    }
    if (checks.some((c) => c.bucket === 'fail' || c.bucket === 'cancel')) {
        return 'red';
    }
    return checks.every((c) => c.bucket === 'pass' || c.bucket === 'skipping') ? 'green' : 'pending';
}

/**
 * @param {string | undefined} value the `--interval` value in seconds, or undefined for the default
 * @returns {number} seconds between polls
 * @throws {Error} below MIN_POLL_S or not a number
 */
export function parseInterval(value) {
    if (value === undefined) {
        return MIN_POLL_S;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < MIN_POLL_S) {
        throw new Error(`--interval must be at least ${MIN_POLL_S} seconds (the GitHub API limit is 5000 an hour)`);
    }
    return n;
}

/**
 * @param {number | undefined} timeout the `--timeout` in seconds
 * @returns {{ budget: number, capped: boolean }} the seconds this call waits, held to MAX_CALL_S
 */
export function callBudget(timeout) {
    const want = timeout ?? MAX_CALL_S;
    return { budget: Math.min(want, MAX_CALL_S), capped: want > MAX_CALL_S };
}
