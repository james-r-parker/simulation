import { describe, expect, it } from 'vitest';
import { GENOME_SPECS } from '../../js/evo/genome.js';
import { CHAMPION_VERSION, validateChampion } from '../../js/evo/league.js';
import { canonicalChampion, championId, genomeKey } from '../../js/library/canonical.js';
import { decodeCursor, encodeCursor, parseListQuery } from '../../js/library/query.js';
import { toPublicChampion } from '../../js/library/rows.js';
import {
    canSeed,
    checkSeasons,
    currentSeason,
    daysBetween,
    MIN_SEASON_GAP_DAYS,
    seasonOf,
} from '../../js/library/seasons.js';
import { buildSeedRows, championsSql, DEFAULT_SEED_ELO, seasonSql } from '../../js/library/seed.js';
import { ApiError, CHAMPION_FILE_VERSION, errorBody, SPEC_NAMES } from '../../js/library/shapes.js';
import { createConfig } from '../../js/sim/config.js';
import { ELO_START } from '../../js/evo/elo.js';
import { makeChampionFile } from '../evo/helpers/champion-file.js';

const q = (/** @type {string} */ text) => new URLSearchParams(text);
const layout = { inputCount: 10, brainHidden: 4, outputCount: 3 };

describe('shapes', () => {
    it('stays equal to the evo constants it mirrors', () => {
        expect([...SPEC_NAMES]).toEqual([...GENOME_SPECS]);
        expect(CHAMPION_FILE_VERSION).toBe(CHAMPION_VERSION);
        expect(DEFAULT_SEED_ELO).toBe(ELO_START);
    });

    it('builds the error body with the field only when there is one', () => {
        expect(errorBody(new ApiError(400, 'bad_query', 'no', 'limit'))).toEqual({
            error: { code: 'bad_query', message: 'no', field: 'limit' },
        });
        expect(errorBody(new ApiError(404, 'not_found', 'gone'))).toEqual({
            error: { code: 'not_found', message: 'gone' },
        });
    });
});

describe('parseListQuery', () => {
    it('applies the defaults', () => {
        expect(parseListQuery(q(''))).toEqual({ season: null, spec: null, sort: 'elo', limit: 20, cursor: null });
    });

    it('reads every parameter', () => {
        const cursor = encodeCursor({ key: 1510, id: 'a'.repeat(64) });
        const parsed = parseListQuery(q(`season=6&spec=defender&sort=created&limit=50&cursor=${cursor}`));
        expect(parsed).toEqual({
            season: 6,
            spec: 4,
            sort: 'created',
            limit: 50,
            cursor: { key: 1510, id: 'a'.repeat(64) },
        });
    });

    it.each([
        ['season=x', 'season'],
        ['season=-1', 'season'],
        ['spec=wizard', 'spec'],
        ['sort=name', 'sort'],
        ['limit=0', 'limit'],
        ['limit=51', 'limit'],
        ['limit=2.5', 'limit'],
        ['cursor=!!!', 'cursor'],
    ])('rejects %s naming %s', (text, field) => {
        expect(() => parseListQuery(q(text))).toThrow(expect.objectContaining({ status: 400, field }));
    });
});

describe('cursor', () => {
    it('round-trips and is url safe', () => {
        const cursor = { key: 1523.5, id: 'f'.repeat(64) };
        const text = encodeCursor(cursor);
        expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(decodeCursor(text)).toEqual(cursor);
    });

    it('refuses a cursor with a bad id or key', () => {
        const forge = (/** @type {unknown} */ value) =>
            btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
        expect(() => decodeCursor(forge([1, 'short']))).toThrow(ApiError);
        expect(() => decodeCursor(forge(['x', 'a'.repeat(64)]))).toThrow(ApiError);
        expect(() => decodeCursor(forge({}))).toThrow(ApiError);
    });
});

describe('seasons', () => {
    const six = { season: 6, rulesHash: 'h6', layout, opened: '2026-11-01', major: 6 };
    const seven = { season: 7, rulesHash: 'h7', layout, opened: '2026-12-01', major: 7 };

    it('finds the current season and a season by ruleset', () => {
        expect(currentSeason([])).toBeNull();
        expect(currentSeason([six, seven])).toBe(seven);
        expect(seasonOf([six, seven], 'h6')).toBe(six);
        expect(seasonOf([six, seven], 'zz')).toBeNull();
    });

    it('seeds only on the same ruleset and layout', () => {
        expect(canSeed(six, { rulesHash: 'h6', layout: { ...layout } })).toBe(true);
        expect(canSeed(six, { rulesHash: 'h7', layout })).toBe(false);
        for (const key of ['inputCount', 'brainHidden', 'outputCount']) {
            expect(canSeed(six, { rulesHash: 'h6', layout: { ...layout, [key]: 99 } })).toBe(false);
        }
    });

    it('counts days and checks the rules', () => {
        expect(daysBetween('2026-11-01', '2026-11-29')).toBe(MIN_SEASON_GAP_DAYS);
        expect(checkSeasons([])).toEqual([]);
        expect(checkSeasons([six, seven])).toEqual([]);
        expect(checkSeasons([six, { ...seven, opened: '2026-11-28' }])).toHaveLength(1);
        expect(checkSeasons([six, { ...seven, season: 8, major: 8 }])).toHaveLength(1);
        expect(checkSeasons([{ ...six, major: 5 }])).toHaveLength(1);
        expect(MIN_SEASON_GAP_DAYS).toBe(28);
    });
});

describe('canonicalChampion', () => {
    const config = createConfig();
    const file = makeChampionFile('alpha', 1, { specialisation: 2 });

    it('orders keys, drops extras and has no whitespace', () => {
        const messy = { weights: file.weights, genomeId: 9, fitness: 1, ...file, cell: undefined };
        const text = canonicalChampion(messy);
        expect(text).not.toMatch(/\s(?=[{"[])/);
        expect(Object.keys(JSON.parse(text))).toEqual([
            'version',
            'name',
            'rulesHash',
            'layout',
            'specialisation',
            'weights',
        ]);
        expect(Object.keys(JSON.parse(text).layout).slice(-3)).toEqual(['inputCount', 'brainHidden', 'outputCount']);
    });

    it('keeps cell, and the canonical file still validates', () => {
        const text = canonicalChampion({ ...file, cell: 7 });
        expect(JSON.parse(text).cell).toBe(7);
        expect(() => validateChampion(JSON.parse(text), config)).not.toThrow();
    });

    it('gives one id to the same champion however the keys were ordered', async () => {
        const reordered = Object.fromEntries(Object.entries({ ...file, extra: 1 }).reverse());
        expect(await championId(canonicalChampion(reordered))).toBe(await championId(canonicalChampion(file)));
        expect(await championId(canonicalChampion(file))).toMatch(/^[0-9a-f]{64}$/);
    });

    it('matches a known SHA-256', async () => {
        expect(await championId('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
        expect(genomeKey(6, 'x')).toBe('s6/x.json');
    });
});

describe('toPublicChampion', () => {
    it('hides r2_key, attempts, uploader_id and the reject reason', () => {
        const view = toPublicChampion({
            id: 'i',
            season: 6,
            rules_hash: 'h',
            specialisation: 1,
            name: 'n',
            cell: 3,
            uploader_id: 77,
            created: 5,
            status: 'verified',
            reject_reason: 'x',
            elo: 1600,
            win_rate: 0.5,
            games: 8,
            verified_at: 6,
            verified_sha: 's',
            attempts: 2,
            bytes: 9,
            r2_key: 'k',
        });
        expect(Object.keys(view).sort()).toEqual([
            'bytes',
            'cell',
            'created',
            'elo',
            'games',
            'id',
            'name',
            'rulesHash',
            'season',
            'specialisation',
            'uploader',
            'verifiedAt',
            'winRate',
        ]);
        expect(view.uploader).toBeNull();
    });
});

describe('seeding', () => {
    const season = { season: 6, rulesHash: 'h6', layout, opened: '2026-11-01', major: 6 };

    it('builds one verified official row per distinct file, with the league Elo', async () => {
        const a = makeChampionFile('a', 1, { specialisation: 0 });
        const b = makeChampionFile('b', 2, { specialisation: 1 });
        const { rows, objects } = await buildSeedRows([a, b, a], {
            season: 6,
            league: { champions: [{ name: 'a', elo: 1625 }] },
            now: 100,
        });
        expect(rows).toHaveLength(2);
        expect(rows.map((r) => r.elo)).toEqual([1625, DEFAULT_SEED_ELO]);
        expect(rows[0]).toMatchObject({
            status: 'verified',
            uploader_id: null,
            created: 100,
            season: 6,
            r2_key: objects[0].key,
        });
        expect(rows[0].bytes).toBe(new TextEncoder().encode(objects[0].body).length);
        expect(objects[0].key).toBe(`s6/${rows[0].id}.json`);
    });

    it('writes idempotent SQL', async () => {
        expect(seasonSql(season)).toMatch(
            /^INSERT OR REPLACE INTO seasons .* VALUES \(6, 'h6', 10, 4, 3, '2026-11-01', 6\);$/,
        );
        expect(championsSql([])).toBe('');
        const { rows } = await buildSeedRows([makeChampionFile('a', 1)], {
            season: 6,
            league: { champions: [] },
            now: 1,
        });
        expect(championsSql(rows)).toMatch(/^INSERT OR REPLACE INTO champions \(id, season,.* NULL/);
    });
});
