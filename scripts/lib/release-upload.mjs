// Registering a release in the D1 `releases` table, as a pure decision over the stored row (if any).
import { GET_RELEASE_SQL, isVersion, releaseSql, sameRelease } from '../../js/library/releases.js';

/**
 * @typedef {import('../../js/library/releases.js').ReleaseEntry} ReleaseEntry
 * @typedef {import('../../js/library/releases.js').ReleaseRow} ReleaseRow
 */

/**
 * @param {string} version a release version
 * @returns {string} `GET_RELEASE_SQL` with the version as a literal; only a valid `major.minor.patch` is ever inlined
 * @throws {Error} `bad_version` for any other text, so no other text reaches the SQL
 */
export function readReleaseSql(version) {
    if (!isVersion(version)) {
        throw new Error(`release-upload: bad version ${JSON.stringify(version)}`);
    }
    return GET_RELEASE_SQL.replace('?', `'${version}'`);
}

/**
 * @param {ReleaseEntry} entry the release this run built (`release-entry.json`)
 * @param {ReleaseRow | null} stored the row D1 holds for its version, or null
 * @returns {{action: 'insert', sql: string} | {action: 'noop'}} what to do: insert the row, or nothing when an identical
 *   row is stored (a repair run after a partial failure passes)
 * @throws {Error} `release_conflict` when a different row is stored for the version, `bad_version` for a bad version
 */
export function registerPlan(entry, stored) {
    if (!isVersion(entry.version)) {
        throw new Error(`bad_version: ${entry.version}`);
    }
    if (stored === null) {
        return { action: 'insert', sql: releaseSql(entry) };
    }
    if (!sameRelease(stored, entry)) {
        throw new Error(`release_conflict: ${entry.version} is already stored with different content`);
    }
    return { action: 'noop' };
}
