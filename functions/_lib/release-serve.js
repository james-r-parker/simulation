/* global Response, URL, fetch */
// The handlers behind `/v/...`, `/s/...` and `/next/...`. A release is a Pages deployment on its own branch
// (`aliasBranch`); these Functions check the version against the D1 `releases` table and proxy to that deployment.

import {
    GET_RELEASE_SQL,
    LATEST_OF_SEASON_SQL,
    isVersion,
    LIST_RELEASES_SQL,
    toIndex,
} from '../../js/library/releases.js';
import { cached, json, logEvent } from './http.js';
import { safeSegments, upstreamUrl } from './releases.js';

const IMMUTABLE = 'public, max-age=31536000, immutable';
const SHORT = 'public, max-age=60';

/**
 * @typedef {object} Context
 * @property {Request} request
 * @property {{DB: any, PAGES_SUBDOMAIN?: string}} env
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
 * @param {string | null} url the upstream URL, null when it is not valid
 * @param {string} cacheControl the `Cache-Control` value
 * @param {typeof fetch} fetcher the fetch to use
 * @returns {Promise<Response | null>} the file as a response with the upstream content type, or null when the URL is
 *   not valid or the deployment does not answer 200
 */
async function proxy(url, cacheControl, fetcher) {
    if (url === null) {
        return null;
    }
    const upstream = await fetcher(url, { redirect: 'manual' });
    if (upstream.status !== 200) {
        return null;
    }
    return new Response(upstream.body, {
        headers: {
            'Content-Type': upstream.headers.get('Content-Type') ?? 'application/octet-stream',
            'Cache-Control': cacheControl,
            'X-Content-Type-Options': 'nosniff',
        },
    });
}

/**
 * `GET /v/index.json` and `GET /v/<version>/<path>`.
 * @param {Context} context the Functions context
 * @param {typeof fetch} [fetcher] the fetch to use (a test passes a fake)
 * @returns {Promise<Response>} the response
 */
export function serveVersion(context, fetcher = fetch) {
    const segments = segmentsOf(context.params);
    return cached(context.request, context, async () => {
        const [version, ...path] = segments;
        if (segments.length === 1 && version === 'index.json') {
            const { results } = await context.env.DB.prepare(LIST_RELEASES_SQL).all();
            return json(toIndex(results), { cacheControl: SHORT });
        }
        const stored = isVersion(version) ? await context.env.DB.prepare(GET_RELEASE_SQL).bind(version).first() : null;
        const url = stored === null ? null : upstreamUrl(version, path, context.env.PAGES_SUBDOMAIN);
        return (await proxy(url, IMMUTABLE, fetcher)) ?? notFound('version', segments.join('/'));
    });
}

/**
 * `GET /s/<season>` serves that season's newest `index.html`; `GET /s/<season>/<path>` redirects to `/v/<version>/<path>`.
 * @param {Context} context the Functions context
 * @param {typeof fetch} [fetcher] the fetch to use (a test passes a fake)
 * @returns {Promise<Response>} the response
 */
export function serveSeason(context, fetcher = fetch) {
    const [season, ...rest] = segmentsOf(context.params);
    return cached(context.request, context, async () => {
        if (!/^\d+$/.test(season ?? '') || !safeSegments(rest)) {
            return notFound('season', [season, ...rest].join('/'));
        }
        const latest = await context.env.DB.prepare(LATEST_OF_SEASON_SQL).bind(Number(season)).first();
        if (latest === null) {
            return notFound('season', season);
        }
        if (rest.length > 0) {
            const target = new URL(`/v/${latest.version}/${rest.join('/')}`, context.request.url);
            return new Response(null, { status: 302, headers: { Location: target.pathname, 'Cache-Control': SHORT } });
        }
        const url = upstreamUrl(latest.version, [], context.env.PAGES_SUBDOMAIN);
        return (await proxy(url, SHORT, fetcher)) ?? notFound('season', season);
    });
}

/**
 * `GET /next/<path>` forwards to the `next` branch alias of the Pages project.
 * @param {Context & {env: {PAGES_SUBDOMAIN?: string}}} context the Functions context
 * @param {typeof fetch} [fetcher] the fetch to use (a test passes a fake)
 * @returns {Promise<Response>} the upstream response, or 404 for an unsafe path or an unset subdomain
 */
export async function serveNext(context, fetcher = fetch) {
    const segments = segmentsOf(context.params);
    const subdomain = context.env.PAGES_SUBDOMAIN;
    if (!safeSegments(segments) && segments.length > 0) {
        return notFound('next', segments.join('/'));
    }
    if (subdomain === undefined || !/^[a-z0-9-]+$/.test(subdomain)) {
        return notFound('next', 'no subdomain');
    }
    const url = new URL(context.request.url);
    return fetcher(`https://next.${subdomain}.pages.dev/${segments.join('/')}${url.search}`, {
        headers: { Accept: context.request.headers.get('Accept') ?? '*/*' },
    });
}
