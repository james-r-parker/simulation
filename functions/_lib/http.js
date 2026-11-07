/* global console, Headers, Response */
// Response helpers shared by the Functions: JSON, library errors, and the Cache API wrapper.

import { ApiError, errorBody } from '../../js/library/shapes.js';

/**
 * Logs one JSON line, the Workers log format of the design doc.
 * @param {string} event the event name, such as `ReleaseNotFound`
 * @param {Record<string, unknown>} fields the event's fields
 * @returns {void}
 */
export function logEvent(event, fields) {
    console.log(JSON.stringify({ event, ...fields }));
}

/**
 * @param {unknown} body the value to send as JSON
 * @param {{status?: number, cacheControl?: string}} [options] the status (200) and a `Cache-Control` value
 * @returns {Response} the response
 */
export function json(body, { status = 200, cacheControl } = {}) {
    const headers = new Headers({
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
    });
    if (cacheControl !== undefined) {
        headers.set('Cache-Control', cacheControl);
    }
    return new Response(JSON.stringify(body), { status, headers });
}

/**
 * @param {unknown} error a thrown value
 * @returns {Response} the JSON error response: the `ApiError`'s own status, or 500 `internal` for anything else
 */
export function errorResponse(error) {
    if (error instanceof ApiError) {
        return json(errorBody(error), { status: error.status });
    }
    logEvent('FunctionFailed', { message: error instanceof Error ? error.message : String(error) });
    return json(errorBody(new ApiError(500, 'internal', 'internal error')), { status: 500 });
}

/**
 * Answers from the Cache API when it holds the request, else builds the response, stores a copy and returns it.
 * The cached copy carries `X-Cache: HIT`. Only a 200 response is stored.
 * @param {Request} request the GET request (its URL is the cache key)
 * @param {{waitUntil(promise: Promise<unknown>): void} | undefined} context the Functions context, to store after replying
 * @param {() => Promise<Response>} build makes the response on a miss
 * @returns {Promise<Response>} the response
 */
export async function cached(request, context, build) {
    const cache = /** @type {any} */ (globalThis).caches?.default;
    if (cache !== undefined) {
        const hit = await cache.match(request);
        if (hit !== undefined) {
            const response = new Response(hit.body, hit);
            response.headers.set('X-Cache', 'HIT');
            return response;
        }
    }
    const response = await build();
    if (cache !== undefined && response.status === 200) {
        const store = cache.put(request, response.clone());
        if (context === undefined) {
            await store;
        } else {
            context.waitUntil(store);
        }
    }
    return response;
}
