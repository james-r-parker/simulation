// The four read handlers of the library API (`GET /api/seasons`, `/api/champions`, `/api/champions/:id`,
// `/api/champions/:id/file`). The route files in `functions/api/` call these.

import { parseListQuery } from '../../js/library/query.js';
import { toPublicChampion } from '../../js/library/rows.js';
import { ApiError, ID_PATTERN } from '../../js/library/shapes.js';
import { getChampion, getChampionFile, listChampions, listSeasons } from './db.js';
import { cached, errorResponse, json } from './http.js';

/**
 * @typedef {object} Context
 * @property {Request} request
 * @property {{DB: any}} env
 * @property {Record<string, string | string[]>} [params]
 * @property {(promise: Promise<unknown>) => void} [waitUntil]
 */

const LIST_CACHE = 'public, s-maxage=60';

/**
 * @param {Context} context the Functions context
 * @param {() => Promise<Response>} build makes the response on a cache miss
 * @returns {Promise<Response>} the response, cached by request URL; a thrown `ApiError` becomes its JSON error
 */
async function guarded(context, build) {
    try {
        return await cached(context.request, context, build);
    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * @param {Context} context the Functions context
 * @returns {string} the `:id` parameter
 * @throws {ApiError} 404 `not_found` when it is not a content id (so a bad id never reaches D1)
 */
function idOf(context) {
    const id = context.params?.id;
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
        throw new ApiError(404, 'not_found', 'champion not found');
    }
    return id;
}

/**
 * @param {Context} context the Functions context
 * @returns {Promise<Response>} all seasons, newest first
 */
export function handleSeasons(context) {
    return guarded(context, async () =>
        json({ seasons: await listSeasons(context.env.DB) }, { cacheControl: 'public, s-maxage=300' }),
    );
}

/**
 * @param {Context} context the Functions context
 * @returns {Promise<Response>} a page of verified champions
 */
export function handleList(context) {
    return guarded(context, async () => {
        const query = parseListQuery(new URL(context.request.url).searchParams);
        const season = query.season ?? (await listSeasons(context.env.DB))[0]?.season;
        if (season === undefined) {
            return json({ items: [], next: null }, { cacheControl: LIST_CACHE });
        }
        return json(await listChampions(context.env.DB, query, season), { cacheControl: LIST_CACHE });
    });
}

/**
 * @param {Context} context the Functions context
 * @returns {Promise<Response>} one verified champion's metadata
 */
export function handleOne(context) {
    return guarded(context, async () => {
        const row = await getChampion(context.env.DB, idOf(context));
        if (row === null) {
            throw new ApiError(404, 'not_found', 'champion not found');
        }
        return json(toPublicChampion(row), { cacheControl: LIST_CACHE });
    });
}

/**
 * @param {Context} context the Functions context
 * @returns {Promise<Response>} one verified champion's file from D1
 */
export function handleFile(context) {
    return guarded(context, async () => {
        const body = await getChampionFile(context.env.DB, idOf(context));
        if (body === null) {
            throw new ApiError(404, 'not_found', 'champion not found');
        }
        return new Response(body, {
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'public, max-age=31536000, immutable',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    });
}
