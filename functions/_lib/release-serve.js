/* global Response, URL, fetch */
// The handlers behind `/v/...`, `/s/...` and `/next/...`: read release files from the `RELEASES` R2 bucket.

import { cached, json, logEvent } from './http.js';
import { contentTypeOf, INDEX_KEY, isVersion, releaseKey, resolveSeason, safeSegments } from './releases.js';

const IMMUTABLE = 'public, max-age=31536000, immutable';
const SHORT = 'public, max-age=60';

/**
 * @typedef {object} Context
 * @property {Request} request
 * @property {{RELEASES: any, PAGES_PROJECT?: string}} env
 * @property {Record<string, string | string[]>} params
 * @property {(promise: Promise<unknown>) => void} [waitUntil]
 */

/**
 * @param {Record<string, string | string[]>} params the route parameters
 * @returns {string[]} the `[[path]]` segments
 */
function segmentsOf(params) {
    const path = params.path;
    return Array.isArray(path) ? path : path === undefined ? [] : [path];
}

/**
 * @param {string} kind what was looked up, for the log
 * @param {string} key what was looked up
 * @returns {Response} 404 `not_found` as JSON
 */
function notFound(kind, key) {
    logEvent('ReleaseNotFound', { kind, key });
    return json({ error: { code: 'not_found', message: 'not found' } }, { status: 404 });
}

/**
 * @param {any} bucket the R2 bucket
 * @param {string} key the object key
 * @param {string} path the path the content type is read from
 * @param {string} cacheControl the `Cache-Control` value
 * @returns {Promise<Response | null>} the file as a response, or null when the key is not stored
 */
async function fileResponse(bucket, key, path, cacheControl) {
    const object = await bucket.get(key);
    if (object === null || object === undefined) {
        return null;
    }
    return new Response(object.body, {
        headers: {
            'Content-Type': contentTypeOf(path),
            'Cache-Control': cacheControl,
            'X-Content-Type-Options': 'nosniff',
        },
    });
}

/**
 * `GET /v/index.json` and `GET /v/<version>/<path>`.
 * @param {Context} context the Functions context
 * @returns {Promise<Response>} the response
 */
export function serveVersion(context) {
    const segments = segmentsOf(context.params);
    return cached(context.request, context, async () => {
        if (segments.length === 1 && segments[0] === 'index.json') {
            const response = await fileResponse(context.env.RELEASES, INDEX_KEY, 'index.json', SHORT);
            return response ?? notFound('index', INDEX_KEY);
        }
        const key = isVersion(segments[0]) ? releaseKey(segments[0], segments.slice(1).join('/')) : null;
        if (key === null) {
            return notFound('version', segments.join('/'));
        }
        const response = await fileResponse(context.env.RELEASES, key, key, IMMUTABLE);
        return response ?? notFound('version', key);
    });
}

/**
 * `GET /s/<season>` serves that season's newest `index.html`; `GET /s/<season>/<path>` redirects to `/v/<version>/<path>`.
 * @param {Context} context the Functions context
 * @returns {Promise<Response>} the response
 */
export function serveSeason(context) {
    const [season, ...rest] = segmentsOf(context.params);
    return cached(context.request, context, async () => {
        if (!/^\d+$/.test(season ?? '') || !safeSegments(rest)) {
            return notFound('season', [season, ...rest].join('/'));
        }
        const stored = await context.env.RELEASES.get(INDEX_KEY);
        const index = stored === null || stored === undefined ? { releases: [] } : JSON.parse(await stored.text());
        const version = resolveSeason(index, Number(season));
        if (version === null) {
            return notFound('season', season);
        }
        if (rest.length > 0) {
            const target = new URL(`/v/${version}/${rest.join('/')}`, context.request.url);
            return new Response(null, { status: 302, headers: { Location: target.pathname, 'Cache-Control': SHORT } });
        }
        const response = await fileResponse(
            context.env.RELEASES,
            `releases/${version}/index.html`,
            'index.html',
            SHORT,
        );
        return response ?? notFound('season', `releases/${version}/index.html`);
    });
}

/**
 * `GET /next/<path>` forwards to the `next` branch alias of the Pages project.
 * @param {Context} context the Functions context
 * @param {typeof fetch} [fetcher] the fetch to use (a test passes a fake)
 * @returns {Promise<Response>} the upstream response, or 404 for an unsafe path or an unset project
 */
export async function serveNext(context, fetcher = fetch) {
    const segments = segmentsOf(context.params);
    const project = context.env.PAGES_PROJECT;
    if (!safeSegments(segments) && segments.length > 0) {
        return notFound('next', segments.join('/'));
    }
    if (project === undefined || !/^[a-z0-9-]+$/.test(project)) {
        return notFound('next', 'no project');
    }
    const url = new URL(context.request.url);
    return fetcher(`https://next.${project}.pages.dev/${segments.join('/')}${url.search}`, {
        headers: { Accept: context.request.headers.get('Accept') ?? '*/*' },
    });
}
