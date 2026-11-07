import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleFile, handleList, handleOne, handleSeasons } from '../../functions/_lib/library-api.js';
import { championsSql, seasonSql } from '../../js/library/seed.js';
import { fakeCache, fakeD1, fakeR2 } from './helpers/fakes.js';

const id = (/** @type {number} */ n) => n.toString(16).padStart(64, '0');
const row = (/** @type {number} */ n, /** @type {Record<string, any>} */ over = {}) => ({
    id: id(n),
    season: 6,
    rules_hash: 'abc',
    specialisation: n % 5,
    name: `c${n}`,
    cell: null,
    uploader_id: 42,
    created: 1000 + n,
    status: 'verified',
    reject_reason: 'secret',
    elo: 1500 + n,
    win_rate: 0.5,
    games: 8,
    verified_at: 1,
    verified_sha: null,
    attempts: 3,
    bytes: 5,
    r2_key: `s6/${id(n)}.json`,
    ...over,
});
const season = {
    season: 6,
    rulesHash: 'abc',
    layout: { inputCount: 1, brainHidden: 2, outputCount: 3 },
    opened: '2026-11-01',
    major: 6,
};

/** @returns {{env: any, reads: {count: number}}} bindings holding 3 verified champions, a pending one and a removed one */
function world() {
    const { db, sqlite, reads } = fakeD1();
    sqlite.exec(seasonSql(season));
    sqlite.exec(championsSql([row(1), row(2), row(3), row(4, { status: 'pending' }), row(5, { status: 'removed' })]));
    const GENES = fakeR2({ [`s6/${id(1)}.json`]: '{"file":1}', [`s6/${id(4)}.json`]: '{"file":4}' });
    return { env: { DB: db, GENES }, reads };
}

const call = (/** @type {any} */ handler, /** @type {string} */ url, /** @type {any} */ env, params = {}) =>
    handler({ request: new Request(url), env, params });

afterEach(() => vi.unstubAllGlobals());

describe('GET /api/seasons', () => {
    it('lists seasons newest first with current on the newest', async () => {
        const { env } = world();
        env.DB.prepare;
        const res = await call(handleSeasons, 'https://x/api/seasons', env);
        expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=300');
        expect((await res.json()).seasons).toEqual([{ ...season, rulesHash: 'abc', current: true }]);
    });
});

describe('GET /api/champions', () => {
    it('lists verified champions of the current season, best Elo first, without private columns', async () => {
        const { env } = world();
        const res = await call(handleList, 'https://x/api/champions', env);
        const body = await res.json();
        expect(body.items.map((/** @type {any} */ i) => i.id)).toEqual([id(3), id(2), id(1)]);
        expect(body.next).toBeNull();
        expect(JSON.stringify(body)).not.toMatch(/r2_key|attempts|uploader_id|secret/);
        expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=60');
    });

    it('pages with the cursor', async () => {
        const { env } = world();
        const first = await (await call(handleList, 'https://x/api/champions?limit=2', env)).json();
        expect(first.items).toHaveLength(2);
        const second = await (
            await call(handleList, `https://x/api/champions?limit=2&cursor=${first.next}`, env)
        ).json();
        expect(second.items.map((/** @type {any} */ i) => i.id)).toEqual([id(1)]);
        expect(second.next).toBeNull();
    });

    it('answers an empty page when no season exists, and 400 for a bad query', async () => {
        const { db } = fakeD1();
        const empty = await call(handleList, 'https://x/api/champions', { DB: db });
        expect(await empty.json()).toEqual({ items: [], next: null });
        const bad = await call(handleList, 'https://x/api/champions?limit=999', world().env);
        expect(bad.status).toBe(400);
        expect(await bad.json()).toEqual({ error: { code: 'bad_query', message: expect.any(String), field: 'limit' } });
    });

    it('serves an identical second request from the cache without a D1 read', async () => {
        vi.stubGlobal('caches', { default: fakeCache() });
        const { env, reads } = world();
        await call(handleList, 'https://x/api/champions?spec=scout', env);
        const after = reads.count;
        const second = await call(handleList, 'https://x/api/champions?spec=scout', env);
        expect(second.headers.get('X-Cache')).toBe('HIT');
        expect(reads.count).toBe(after);
    });
});

describe('GET /api/champions/:id and its file', () => {
    it('returns the metadata and the file of a verified champion', async () => {
        const { env } = world();
        const one = await call(handleOne, 'https://x', env, { id: id(1) });
        expect((await one.json()).name).toBe('c1');
        const file = await call(handleFile, 'https://x', env, { id: id(1) });
        expect(await file.text()).toBe('{"file":1}');
        expect(file.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    });

    it.each([
        ['pending', 4],
        ['removed', 5],
        ['unknown', 99],
    ])('answers 404 not_found for a %s champion (metadata and file)', async (_name, n) => {
        const { env } = world();
        for (const handler of [handleOne, handleFile]) {
            const res = await call(handler, 'https://x', env, { id: id(n) });
            expect(res.status).toBe(404);
            expect((await res.json()).error.code).toBe('not_found');
        }
    });

    it('answers 404 for a malformed id without reading D1 and for a missing R2 object', async () => {
        const { env, reads } = world();
        expect((await call(handleOne, 'https://x', env, { id: "1' OR '1'='1" })).status).toBe(404);
        expect(reads.count).toBe(0);
        expect((await call(handleFile, 'https://x', env, { id: id(2) })).status).toBe(404);
    });

    it('answers 500 internal and leaks nothing when D1 throws', async () => {
        const broken = {
            prepare: () => {
                throw new Error('secret db detail');
            },
        };
        const res = await call(handleSeasons, 'https://x', { DB: broken });
        expect(res.status).toBe(500);
        expect(JSON.stringify(await res.json())).not.toContain('secret');
    });
});
