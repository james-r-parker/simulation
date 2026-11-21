// The rules of the `release-check` gate, pure (docs/designs/deployment-and-community.md, "Release check"): a change to
// `rulesHash` is a breaking change on `main`, and it carries its `library/seasons.json` entry in the same pull request.

/**
 * @param {string} message a commit message or a pull request title
 * @returns {boolean} true for a subject `type(scope)!:` or a `BREAKING CHANGE:` footer
 */
export function isBreaking(message) {
    const subject = message.split('\n', 1)[0];
    return /^[a-z]+(\([^)]*\))?!:/.test(subject) || /^BREAKING[ -]CHANGE:/m.test(message);
}

/**
 * @typedef {{ok: true} | {ok: false, reason: 'rules-change-not-breaking' | 'rules-change-without-season'}} Verdict
 */

/**
 * @param {{baseHash: string, headHash: string, messages: readonly string[], title?: string, base: string,
 *   addsSeason: boolean, movesUnreleased?: boolean}} input `rulesHash` at the merge base and at HEAD, the pull
 *   request's commit messages, its title (absent outside CI), its base branch, whether it adds a `library/seasons.json`
 *   entry, and whether it moves the `rulesHash` of the newest season while that season has no release
 * @returns {Verdict} the verdict; a PR that leaves `rulesHash` alone always passes
 */
export function releaseCheck({ baseHash, headHash, messages, title, base, addsSeason, movesUnreleased = false }) {
    if (baseHash === headHash) {
        return { ok: true };
    }
    // The title names the change in the release notes, so on a pull request it must say breaking itself; a local run
    // has no title and reads the commits.
    if (title ? !isBreaking(title) : !messages.some(isBreaking)) {
        return { ok: false, reason: 'rules-change-not-breaking' };
    }
    if (base === 'main' && !addsSeason && !movesUnreleased) {
        return { ok: false, reason: 'rules-change-without-season' };
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
 * A season opened on `main` stays open until its first release: a rules change before then moves its `rulesHash` in
 * place, because a second season would need a major the release does not have.
 * @param {string} before `library/seasons.json` at the merge base
 * @param {string} after `library/seasons.json` at HEAD
 * @param {readonly string[]} tags the repository's tags
 * @returns {boolean} true when both list the same seasons, the newest one's `rulesHash` differs, and no `v<major>.`
 *   tag exists for it
 */
export function movesUnreleasedSeason(before, after, tags) {
    const was = JSON.parse(before);
    const now = JSON.parse(after);
    if (was.length === 0 || was.length !== now.length) {
        return false;
    }
    const old = was[was.length - 1];
    const next = now[now.length - 1];
    const sameSeason = old.season === next.season && old.major === next.major;
    const released = tags.some((tag) => tag.startsWith(`v${next.major}.`));
    return sameSeason && old.rulesHash !== next.rulesHash && !released;
}
