// Cross-origin isolation for every Functions response (docs/designs/pack-worker.md, "Isolation"). Static files get the
// same two headers from `public/_headers`; the Functions (`/v/`, `/s/`, `/next/`, `/api/*` and every 404) set them here.

/** The headers that make the page cross-origin isolated, so `SharedArrayBuffer` exists. */
export const ISOLATION_HEADERS = Object.freeze({
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
});

/**
 * @param {{next: () => Promise<Response>}} context the Pages Functions context
 * @returns {Promise<Response>} the downstream response with both isolation headers, on a mutable copy
 */
export async function onRequest(context) {
    const response = await context.next();
    const copy = new Response(response.body, response);
    for (const [name, value] of Object.entries(ISOLATION_HEADERS)) {
        copy.headers.set(name, value);
    }
    return copy;
}
