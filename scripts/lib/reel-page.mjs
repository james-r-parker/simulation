// The browser half of `npm run reel`: runs the app at x8 until the world reaches the ticks, pauses it so the clip in
// flight finishes, and reads every clip's bytes out of the page. A browser shell (test/browser/reel.spec.js and
// `npm run reel` cover it by use), so it is not unit tested; everything with logic is in `reel-files.mjs`.

/* v8 ignore start -- drives Chromium; covered by test/browser/reel.spec.js, not by unit tests */

/** How long a clip may take after the pause: 4 s of frames after the moment, with margin for a slow software path. */
const CLIP_WAIT_MS = 30_000;
const POLL_MS = 100;

/**
 * @typedef {object} PageReel
 * @property {number} tick the tick the world reached
 * @property {boolean} recording whether the page's recorder ran (false: the browser cannot record)
 * @property {{scene: string, tick: number, score: number, genomeId: number, name: string, base64: string}[]} clips the
 *   best clip of each scene seen, with its bytes
 */

/**
 * @param {import('@playwright/test').Page} page a page
 * @param {string} test an expression run in the page; true ends the wait
 * @param {number} timeout ms
 * @returns {Promise<unknown>} resolves when the test holds, rejects on the timeout
 */
function until(page, test, timeout) {
    return page.waitForFunction(test, undefined, { timeout, polling: POLL_MS });
}

/**
 * @param {import('@playwright/test').Page} page a page that has opened the reel URL
 * @param {{ticks: number, timeoutMs: number}} options the tick to run to and how long to wait for it
 * @returns {Promise<PageReel>} what the page's reel held once the world paused and its clip in flight finished
 */
export async function collectReel(page, { ticks, timeoutMs }) {
    await until(page, `globalThis.__blob && globalThis.__blob.tick >= ${ticks}`, timeoutMs);
    await page.keyboard.press('Space');
    await until(page, 'globalThis.__reel && !globalThis.__reel.pending()', CLIP_WAIT_MS);
    return page.evaluate(async () => {
        const reel = /** @type {any} */ (globalThis).__reel;
        const clips = [];
        for (const clip of reel.clips()) {
            const bytes = new Uint8Array(await (await fetch(clip.url)).arrayBuffer());
            let binary = '';
            for (let i = 0; i < bytes.length; i += 0x8000) {
                binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            }
            clips.push({ ...clip, base64: btoa(binary) });
        }
        return { tick: /** @type {any} */ (globalThis).__blob.tick, recording: reel.recording(), clips };
    });
}
/* v8 ignore stop */
