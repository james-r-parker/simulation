import { describe, expect, it } from 'vitest';
import { onRequest } from '../../functions/_middleware.js';
import { json } from '../../functions/_lib/http.js';

const ISOLATED = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
};

/**
 * @param {Response} response what the next handler answers
 * @returns {Promise<Response>} the middleware's answer
 */
function through(response) {
    return onRequest({ next: async () => response });
}

/**
 * @param {Response} response the response to check
 */
function expectIsolated(response) {
    for (const [name, value] of Object.entries(ISOLATED)) {
        expect(response.headers.get(name)).toBe(value);
    }
}

describe('functions/_middleware', () => {
    it('adds both headers to a plain response and keeps its body, status and headers', async () => {
        const out = await through(new Response('hello', { status: 200, headers: { 'Content-Type': 'text/plain' } }));
        expectIsolated(out);
        expect(out.status).toBe(200);
        expect(out.headers.get('Content-Type')).toBe('text/plain');
        expect(await out.text()).toBe('hello');
    });

    it('adds them to a proxied-style response, whose headers a fetch result keeps immutable', async () => {
        const proxied = new Response('<html></html>', { headers: { 'Cache-Control': 'public, max-age=60' } });
        const out = await through(proxied);
        expectIsolated(out);
        expect(out.headers.get('Cache-Control')).toBe('public, max-age=60');
        expect(await out.text()).toBe('<html></html>');
    });

    it('replaces a differing value an upstream response already carries', async () => {
        const out = await through(new Response('x', { headers: { 'Cross-Origin-Embedder-Policy': 'unsafe-none' } }));
        expect(out.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    });

    it('adds them to an /api/ JSON response', async () => {
        const out = await through(json({ ok: true }, { cacheControl: 'public, max-age=60' }));
        expectIsolated(out);
        expect(out.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(await out.json()).toEqual({ ok: true });
    });

    it('adds them to a 404', async () => {
        const out = await through(new Response('not found', { status: 404 }));
        expectIsolated(out);
        expect(out.status).toBe(404);
    });
});
