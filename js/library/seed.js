// Seeding the library with the project's own champions: the rows, the file bodies and the SQL, all pure. The shell
// that reads `public/champions/v1/` and calls `wrangler` is a script (the seed task in deployment-and-community.md).

import { canonicalChampion, championId } from './canonical.js';

const { TextEncoder } = globalThis;

/** The Elo a seeded champion gets when `evals/league.json` has no entry for it (`ELO_START` in js/evo/elo.js). */
export const DEFAULT_SEED_ELO = 1500;

/**
 * @typedef {import('./seasons.js').Season} Season
 * @typedef {import('./rows.js').ChampionRow} ChampionRow
 */

/**
 * @param {readonly Record<string, any>[]} inputs validated champion files (`validateChampion` accepted each)
 * @param {{season: number, league: {champions: readonly {name: string, elo: number}[]}, now: number}} options the
 *   season they belong to, the league (the Elo by champion name), and the unix second to stamp rows with
 * @returns {Promise<{rows: ChampionRow[], files: {id: string, body: string}[]}>} one `verified` official row per
 *   distinct canonical file, and the file (id and canonical bytes) of each
 */
export async function buildSeedRows(inputs, { season, league, now }) {
    const rows = [];
    const files = [];
    const seen = new Set();
    for (const file of inputs) {
        const body = canonicalChampion(file);
        const id = await championId(body);
        if (seen.has(id)) {
            continue;
        }
        seen.add(id);
        const entry = league.champions.find((champion) => champion.name === file.name);
        files.push({ id, body });
        rows.push({
            id,
            season,
            rules_hash: file.rulesHash,
            specialisation: file.specialisation,
            name: file.name,
            cell: Number.isInteger(file.cell) ? file.cell : null,
            uploader_id: null,
            created: now,
            status: 'verified',
            reject_reason: null,
            elo: entry?.elo ?? DEFAULT_SEED_ELO,
            win_rate: null,
            games: null,
            verified_at: now,
            verified_sha: null,
            attempts: 0,
            bytes: new TextEncoder().encode(body).length,
        });
    }
    return { rows, files };
}

/**
 * @param {string | number | null} value a column value
 * @returns {string} the SQL literal (strings single-quoted with quotes doubled)
 */
function literal(value) {
    if (value === null) {
        return 'NULL';
    }
    return typeof value === 'number' ? String(value) : `'${value.replaceAll("'", "''")}'`;
}

/**
 * @param {Season} season a season entry of `library/seasons.json`
 * @returns {string} an idempotent `INSERT OR REPLACE` of its `seasons` row
 */
export function seasonSql(season) {
    const values = [
        season.season,
        season.rulesHash,
        season.layout.inputCount,
        season.layout.brainHidden,
        season.layout.outputCount,
        season.opened,
        season.major,
    ];
    return `INSERT OR REPLACE INTO seasons (season, rules_hash, input_count, brain_hidden, output_count, opened, major) VALUES (${values.map(literal).join(', ')});`;
}

/**
 * @param {readonly {id: string, body: string}[]} files the seeded files
 * @returns {string} one idempotent `INSERT OR REPLACE` per file, for `wrangler d1 execute --file`; run after
 *   `championsSql` (the file's id references the champion row)
 */
export function filesSql(files) {
    return files
        .map(
            (file) =>
                `INSERT OR REPLACE INTO champion_files (id, body) VALUES (${literal(file.id)}, ${literal(file.body)});`,
        )
        .join('\n');
}

/**
 * @param {readonly ChampionRow[]} rows the seeded rows
 * @returns {string} one idempotent `INSERT OR REPLACE` per row, in order, for `wrangler d1 execute --file`
 */
export function championsSql(rows) {
    const columns = Object.keys(rows[0] ?? {});
    return rows
        .map((row) => {
            const values = columns.map((column) => literal(/** @type {any} */ (row)[column]));
            return `INSERT OR REPLACE INTO champions (${columns.join(', ')}) VALUES (${values.join(', ')});`;
        })
        .join('\n');
}
