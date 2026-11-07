// The manifest of a release upload: which files go to which R2 keys with which content type. Pure over a file list.
import { contentTypeOf, isVersion, releaseKey } from '../../functions/_lib/releases.js';

/**
 * @typedef {object} UploadRow
 * @property {string} path the file's path inside the release directory
 * @property {string} key the R2 key `releases/<version>/<path>`
 * @property {string} contentType
 */

/**
 * @param {string} version the release version
 * @param {readonly string[]} paths the files of the release directory, relative, with `/` separators
 * @returns {UploadRow[]} one row per file, in path order
 * @throws {Error} when the version is not `major.minor.patch`, a path would leave `releases/<version>/`, or no file is
 *   `index.html`
 */
export function uploadManifest(version, paths) {
    if (!isVersion(version)) {
        throw new Error(`release-upload: bad version ${JSON.stringify(version)}`);
    }
    const rows = [...paths].sort().map((path) => {
        const key = releaseKey(version, path);
        if (key === null) {
            throw new Error(`release-upload: refusing path ${JSON.stringify(path)}`);
        }
        return { path, key, contentType: contentTypeOf(path) };
    });
    if (!rows.some((row) => row.path === 'index.html')) {
        throw new Error('release-upload: the release has no index.html');
    }
    return rows;
}
