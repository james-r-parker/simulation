// D1 reads of the library API. Thin: the SQL of a list is built by `js/library/list.js`.

import { listSql, toPage } from '../../js/library/list.js';

/**
 * @typedef {import('../../js/library/rows.js').ChampionRow} ChampionRow
 * @typedef {import('../../js/library/query.js').ListQuery} ListQuery
 */

/**
 * @param {any} db the D1 binding
 * @returns {Promise<{season: number, rulesHash: string, layout: {inputCount: number, brainHidden: number, outputCount: number}, opened: string, major: number, current: boolean}[]>}
 *   every season, newest first; `current` is true on the newest
 */
export async function listSeasons(db) {
    const { results } = await db.prepare('SELECT * FROM seasons ORDER BY season DESC').all();
    return results.map((/** @type {any} */ row, /** @type {number} */ index) => ({
        season: row.season,
        rulesHash: row.rules_hash,
        layout: { inputCount: row.input_count, brainHidden: row.brain_hidden, outputCount: row.output_count },
        opened: row.opened,
        major: row.major,
        current: index === 0,
    }));
}

/**
 * @param {any} db the D1 binding
 * @param {ListQuery} query the parsed list query
 * @param {number} season the season to list
 * @returns {Promise<{items: Record<string, unknown>[], next: string | null}>} one page of verified champions
 */
export async function listChampions(db, query, season) {
    const { sql, params } = listSql(query, season);
    const { results } = await db
        .prepare(sql)
        .bind(...params)
        .all();
    return toPage(results, query);
}

/**
 * @param {any} db the D1 binding
 * @param {string} id a champion id
 * @returns {Promise<ChampionRow | null>} the row when it is `verified`; any other status reads as missing
 */
export async function getChampion(db, id) {
    const row = await db.prepare("SELECT * FROM champions WHERE id = ? AND status = 'verified'").bind(id).first();
    return row ?? null;
}
