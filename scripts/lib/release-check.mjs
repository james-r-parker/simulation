// The rules of the `release-check` gate, pure (docs/designs/deployment-and-community.md, "Release check"): a change to
// `rulesHash` is a breaking change, and it lands on `season/next`, not on `main`.
import { spawnSync } from 'node:child_process';

/**
 * @param {string} message a commit message or a pull request title
 * @returns {boolean} true for a subject `type(scope)!:` or a `BREAKING CHANGE:` footer
 */
export function isBreaking(message) {
    const subject = message.split('\n', 1)[0];
    return /^[a-z]+(\([^)]*\))?!:/.test(subject) || /^BREAKING[ -]CHANGE:/m.test(message);
}

/**
 * @typedef {{ok: true} | {ok: false, reason: 'rules-change-not-breaking' | 'rules-change-on-main'}} Verdict
 */

/**
 * @param {{baseHash: string, headHash: string, messages: readonly string[], base: string, addsSeason: boolean}} input
 *   `rulesHash` at the merge base and at HEAD, the pull request's commit messages and title, its base branch, and
 *   whether it adds a `library/seasons.json` entry
 * @returns {Verdict} the verdict; a PR that leaves `rulesHash` alone always passes
 */
export function releaseCheck({ baseHash, headHash, messages, base, addsSeason }) {
    if (baseHash === headHash) {
        return { ok: true };
    }
    if (!messages.some(isBreaking)) {
        return { ok: false, reason: 'rules-change-not-breaking' };
    }
    if (base === 'main' && !addsSeason) {
        return { ok: false, reason: 'rules-change-on-main' };
    }
    return { ok: true };
}

/**
 * @param {string} before `library/seasons.json` at the merge base
 * @param {string} after `library/seasons.json` at HEAD
 * @returns {boolean} true when HEAD lists more seasons than the merge base
 */
export function seasonAdded(before, after) {
    return JSON.parse(after).length > JSON.parse(before).length;
}

/**
 * The branch the checks run for: the pull request's base in CI, else the checked-out branch (`season/next` is exempt
 * from the "newest season matches the rules" test, because its rules run ahead of the file).
 * @param {{env?: Record<string, string | undefined>, run?: (args: string[]) => string}} [options] the environment and a
 *   git runner, for tests
 * @returns {string} the branch name, empty when detached
 */
export function currentBranch({ env = process.env, run = runGit } = {}) {
    const fromCi = env.GITHUB_BASE_REF || env.GITHUB_REF_NAME;
    return fromCi ? fromCi : run(['branch', '--show-current']).trim();
}

/**
 * @param {string[]} args git arguments
 * @returns {string} its standard output
 */
function runGit(args) {
    const done = spawnSync('git', args, { encoding: 'utf8' });
    return done.status === 0 ? done.stdout : '';
}
