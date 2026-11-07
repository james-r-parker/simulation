// The SQL of GET /api/champions and the page it returns. Pure: `functions/_lib/db.js` runs the statement on D1.

import { encodeCursor } from './query.js';
import { toPublicChampion } from './rows.js';

/**
 * @typedef {import('./query.js').ListQuery} ListQuery
 * @typedef {import('./rows.js').ChampionRow} ChampionRow
 */

/**
 * Builds the statement for one page. It asks for `limit + 1` rows, so `toPage` can tell whether another page follows.
 * @param {ListQuery} query the parsed query
 * @param {number} season the season to list (the query's, or the current one)
 * @returns {{sql: string, params: (string | number)[]}} the statement and its bound values
 */
export function listSql(query, season) {
    const where = ['season = ?', "status = 'verified'"];
    /** @type {(string | number)[]} */
    const params = [season];
    if (query.spec !== null) {
        where.push('specialisation = ?');
        params.push(query.spec);
    }
    const column = query.sort === 'elo' ? 'elo' : 'created';
    if (query.cursor !== null) {
        where.push(`(${column} < ? OR (${column} = ? AND id > ?))`);
        params.push(query.cursor.key, query.cursor.key, query.cursor.id);
    }
    params.push(query.limit + 1);
    const sql = `SELECT * FROM champions WHERE ${where.join(' AND ')} ORDER BY ${column} DESC, id ASC LIMIT ?`;
    return { sql, params };
}

/**
 * @param {readonly ChampionRow[]} rows the rows the statement returned (at most `limit + 1`)
 * @param {ListQuery} query the parsed query
 * @returns {{items: Record<string, unknown>[], next: string | null}} the page: public metadata, and the cursor of the
 *   next page or null on the last one
 */
export function toPage(rows, query) {
    const kept = rows.slice(0, query.limit);
    const last = kept[kept.length - 1];
    const more = rows.length > query.limit && last !== undefined;
    const key = query.sort === 'elo' ? last?.elo : last?.created;
    return {
        items: kept.map((row) => toPublicChampion(row)),
        next: more && typeof key === 'number' ? encodeCursor({ key, id: last.id }) : null,
    };
}
