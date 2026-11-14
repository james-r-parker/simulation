// Legibility check for the effect recipes (docs/designs/renderer-event-effects.md): `?fxdemo=all&fxhold=peak` pauses the
// world and holds every recipe at its brightest keyframe, each in its own cell. The same page with the effect look items
// off is the reference; in every cell enough pixels must brighten with the effects on to be seen. Runs in the browser smoke under
// software GL; SMOKE_URL is set by scripts/browser-smoke.sh.
import { test, expect } from '@playwright/test';

/** Every look item that is not an effect family: the reference frame keeps the scenery and drops the effects. */
/** Recipes of the herds and flora families: their look items stay on in the reference, so their unit tests cover them. */
const SCENERY_RECIPES = new Set(['stampede', 'pollinated', 'herdDied', 'calfBorn', 'dungDropped', 'patchWilted']);
const DEMO = '?seed=3&agents=60&fxdemo=all&fxhold=peak';
/** A pixel counts as lit by an effect when its luminance (0 to 1) rises by more than this. */
const LIT_STEP = 0.08;
/** The fewest lit pixels a cell needs for its effect to be visible. */
const MIN_LIT = 12;

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
        .poll(() => page.evaluate(() => /** @type {any} */ (globalThis).__fxdemo?.frozen ?? false), { timeout: 30_000 })
        .toBe(true);
    await page.waitForTimeout(500);
    const png = (await page.locator('#canvas-container canvas').screenshot()).toString('base64');
    const cells = await page.evaluate(() => /** @type {any} */ (globalThis).__fxdemo.cells);
    return { png, cells };
}

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        globalThis.localStorage.setItem('blobEvolution.prefs.v1', JSON.stringify({ seen: true }));
    });
});

test('every effect recipe lights pixels in its demo cell against the same frame with the effects off', async ({
    page,
}) => {
    const on = await capture(page, DEMO);
    const off = await capture(page, `${DEMO}&fxoff=1`);
    const gains = await page.evaluate(
        async ({ a, b, cells, step }) => {
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
            const luma = (/** @type {any} */ img, /** @type {number} */ i) =>
                (0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2]) / 255;
            const lit = (/** @type {any} */ c) => {
                let n = 0;
                const half = c.size / 2;
                const x0 = Math.max(0, Math.round(c.x - half));
                const x1 = Math.min(pa.width, c.x + half);
                for (let y = Math.max(0, Math.round(c.y - half)); y < Math.min(pa.height, c.y + half); y++) {
                    for (let x = x0; x < x1; x++) {
                        const i = (y * pa.width + x) * 4;
                        n += luma(pa, i) - luma(pb, i) > step ? 1 : 0;
                    }
                }
                return x1 <= x0 ? Number.NaN : n;
            };
            return cells.map((/** @type {any} */ c) => ({ name: c.name, lit: lit(c) }));
        },
        { a: on.png, b: off.png, cells: on.cells, step: LIT_STEP },
    );
    console.log(`fx legibility, lit pixels per cell: ${gains.map((g) => `${g.name} ${g.lit}`).join(', ')}`);
    expect(gains.length).toBeGreaterThan(30);
    for (const { name, lit } of gains) {
        if (!SCENERY_RECIPES.has(name)) {
            expect(lit, `${name}: pixels lit by its effect`).toBeGreaterThanOrEqual(MIN_LIT);
        }
    }
});
