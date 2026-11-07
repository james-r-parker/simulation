// The migration and the list SQL, run on a real SQLite (D1 is SQLite) through node:sqlite.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { listSql, toPage } from '../../js/library/list.js';
import { parseListQuery } from '../../js/library/query.js';
import { championsSql, filesSql, seasonSql } from '../../js/library/seed.js';

const HASH = (/** @type {number} */ n) => n.toString(16).padStart(64, '0');

/** @returns {import('../../js/library/rows.js').ChampionRow} a verified row */
function row(/** @type {number} */ n, /** @type {Record<string, any>} */ over = {}) {
    return {
        id: HASH(n),
        season: 6,
        rules_hash: 'abc',
        specialisation: n % 5,
        name: `c${n}`,
        cell: null,
        uploader_id: null,
        created: 1000 + n,
        status: 'verified',
        reject_reason: null,
        elo: 1500 + (n % 7) * 10,
        win_rate: null,
        games: null,
        verified_at: 1000 + n,
        verified_sha: null,
        attempts: 0,
        bytes: 10,
        ...over,
    };
}

function openDb() {
    const db = new DatabaseSync(':memory:');
    for (const file of ['0001_library.sql', '0002_champion_files.sql']) {
        db.exec(readFileSync(`migrations/${file}`, 'utf8'));
    }
    db.exec(
        seasonSql({
            season: 6,
            rulesHash: 'abc',
            layout: { inputCount: 1, brainHidden: 2, outputCount: 3 },
            opened: '2026-11-01',
            major: 6,
        }),
    );
    return db;
}

/** Walks every page of a query and returns the ids in order. */
function walk(/** @type {DatabaseSync} */ db, /** @type {string} */ qs) {
    const ids = [];
    let cursor = '';
    for (let page = 0; page < 50; page++) {
        const query = parseListQuery(new URLSearchParams(`${qs}${cursor}`));
        const { sql, params } = listSql(query, query.season ?? 6);
        const rows = /** @type {any[]} */ (db.prepare(sql).all(...params));
        const result = toPage(rows, query);
        ids.push(...result.items.map((item) => item.id));
        if (result.next === null) {
            return ids;
        }
        cursor = `&cursor=${result.next}`;
    }
    throw new Error('did not end');
}

describe('migrations/0001_library.sql', () => {
    it('creates the tables and the three browse indexes', () => {
        const db = openDb();
        const names = db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'champions_by_%'").all();
        expect(names.map((entry) => entry.name).sort()).toEqual([
            'champions_by_created',
            'champions_by_elo',
            'champions_by_spec',
        ]);
    });

    it('rejects a status or specialisation out of range', () => {
        const db = openDb();
        expect(() => db.exec(championsSql([row(1, { status: 'bogus' })]))).toThrow();
        expect(() => db.exec(championsSql([row(1, { specialisation: 5 })]))).toThrow();
    });

    it('seeding twice leaves one row per id', () => {
        const db = openDb();
        const sql = championsSql([row(1), row(2)]);
        db.exec(sql);
        db.exec(sql);
        expect(db.prepare('SELECT COUNT(*) AS n FROM champions').get()?.n).toBe(2);
    });

    it('escapes quotes in a name', () => {
        const db = openDb();
        db.exec(championsSql([row(1, { name: "o'brien" })]));
        expect(db.prepare('SELECT name FROM champions').get()?.name).toBe("o'brien");
    });
});

describe('migrations/0002_champion_files.sql', () => {
    const BODY = '{"a":"o\'k"}';

    it('drops r2_key and keeps the file in its own table', () => {
        const db = openDb();
        const columns = db
            .prepare('PRAGMA table_info(champions)')
            .all()
            .map((c) => c.name);
        expect(columns).not.toContain('r2_key');
        db.exec(championsSql([row(1)]));
        const sql = filesSql([{ id: HASH(1), body: BODY }]);
        db.exec(sql);
        db.exec(sql);
        expect(db.prepare('SELECT COUNT(*) AS n FROM champion_files').get()?.n).toBe(1);
        expect(db.prepare('SELECT body FROM champion_files WHERE id = ?').get(HASH(1))?.body).toBe(BODY);
    });

    it('refuses a file over the cap and one without a champion row', () => {
        const db = openDb();
        db.exec(championsSql([row(1)]));
        expect(() => db.exec(filesSql([{ id: HASH(1), body: 'x'.repeat(65537) }]))).toThrow();
        db.exec('PRAGMA foreign_keys = ON');
        expect(() => db.exec(filesSql([{ id: HASH(9), body: '{}' }]))).toThrow();
    });
});

describe('listSql', () => {
    const all = Array.from({ length: 23 }, (_, n) => row(n + 1));
    const db = openDb();
    db.exec(
        championsSql(
            [...all, row(100, { status: 'pending' }), row(101, { status: 'removed' }), row(102, { season: 5 })].filter(
                (r) => r.season === 6,
            ),
        ),
    );

    it('lists only verified rows of the season, best Elo first with id as the tie break', () => {
        const ids = walk(db, 'limit=50');
        const expected = [...all]
            .sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0) || (a.id < b.id ? -1 : 1))
            .map((r) => r.id);
        expect(ids).toEqual(expected);
    });

    it('pages with the cursor without repeating or skipping a row', () => {
        const paged = walk(db, 'limit=4');
        expect(paged).toEqual(walk(db, 'limit=50'));
        expect(new Set(paged).size).toBe(23);
    });

    it('filters by specialisation and sorts by created', () => {
        const ids = walk(db, 'spec=scout&sort=created&limit=3');
        const expected = all
            .filter((r) => r.specialisation === 3)
            .sort((a, b) => b.created - a.created)
            .map((r) => r.id);
        expect(ids).toEqual(expected);
    });

    it('asks for one row more than the page', () => {
        const query = parseListQuery(new URLSearchParams('limit=7'));
        expect(listSql(query, 6).params.at(-1)).toBe(8);
    });

    it('answers an empty season with no items and no cursor', () => {
        const query = parseListQuery(new URLSearchParams('season=9'));
        const { sql, params } = listSql(query, 9);
        expect(toPage(/** @type {any[]} */ (db.prepare(sql).all(...params)), query)).toEqual({ items: [], next: null });
    });

    it('uses an index, not a table scan', () => {
        const query = parseListQuery(new URLSearchParams('spec=forager'));
        const { sql, params } = listSql(query, 6);
        const plan = db
            .prepare(`EXPLAIN QUERY PLAN ${sql}`)
            .all(...params)
            .map((r) => r.detail)
            .join(' ');
        expect(plan).toContain('USING INDEX champions_by_spec');
    });
});
