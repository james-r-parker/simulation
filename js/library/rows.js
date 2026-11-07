// Rows of the `champions` table and what the API shows of them.

/**
 * @typedef {object} ChampionRow a `champions` row as D1 returns it
 * @property {string} id
 * @property {number} season
 * @property {string} rules_hash
 * @property {number} specialisation
 * @property {string} name
 * @property {number | null} cell
 * @property {number | null} uploader_id
 * @property {number} created
 * @property {string} status
 * @property {string | null} reject_reason
 * @property {number | null} elo
 * @property {number | null} win_rate
 * @property {number | null} games
 * @property {number | null} verified_at
 * @property {string | null} verified_sha
 * @property {number} attempts
 * @property {number} bytes
 */

/**
 * The public view of a champion row: never `attempts`, `uploader_id` or the reject reason.
 * @param {ChampionRow & {uploader?: string | null}} row the row, joined with the uploader's login when there is one
 * @returns {Record<string, unknown>} the metadata object the API returns
 */
export function toPublicChampion(row) {
    return {
        id: row.id,
        season: row.season,
        rulesHash: row.rules_hash,
        specialisation: row.specialisation,
        name: row.name,
        cell: row.cell,
        uploader: row.uploader ?? null,
        created: row.created,
        elo: row.elo,
        winRate: row.win_rate,
        games: row.games,
        verifiedAt: row.verified_at,
        bytes: row.bytes,
    };
}
