// Release path rules for the `/v/`, `/s/` and `/next/` Functions. Pure. The version rules, the alias branch and the
// release SQL are in `js/library/releases.js`; a release is served by its own Pages deployment, so there are no keys.

import { aliasHost, isVersion } from '../../js/library/releases.js';

const LABEL = /^[a-z0-9-]+$/;

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
 * @param {string[]} segments the file path inside the release (`index.html` when empty)
 * @param {string | undefined} subdomain the project's `pages.dev` host label (`PAGES_SUBDOMAIN`)
 * @returns {string | null} the URL of the file on the release's deployment, or null when the version, the path or the
 *   label is not valid. The host is built only from the checked version and label, never from the request.
 */
export function upstreamUrl(version, segments, subdomain) {
    if (!isVersion(version) || subdomain === undefined || !LABEL.test(subdomain)) {
        return null;
    }
    const parts = segments.length === 0 ? ['index.html'] : segments;
    return safeSegments(parts) ? `https://${aliasHost(version, subdomain)}/${parts.join('/')}` : null;
}
