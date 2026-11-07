// Seasons: one ruleset each. Pure functions over the `library/seasons.json` list (oldest first).

/** The fewest days between two seasons opening. */
export const MIN_SEASON_GAP_DAYS = 28;

/**
 * @typedef {object} Layout
 * @property {string} [name] the brain layout name `layoutStamp` writes
 * @property {number} inputCount
 * @property {number} brainHidden
 * @property {number} outputCount
 */

/**
 * @typedef {object} Season
 * @property {number} season the season number (equals `major`)
 * @property {string} rulesHash the ruleset's `rulesHash`
 * @property {Layout} layout the brain layout its champions have
 * @property {string} opened the date it opened, `YYYY-MM-DD`
 * @property {number} major the major version of its releases
 */

/**
 * @param {readonly Season[]} seasons the seasons, oldest first
 * @returns {Season | null} the newest season, the current one, or null when none is open yet
 */
export function currentSeason(seasons) {
    return seasons.length === 0 ? null : seasons[seasons.length - 1];
}

/**
 * @param {readonly Season[]} seasons the seasons, oldest first
 * @param {string} hash a `rulesHash`
 * @returns {Season | null} the season with that ruleset, or null
 */
export function seasonOf(seasons, hash) {
    return seasons.find((entry) => entry.rulesHash === hash) ?? null;
}

/**
 * Whether a champion of one season can start a world on a ruleset: same `rulesHash`, same brain layout.
 * @param {{rulesHash: string, layout: Layout}} champion the champion's season (its row or its file header)
 * @param {{rulesHash: string, layout: Layout}} world the running world's ruleset
 * @returns {boolean} true when the world can be seeded with the champion
 */
export function canSeed(champion, world) {
    const a = champion.layout;
    const b = world.layout;
    return (
        champion.rulesHash === world.rulesHash &&
        a.inputCount === b.inputCount &&
        a.brainHidden === b.brainHidden &&
        a.outputCount === b.outputCount
    );
}

/**
 * @param {string} from a `YYYY-MM-DD` date
 * @param {string} to a `YYYY-MM-DD` date
 * @returns {number} whole days from `from` to `to`
 */
export function daysBetween(from, to) {
    return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/**
 * Checks a seasons list against the rules of deployment-and-community.md ("Seasons").
 * @param {readonly Season[]} seasons the seasons, oldest first
 * @returns {string[]} one message per broken rule; empty when the list is valid
 */
export function checkSeasons(seasons) {
    const problems = [];
    seasons.forEach((entry, index) => {
        if (entry.major !== entry.season) {
            problems.push(`season ${entry.season}: major ${entry.major} must equal the season`);
        }
        const previous = seasons[index - 1];
        if (previous === undefined) {
            return;
        }
        if (entry.major !== previous.major + 1) {
            problems.push(`season ${entry.season}: major must be the previous major plus 1`);
        }
        if (daysBetween(previous.opened, entry.opened) < MIN_SEASON_GAP_DAYS) {
            problems.push(
                `season ${entry.season}: opened fewer than ${MIN_SEASON_GAP_DAYS} days after season ${previous.season}`,
            );
        }
    });
    return problems;
}
