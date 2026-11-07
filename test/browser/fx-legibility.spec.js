// Legibility check for the effect recipes (docs/designs/renderer-event-effects.md): `?fxdemo=all&fxhold=10` pauses the
// world and holds every recipe ten ticks into its life, each in its own cell. The same page with the effect look items
// off is the reference; every cell must be visibly brighter with the effects on. Runs in the browser smoke under
// software GL; SMOKE_URL is set by scripts/browser-smoke.sh.
import { test, expect } from '@playwright/test';

/** Every look item that is not an effect family: the reference frame keeps the scenery and drops the effects. */
const SCENERY = 'rocks,aurora,terrain,motion,threads,decay,finish,flora,herds,chase';
/** Recipes drawn by the herds and flora items, which the reference keeps on. */
const SCENERY_RECIPES = new Set(['stampede', 'pollinated']);
const DEMO = '?seed=3&agents=60&quality=0&scale=0.5&fxdemo=all&fxhold=10';
/** The least mean luminance (0 to 1) a cell must gain with its effect on. */
const MIN_GAIN = 0.004;

/** @returns {string} the app URL */
function appUrl() {
    const url = process.env.SMOKE_URL;
    if (!url) {
        throw new Error('SMOKE_URL is not set: run scripts/browser-smoke.sh');
    }
    return url;
}

/**
 * @param {import('@playwright/test').Page} page the page
 * @param {string} query the query string
 * @returns {Promise<{png: string, cells: {name: string, x: number, y: number, size: number}[]}>} the canvas as base64
 *   PNG and the demo cells in CSS px
 */
async function capture(page, query) {
    await page.goto(appUrl() + query);
    await expect
        .poll(() => page.evaluate(() => /** @type {any} */ (globalThis).__fxdemo?.cells?.length ?? 0), {
            timeout: 30_000,
        })
        .toBeGreaterThan(0);
    await page.waitForTimeout(2000);
    const png = (await page.locator('#canvas-container canvas').screenshot()).toString('base64');
    const cells = await page.evaluate(() => /** @type {any} */ (globalThis).__fxdemo.cells);
    return { png, cells };
}

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        globalThis.localStorage.setItem('blobEvolution.prefs.v1', JSON.stringify({ seen: true }));
    });
});

test('every effect recipe brightens its demo cell against the same frame with the effects off', async ({ page }) => {
    const on = await capture(page, DEMO);
    const off = await capture(page, `${DEMO}&look=${SCENERY}`);
    const gains = await page.evaluate(
        async ({ a, b, cells }) => {
            const g = /** @type {any} */ (globalThis);
            /** @param {string} b64 a PNG @returns {Promise<any>} its pixels */
            const pixels = async (b64) => {
                const bitmap = await g.createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
                const canvas = new g.OffscreenCanvas(bitmap.width, bitmap.height);
                const ctx = /** @type {any} */ (canvas.getContext('2d'));
                ctx.drawImage(bitmap, 0, 0);
                return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
            };
            const [pa, pb] = [await pixels(a), await pixels(b)];
            const mean = (/** @type {any} */ img, /** @type {any} */ c) => {
                let sum = 0;
                let n = 0;
                const half = c.size / 2;
                for (let y = Math.max(0, Math.round(c.y - half)); y < Math.min(img.height, c.y + half); y++) {
                    for (let x = Math.max(0, Math.round(c.x - half)); x < Math.min(img.width, c.x + half); x++) {
                        const i = (y * img.width + x) * 4;
                        sum += (0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2]) / 255;
                        n += 1;
                    }
                }
                return n === 0 ? Number.NaN : sum / n;
            };
            return cells.map((/** @type {any} */ c) => ({ name: c.name, gain: mean(pa, c) - mean(pb, c) }));
        },
        { a: on.png, b: off.png, cells: on.cells },
    );
    expect(gains.length).toBeGreaterThan(30);
    for (const { name, gain } of gains) {
        if (!SCENERY_RECIPES.has(name)) {
            expect(gain, `${name} gains luminance with its effect on`).toBeGreaterThan(MIN_GAIN);
        }
    }
});
