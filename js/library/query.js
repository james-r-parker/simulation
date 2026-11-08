// The list query of GET /api/champions: parsing, and the opaque keyset cursor.

import { ApiError, ID_PATTERN, LIST_LIMIT_DEFAULT, LIST_LIMIT_MAX, SORTS, SPEC_NAMES } from './shapes.js';

const { atob, btoa, TextDecoder, TextEncoder } = globalThis;

/**
 * @typedef {object} Cursor
 * @property {number} key the last row's sort key (its Elo or its created time)
 * @property {string} id the last row's id
 */

/**
 * @typedef {object} ListQuery
 * @property {number | null} season the season, or null for the current one
 * @property {number | null} spec the specialisation index, or null for all
 * @property {'elo' | 'created'} sort
 * @property {number} limit 1 to `LIST_LIMIT_MAX`
 * @property {Cursor | null} cursor where the previous page ended
 */

/**
 * @param {string} text a query value
 * @param {string} field its name, for the error
 * @returns {number} the non-negative integer it spells
 */
function wholeNumber(text, field) {
    if (!/^\d{1,9}$/.test(text)) {
        throw new ApiError(400, 'bad_query', `${field} must be a non-negative integer`, field);
    }
    return Number(text);
}

/**
 * @param {Cursor} cursor the cursor
 * @returns {string} base64url of its JSON
 */
export function encodeCursor(cursor) {
    const bytes = new TextEncoder().encode(JSON.stringify([cursor.key, cursor.id]));
    return btoa(String.fromCharCode(...bytes))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replaceAll('=', '');
}

/**
 * @param {string} text a cursor from `encodeCursor`
 * @returns {Cursor} the cursor
 * @throws {ApiError} `bad_cursor` when the text is not one
 */
export function decodeCursor(text) {
    try {
        const padded = text.replaceAll('-', '+').replaceAll('_', '/');
        const bytes = Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
        const [key, id] = JSON.parse(new TextDecoder().decode(bytes));
        if (typeof key === 'number' && Number.isFinite(key) && typeof id === 'string' && ID_PATTERN.test(id)) {
            return { key, id };
        }
    } catch {
        // falls through to the error
    }
    throw new ApiError(400, 'bad_cursor', 'cursor is not valid', 'cursor');
}

/**
 * @param {URLSearchParams} params the request's query string
 * @returns {number | null} the specialisation index, or null when `spec` is absent
 */
function parseSpec(params) {
    if (!params.has('spec')) {
        return null;
    }
    const spec = SPEC_NAMES.indexOf(params.get('spec') ?? '');
    if (spec < 0) {
        throw new ApiError(400, 'bad_query', `spec must be one of ${SPEC_NAMES.join(', ')}`, 'spec');
    }
    return spec;
}

/**
 * @param {URLSearchParams} params the request's query string
 * @returns {'elo' | 'created'} the sort, `elo` by default
 */
function parseSort(params) {
    const sort = params.get('sort') ?? SORTS[0];
    if (!SORTS.includes(sort)) {
        throw new ApiError(400, 'bad_query', `sort must be one of ${SORTS.join(', ')}`, 'sort');
    }
    return /** @type {'elo' | 'created'} */ (sort);
}

/**
 * @param {URLSearchParams} params the request's query string
 * @returns {number} the page size, `LIST_LIMIT_DEFAULT` by default
 */
function parseLimit(params) {
    const limit = params.has('limit') ? wholeNumber(params.get('limit') ?? '', 'limit') : LIST_LIMIT_DEFAULT;
    if (limit < 1 || limit > LIST_LIMIT_MAX) {
        throw new ApiError(400, 'bad_query', `limit must be 1 to ${LIST_LIMIT_MAX}`, 'limit');
    }
    return limit;
}

/**
 * @param {URLSearchParams} params the request's query string
 * @returns {ListQuery} the parsed query, defaults applied
 * @throws {ApiError} `bad_query` or `bad_cursor` naming the field
 */
export function parseListQuery(params) {
    const season = params.has('season') ? wholeNumber(params.get('season') ?? '', 'season') : null;
    const spec = parseSpec(params);
    const sort = parseSort(params);
    const limit = parseLimit(params);
    const cursor = params.has('cursor') ? decodeCursor(params.get('cursor') ?? '') : null;
    return { season, spec, sort, limit, cursor };
}
