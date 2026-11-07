import { afterEach, describe, expect, it, vi } from 'vitest';
import { serveNext, serveSeason, serveVersion } from '../../functions/_lib/release-serve.js';
import { fakeCache, fakeR2 } from './helpers/fakes.js';

const index = JSON.stringify({
    releases: [
        { version: '6.0.0', season: 6, date: 'd', rulesHash: 'h' },
        { version: '6.1.0', season: 6, date: 'd', rulesHash: 'h' },
    ],
});
const files = {
    'releases/index.json': index,
    'releases/6.1.0/index.html': '<html>6.1</html>',
    'releases/6.1.0/assets/app.js': 'js',
    'secret/key': 'nope',
};

const ctx = (/** @type {string} */ url, /** @type {string[]} */ path, env = {}) => ({
    request: new Request(url),
    params: { path },
    env: { RELEASES: fakeR2(files), ...env },
});

afterEach(() => vi.unstubAllGlobals());

describe('serveVersion', () => {
    it('serves a file with its type, nosniff and immutable caching', async () => {
        const res = await serveVersion(ctx('https://x/v/6.1.0/assets/app.js', ['6.1.0', 'assets', 'app.js']));
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('js');
        expect(res.headers.get('Content-Type')).toContain('javascript');
        expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    });

    it('serves index.html for the bare version and the index with a short cache', async () => {
        expect(await (await serveVersion(ctx('https://x/v/6.1.0/', ['6.1.0']))).text()).toBe('<html>6.1</html>');
        const res = await serveVersion(ctx('https://x/v/index.json', ['index.json']));
        expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
        expect(JSON.parse(await res.text()).releases).toHaveLength(2);
    });

    it.each([
        [['9.9.9', 'index.html']],
        [['6.1.0', '..', '..', 'secret', 'key']],
        [['6.1.0', 'a', '', 'b']],
        [['x']],
        [['6.1.0', 'a\\b']],
        [[]],
    ])('answers 404 not_found for %j and never reads outside releases/', async (path) => {
        const res = await serveVersion(ctx('https://x/v/q', path));
        expect(res.status).toBe(404);
        expect((await res.json()).error.code).toBe('not_found');
    });

    it('serves the second identical request from the Cache API', async () => {
        const cache = fakeCache();
        vi.stubGlobal('caches', { default: cache });
        const bucket = fakeR2(files);
        const get = vi.spyOn(bucket, 'get');
        const make = () => ({
            request: new Request('https://x/v/6.1.0/assets/app.js'),
            params: { path: ['6.1.0', 'assets', 'app.js'] },
            env: { RELEASES: bucket },
        });
        const first = await serveVersion(make());
        expect(first.headers.get('X-Cache')).toBeNull();
        const second = await serveVersion(make());
        expect(second.headers.get('X-Cache')).toBe('HIT');
        expect(await second.text()).toBe('js');
        expect(get).toHaveBeenCalledTimes(1);
    });

    it('does not cache a 404', async () => {
        vi.stubGlobal('caches', { default: fakeCache() });
        await serveVersion(ctx('https://x/v/9.9.9/a', ['9.9.9', 'a']));
        const again = await serveVersion(ctx('https://x/v/9.9.9/a', ['9.9.9', 'a']));
        expect(again.headers.get('X-Cache')).toBeNull();
    });
});

describe('serveSeason', () => {
    it("serves the season's newest index.html", async () => {
        const res = await serveSeason(ctx('https://x/s/6', ['6']));
        expect(await res.text()).toBe('<html>6.1</html>');
        expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
    });

    it('redirects a file to the newest version', async () => {
        const res = await serveSeason(ctx('https://x/s/6/assets/app.js', ['6', 'assets', 'app.js']));
        expect(res.status).toBe(302);
        expect(res.headers.get('Location')).toBe('/v/6.1.0/assets/app.js');
    });

    it.each([[['7']], [['abc']], [['6', '..', 'x']]])('answers 404 for %j', async (path) => {
        expect((await serveSeason(ctx('https://x/s/q', path))).status).toBe(404);
    });

    it('answers 404 when no index is stored', async () => {
        const context = ctx('https://x/s/6', ['6'], { RELEASES: fakeR2() });
        expect((await serveSeason(context)).status).toBe(404);
    });
});

describe('serveNext', () => {
    it('forwards to the next alias of the project with the query', async () => {
        const fetcher = vi.fn(async () => new Response('ok'));
        const context = ctx('https://x/next/a/b.js?v=1', ['a', 'b.js'], { PAGES_PROJECT: 'matrix' });
        await serveNext(context, /** @type {any} */ (fetcher));
        expect(/** @type {any} */ (fetcher.mock.calls[0])[0]).toBe('https://next.matrix.pages.dev/a/b.js?v=1');
    });

    it('refuses an unsafe path and an unset or odd project', async () => {
        const fetcher = vi.fn();
        expect(
            (
                await serveNext(
                    ctx('https://x/next/..', ['..'], { PAGES_PROJECT: 'matrix' }),
                    /** @type {any} */ (fetcher),
                )
            ).status,
        ).toBe(404);
        expect((await serveNext(ctx('https://x/next/a', ['a']), /** @type {any} */ (fetcher))).status).toBe(404);
        expect(
            (
                await serveNext(
                    ctx('https://x/next/a', ['a'], { PAGES_PROJECT: 'a.evil.com/' }),
                    /** @type {any} */ (fetcher),
                )
            ).status,
        ).toBe(404);
        expect(fetcher).not.toHaveBeenCalled();
    });
});
