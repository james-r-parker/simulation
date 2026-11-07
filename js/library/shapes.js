// Response shapes and constants of the gene library, shared by the Pages Functions, the seed code and (later) the app.
// Imports nothing: this file is read by every side of the library.

/** Largest page a list request may ask for. */
export const LIST_LIMIT_MAX = 50;
/** Page size when a list request names none. */
export const LIST_LIMIT_DEFAULT = 20;
/** Specialisation names by index (the order of `GENOME_SPECS` in js/evo/genome.js; a test keeps them equal). */
export const SPEC_NAMES = Object.freeze(['forager', 'predator', 'reproducer', 'scout', 'defender']);
/** The sort orders a list accepts; the first is the default. */
export const SORTS = Object.freeze(['elo', 'created']);
/** The states of a champion row. Only `verified` rows are listed or served. */
export const STATUSES = Object.freeze(['pending', 'verified', 'rejected', 'removed']);
/** The champion file format version this library stores (`CHAMPION_VERSION` in js/evo/league.js). */
export const CHAMPION_FILE_VERSION = 1;
/** A content id: SHA-256 as 64 lowercase hex characters. */
export const ID_PATTERN = /^[0-9a-f]{64}$/;

/**
 * A library API failure. Handlers turn it into `{ error: { code, message, field? } }` with `status`.
 */
export class ApiError extends Error {
    /**
     * @param {number} status the HTTP status
     * @param {string} code a stable machine code, such as `bad_query` or `not_found`
     * @param {string} message a sentence for a person
     * @param {string} [field] the request field at fault
     */
    constructor(status, code, message, field) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.field = field;
    }
}

/**
 * @param {ApiError} error the failure
 * @returns {{error: {code: string, message: string, field?: string}}} the JSON body of an error response
 */
export function errorBody(error) {
    const body = { code: error.code, message: error.message };
    return { error: error.field === undefined ? body : { ...body, field: error.field } };
}
