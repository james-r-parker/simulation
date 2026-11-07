// Releases: the version rules, the `releases` table SQL and the name of the Pages deployment that serves a version.
// Pure. Shared by the release Functions and the release upload script. A release is a Pages deployment on the branch
// `aliasBranch(version)`, served at `<branch>.<project>.pages.dev`; the table is only the index.

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

/** Reads the index: every release, oldest first (`GET /v/index.json`). */
export const LIST_RELEASES_SQL =
    'SELECT version, season, released, rules_hash FROM releases ORDER BY major, minor, patch';
/** One release by version (`?` is the version). */
export const GET_RELEASE_SQL = 'SELECT version, season, released, rules_hash FROM releases WHERE version = ?';
/** The newest release of a season (`?` is the season). */
export const LATEST_OF_SEASON_SQL =
    'SELECT version FROM releases WHERE season = ? ORDER BY major DESC, minor DESC, patch DESC LIMIT 1';

/**
 * @typedef {object} ReleaseEntry
 * @property {string} version `major.minor.patch`
 * @property {number} season
 * @property {string} date `YYYY-MM-DD`
 * @property {string} rulesHash
 */

/**
 * @typedef {object} ReleaseRow
 * @property {string} version
 * @property {number} season
 * @property {string} released
 * @property {string} rules_hash
 */

/**
 * @param {unknown} text a candidate version
 * @returns {boolean} true for `major.minor.patch` with digits only
 */
export function isVersion(text) {
    return typeof text === 'string' && VERSION.test(text);
}

/**
 * @param {string} version a valid version
 * @returns {string} the Pages branch that serves it: dots become hyphens (`6.1.0` is `v6-1-0`), which is what Pages
 *   would make of the branch name anyway, so the alias host is `v6-1-0.<project>.pages.dev`. The map is one to one.
 * @throws {Error} `bad_version` for a text that is not a version
 */
export function aliasBranch(version) {
    if (!isVersion(version)) {
        throw new Error(`bad_version: ${version}`);
    }
    return `v${version.replaceAll('.', '-')}`;
}

/**
 * @param {string} version a valid version
 * @param {string} project the Pages project's `pages.dev` subdomain (`matrix-6be`)
 * @returns {string} the host of the deployment that serves the version
 */
export function aliasHost(version, project) {
    return `${aliasBranch(version)}.${project}.pages.dev`;
}

/**
 * @param {string} text a text value
 * @returns {string} the SQL string literal
 */
function quote(text) {
    return `'${text.replaceAll("'", "''")}'`;
}

/**
 * @param {ReleaseEntry} entry a release
 * @returns {string} the plain `INSERT` of its row; a second insert of the same version fails, so the caller checks
 *   `sameRelease` against `GET_RELEASE_SQL` first
 * @throws {Error} `bad_version` when the version is not valid
 */
export function releaseSql(entry) {
    const parts = VERSION.exec(entry.version);
    if (parts === null) {
        throw new Error(`bad_version: ${entry.version}`);
    }
    const [, major, minor, patch] = parts;
    const values = [
        quote(entry.version),
        major,
        minor,
        patch,
        Number(entry.season),
        quote(entry.date),
        quote(entry.rulesHash),
    ];
    return `INSERT INTO releases (version, major, minor, patch, season, released, rules_hash) VALUES (${values.join(', ')});`;
}

/**
 * @param {ReleaseRow} row a stored row
 * @param {ReleaseEntry} entry a release to add
 * @returns {boolean} true when the stored row is the same release, so a repair run after a partial failure passes
 */
export function sameRelease(row, entry) {
    return (
        row.version === entry.version &&
        row.season === entry.season &&
        row.released === entry.date &&
        row.rules_hash === entry.rulesHash
    );
}

/**
 * @param {readonly ReleaseRow[]} rows `LIST_RELEASES_SQL` rows
 * @returns {{releases: ReleaseEntry[]}} the public index, `{ releases: [{ version, season, date, rulesHash }] }`
 */
export function toIndex(rows) {
    return {
        releases: rows.map((row) => ({
            version: row.version,
            season: row.season,
            date: row.released,
            rulesHash: row.rules_hash,
        })),
    };
}
