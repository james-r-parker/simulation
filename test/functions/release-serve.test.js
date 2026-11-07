import { afterEach, describe, expect, it, vi } from 'vitest';
import { serveNext, serveSeason, serveVersion } from '../../functions/_lib/release-serve.js';
import { releaseSql } from '../../js/library/releases.js';
import { fakeCache, fakeD1 } from './helpers/fakes.js';

const entry = (/** @type {string} */ version, season = 6) => ({ version, season, date: '2026-11-01', rulesHash: 'h' });

/** @returns {{env: any, fetcher: any}} D1 with releases 6.0.0 and 6.1.0 and a fetch that serves only the 6.1.0 deployment */
function world() {
    const { db, sqlite } = fakeD1();
    for (const version of ['6.0.0', '6.1.0']) {
        sqlite.exec(releaseSql(entry(version)));
    }
    const pages = /** @type {Record<string, [string, string]>} */ ({
        'https://v6-1-0.matrix-6be.pages.dev/index.html': ['<html>6.1</html>', 'text/html; charset=utf-8'],
        'https://v6-1-0.matrix-6be.pages.dev/assets/app.js': ['js', 'text/javascript'],
    });
    const fetcher = vi.fn(async (/** @type {string} */ url) => {
        const hit = pages[url];
        return hit === undefined
            ? new Response('nope', { status: 404 })
            : new Response(hit[0], { headers: { 'Content-Type': hit[1] } });
    });
    return { env: { DB: db, PAGES_SUBDOMAIN: 'matrix-6be' }, fetcher };
}

const ctx = (/** @type {string} */ url, /** @type {string[]} */ path, /** @type {any} */ env) => ({
    request: new Request(url),
    params: { path },
    env,
});

afterEach(() => vi.unstubAllGlobals());

describe('serveVersion', () => {
    it('proxies a file from the release deployment with its type, nosniff and immutable caching', async () => {
        const { env, fetcher } = world();
        const res = await serveVersion(
            ctx('https://x/v/6.1.0/assets/app.js', ['6.1.0', 'assets', 'app.js'], env),
            fetcher,
        );
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('js');
        expect(res.headers.get('Content-Type')).toContain('javascript');
        expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
        expect(fetcher.mock.calls[0][0]).toBe('https://v6-1-0.matrix-6be.pages.dev/assets/app.js');
    });

    it('serves index.html for the bare version and the index from D1 with a short cache', async () => {
        const { env, fetcher } = world();
        expect(await (await serveVersion(ctx('https://x/v/6.1.0/', ['6.1.0'], env), fetcher)).text()).toBe(
            '<html>6.1</html>',
        );
        const res = await serveVersion(ctx('https://x/v/index.json', ['index.json'], env), fetcher);
        expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
        expect((await res.json()).releases.map((/** @type {any} */ r) => r.version)).toEqual(['6.0.0', '6.1.0']);
    });

    it.each([
        [['9.9.9', 'index.html']],
        [['6.1.0', '..', '..', 'secret', 'key']],
        [['6.1.0', 'a', '', 'b']],
        [['x']],
        [['6.1.0', 'a\\b']],
        [[]],
        [['6.0.0']],
    ])('answers 404 not_found for %j and fetches nothing for a stored-less or unsafe request', async (path) => {
        const { env, fetcher } = world();
        const res = await serveVersion(ctx('https://x/v/q', path, env), fetcher);
        expect(res.status).toBe(404);
        expect((await res.json()).error.code).toBe('not_found');
        const hosts = fetcher.mock.calls.map((/** @type {any} */ call) => new URL(call[0]).host);
        expect(hosts.every((/** @type {string} */ host) => /^v6-[01]-0\.matrix-6be\.pages\.dev$/.test(host))).toBe(
            true,
        );
    });

    it('serves the second identical request from the Cache API', async () => {
        vi.stubGlobal('caches', { default: fakeCache() });
        const { env, fetcher } = world();
        const make = () => ctx('https://x/v/6.1.0/assets/app.js', ['6.1.0', 'assets', 'app.js'], env);
        expect((await serveVersion(make(), fetcher)).headers.get('X-Cache')).toBeNull();
        const second = await serveVersion(make(), fetcher);
        expect(second.headers.get('X-Cache')).toBe('HIT');
        expect(await second.text()).toBe('js');
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('does not cache a 404', async () => {
        vi.stubGlobal('caches', { default: fakeCache() });
        const { env, fetcher } = world();
        await serveVersion(ctx('https://x/v/9.9.9/a', ['9.9.9', 'a'], env), fetcher);
        const again = await serveVersion(ctx('https://x/v/9.9.9/a', ['9.9.9', 'a'], env), fetcher);
        expect(again.headers.get('X-Cache')).toBeNull();
    });
});

describe('serveSeason', () => {
    it("serves the season's newest index.html", async () => {
        const { env, fetcher } = world();
        const res = await serveSeason(ctx('https://x/s/6', ['6'], env), fetcher);
        expect(await res.text()).toBe('<html>6.1</html>');
        expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
    });

    it('redirects a file to the newest version', async () => {
        const { env, fetcher } = world();
        const res = await serveSeason(ctx('https://x/s/6/assets/app.js', ['6', 'assets', 'app.js'], env), fetcher);
        expect(res.status).toBe(302);
        expect(res.headers.get('Location')).toBe('/v/6.1.0/assets/app.js');
    });

    it.each([[['7']], [['abc']], [['6', '..', 'x']]])('answers 404 for %j', async (path) => {
        const { env, fetcher } = world();
        expect((await serveSeason(ctx('https://x/s/q', path, env), fetcher)).status).toBe(404);
    });

    it('answers 404 when no release is stored', async () => {
        const env = { DB: fakeD1().db, PAGES_SUBDOMAIN: 'matrix-6be' };
        expect((await serveSeason(ctx('https://x/s/6', ['6'], env), vi.fn())).status).toBe(404);
    });
});

describe('serveNext', () => {
    it('forwards to the next alias of the project host with the query', async () => {
        const fetcher = vi.fn(async () => new Response('ok'));
        const context = ctx('https://x/next/a/b.js?v=1', ['a', 'b.js'], { PAGES_SUBDOMAIN: 'matrix-6be' });
        await serveNext(context, /** @type {any} */ (fetcher));
        expect(/** @type {any} */ (fetcher.mock.calls[0])[0]).toBe('https://next.matrix-6be.pages.dev/a/b.js?v=1');
    });

    it('refuses an unsafe path and an unset or odd subdomain', async () => {
        const fetcher = vi.fn();
        const run = (/** @type {string[]} */ path, /** @type {any} */ env) =>
            serveNext(ctx('https://x/next/a', path, env), /** @type {any} */ (fetcher));
        expect((await run(['..'], { PAGES_SUBDOMAIN: 'matrix-6be' })).status).toBe(404);
        expect((await run(['a'], {})).status).toBe(404);
        expect((await run(['a'], { PAGES_SUBDOMAIN: 'a.evil.com/' })).status).toBe(404);
        expect(fetcher).not.toHaveBeenCalled();
    });
});
