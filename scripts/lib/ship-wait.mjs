// Waits until a pull request has CI checks registered. GitHub creates the check runs a few seconds after the push, and
// `gh pr checks --watch` exits at once with "no checks reported" before then, so ship.sh looks first.

/** Seconds ship.sh waits for GitHub to register a pull request's checks. */
export const CHECKS_GRACE_S = 120;

/** @typedef {(cmd: string, args: string[]) => {status: number | null, stdout: string, stderr: string}} Sh */

/** @param {number} seconds how long to block */
export function sleep(seconds) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

/**
 * @param {Sh} sh runs a command
 * @param {number} pr the pull request number
 * @returns {number} how many checks gh lists for it; 0 for "no checks reported", an empty list or unreadable output
 */
export function checkCount(sh, pr) {
    const r = sh('gh', ['pr', 'checks', String(pr), '--json', 'state']);
    if (r.status !== 0) {
        return 0;
    }
    try {
        const checks = JSON.parse(r.stdout);
        return Array.isArray(checks) ? checks.length : 0;
    } catch {
        return 0;
    }
}

/**
 * @param {Sh} sh runs a command
 * @param {number} pr the pull request number
 * @param {{graceS?: number, pollS?: number, pause?: (seconds: number) => void}} [wait] the total seconds to wait, the
 *   seconds between looks and the function that waits (tests pass a no-op)
 * @returns {boolean} true once at least one check is registered, false when none is after `graceS`
 */
export function waitForChecks(sh, pr, { graceS = CHECKS_GRACE_S, pollS = 5, pause = sleep } = {}) {
    for (let waited = 0; ; waited += pollS) {
        if (checkCount(sh, pr) > 0) {
            return true;
        }
        if (waited >= graceS) {
            return false;
        }
        pause(pollS);
    }
}
