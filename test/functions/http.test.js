import { afterEach, describe, expect, it, vi } from 'vitest';
import { cached, errorResponse, json, logEvent } from '../../functions/_lib/http.js';
import { ApiError } from '../../js/library/shapes.js';
import { fakeCache } from './helpers/fakes.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('functions/_lib/http', () => {
    it('sends JSON with nosniff and the cache header it is given', async () => {
        const response = json({ a: 1 }, { status: 201, cacheControl: 'public, max-age=60' });
        expect(response.status).toBe(201);
        expect(response.headers.get('Cache-Control')).toBe('public, max-age=60');
        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(await response.json()).toEqual({ a: 1 });
    });

    it('answers an ApiError with its status and any other error with a logged 500', async () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const known = errorResponse(new ApiError(404, 'not_found', 'no such champion'));
        expect(known.status).toBe(404);
        expect((await known.json()).error.code).toBe('not_found');
        const unknown = errorResponse(new Error('boom'));
        expect(unknown.status).toBe(500);
        expect((await unknown.json()).error.code).toBe('internal');
        expect(log).toHaveBeenCalledWith(JSON.stringify({ event: 'FunctionFailed', message: 'boom' }));
    });

    it('logs one JSON line per event', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        logEvent('ReleaseNotFound', { kind: 'version', key: '9.9.9' });
        expect(log).toHaveBeenCalledWith('{"event":"ReleaseNotFound","kind":"version","key":"9.9.9"}');
    });

    it('builds once, then serves a marked copy from the cache; a non-200 is never stored', async () => {
        vi.stubGlobal('caches', { default: fakeCache() });
        const build = vi.fn(async () => json({ ok: true }));
        const request = new Request('https://example.test/api/seasons');
        expect((await cached(request, undefined, build)).headers.get('X-Cache')).toBeNull();
        expect((await cached(request, undefined, build)).headers.get('X-Cache')).toBe('HIT');
        expect(build).toHaveBeenCalledTimes(1);

        const missing = vi.fn(async () => json({}, { status: 404 }));
        const other = new Request('https://example.test/api/none');
        await cached(other, undefined, missing);
        await cached(other, undefined, missing);
        expect(missing).toHaveBeenCalledTimes(2);
    });

    it('hands the cache write to waitUntil when the context has one', async () => {
        vi.stubGlobal('caches', { default: fakeCache() });
        const waitUntil = vi.fn();
        await cached(new Request('https://example.test/x'), { waitUntil }, async () => json({}));
        expect(waitUntil).toHaveBeenCalledTimes(1);
    });
});
