// Release storage rules: which paths the release Functions serve from R2, their content types, and the release index.
// Pure. Shared by `functions/v`, `functions/s` and the release upload script.

const VERSION = /^\d+\.\d+\.\d+$/;

/** @type {Readonly<Record<string, string>>} */
const TYPES = {
    html: 'text/html; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    mjs: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    json: 'application/json; charset=utf-8',
    wasm: 'application/wasm',
    svg: 'image/svg+xml',
    png: 'image/png',
    woff2: 'font/woff2',
    txt: 'text/plain; charset=utf-8',
};

/** Where the release index is stored in the `RELEASES` bucket. */
export const INDEX_KEY = 'releases/index.json';

/**
 * @param {unknown} text a candidate version
 * @returns {boolean} true for `major.minor.patch` with digits only
 */
export function isVersion(text) {
    return typeof text === 'string' && VERSION.test(text);
}

/**
 * @param {string} path a file path inside a release
 * @returns {string} its content type; `application/octet-stream` when the extension is not known
 */
export function contentTypeOf(path) {
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
    return path.includes('.') ? (TYPES[ext] ?? 'application/octet-stream') : 'application/octet-stream';
}

/**
 * @param {string[]} segments the path split on `/`
 * @returns {boolean} true when every segment is a plain name: not empty, not `.` or `..`, no backslash or NUL
 */
export function safeSegments(segments) {
    return segments.every(
        (part) => part !== '' && part !== '.' && part !== '..' && !part.includes('\\') && !part.includes('\0'),
    );
}

/**
 * @param {string} version a release version
 * @param {string} path the file path inside the release (`index.html` when empty)
 * @returns {string | null} the R2 key `releases/<version>/<path>`, or null when the version or the path is not valid
 */
export function releaseKey(version, path) {
    if (!isVersion(version)) {
        return null;
    }
    const segments = path === '' ? ['index.html'] : path.split('/');
    return safeSegments(segments) ? `releases/${version}/${segments.join('/')}` : null;
}

/**
 * @typedef {object} ReleaseEntry
 * @property {string} version
 * @property {number} season
 * @property {string} date
 * @property {string} rulesHash
 */

/**
 * @param {{releases: ReleaseEntry[]}} index the stored index (oldest first)
 * @param {ReleaseEntry} entry the release to add
 * @returns {{releases: ReleaseEntry[]}} the index with the entry appended; the same index when an identical entry is
 *   stored, so a repair run after a partial failure passes
 * @throws {Error} `release_conflict` when a different entry is stored for the version, `bad_version` for a bad version
 */
export function addRelease(index, entry) {
    if (!isVersion(entry.version)) {
        throw new Error(`bad_version: ${entry.version}`);
    }
    const stored = index.releases.find((release) => release.version === entry.version);
    if (stored === undefined) {
        return { releases: [...index.releases, entry] };
    }
    if (JSON.stringify(canonicalEntry(stored)) !== JSON.stringify(canonicalEntry(entry))) {
        throw new Error(`release_conflict: ${entry.version} is already stored with different content`);
    }
    return index;
}

/**
 * @param {ReleaseEntry} entry a release entry
 * @returns {ReleaseEntry} the entry with its keys in a fixed order
 */
function canonicalEntry(entry) {
    return { version: entry.version, season: entry.season, date: entry.date, rulesHash: entry.rulesHash };
}

/**
 * @param {{releases: ReleaseEntry[]}} index the index
 * @param {number} season a season number
 * @returns {string | null} the newest version of that season (the last one stored), or null
 */
export function resolveSeason(index, season) {
    const matches = index.releases.filter((release) => release.season === season);
    return matches.length === 0 ? null : matches[matches.length - 1].version;
}
