import { describe, expect, it } from 'vitest';
import { getChampion, getChampionFile, listChampions, listSeasons } from '../../functions/_lib/db.js';
import { parseListQuery } from '../../js/library/query.js';
import { championsSql, filesSql, seasonSql } from '../../js/library/seed.js';
import { fakeD1 } from './helpers/fakes.js';

const id = (/** @type {number} */ n) => n.toString(16).padStart(64, '0');
const champion = (/** @type {number} */ n, /** @type {string} */ status) => ({
    id: id(n),
    season: 6,
    rules_hash: 'abc',
    specialisation: 0,
    name: `c${n}`,
    cell: null,
    uploader_id: null,
    created: 1000 + n,
    status,
    reject_reason: null,
    elo: 1500 + n,
    win_rate: 0.5,
    games: 8,
    verified_at: 1,
    verified_sha: null,
    attempts: 0,
    bytes: 5,
});
const season = (/** @type {number} */ n) => ({
    season: n,
    rulesHash: `hash${n}`,
    layout: { inputCount: 1, brainHidden: 2, outputCount: 3 },
    opened: `2026-0${n}-01`,
    major: n,
});

/** @returns {any} a D1 binding holding one verified and one pending champion, both with files, and two seasons */
function world() {
    const { db, sqlite } = fakeD1();
    sqlite.exec(seasonSql(season(5)));
    sqlite.exec(seasonSql(season(6)));
    sqlite.exec(championsSql([champion(1, 'verified'), champion(2, 'pending')]));
    sqlite.exec(
        filesSql([
            { id: id(1), body: '{"a":1}' },
            { id: id(2), body: '{"a":2}' },
        ]),
    );
    return db;
}

describe('functions/_lib/db', () => {
    it('lists seasons newest first and marks only the newest current', async () => {
        const seasons = await listSeasons(world());
        expect(seasons.map((s) => [s.season, s.current])).toEqual([
            [6, true],
            [5, false],
        ]);
        expect(seasons[0].layout).toEqual({ inputCount: 1, brainHidden: 2, outputCount: 3 });
    });

    it('lists verified champions only', async () => {
        const page = await listChampions(world(), parseListQuery(new URLSearchParams()), 6);
        expect(page.items.map((item) => item.id)).toEqual([id(1)]);
        expect(page.next).toBeNull();
    });

    it('reads a champion and its file only while it is verified', async () => {
        const db = world();
        expect((await getChampion(db, id(1)))?.name).toBe('c1');
        expect(await getChampionFile(db, id(1))).toBe('{"a":1}');
        expect(await getChampion(db, id(2))).toBeNull();
        expect(await getChampionFile(db, id(2))).toBeNull();
        expect(await getChampion(db, id(9))).toBeNull();
    });
});
