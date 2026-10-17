// Browser spec for the v6 app: it boots, the worker reports ready, snapshots arrive, frames draw, the keys work, nothing
// is logged as an error and a lost WebGL context recovers. Runs against the production build under software GL;
// SMOKE_URL is set by scripts/browser-smoke.sh. Flows only, no budgets.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const allowlist = JSON.parse(readFileSync(new URL('./known-console-errors.json', import.meta.url), 'utf8'));
/** @type {RegExp[]} */
const knownErrors = allowlist.patterns.map((/** @type {string} */ pattern) => new RegExp(pattern));

/** A small, quick world: fixed seed, few agents, bloom off so software GL keeps up. */
const WORLD = '?seed=3&agents=100&quality=2';
const TICK = '#top-bar .top-bar-tick';
const SPEED = '#top-bar .top-bar-speed';
const POPULATION = '#top-bar .top-bar-population';

/** @type {string[]} */
let problems = [];
/** @type {string[]} */
let consoleLines = [];

/**
 * @param {import('@playwright/test').Page} page the page
 * @returns {Promise<number>} the tick the top bar shows
 */
async function tickOf(page) {
    const text = (await page.locator(TICK).textContent()) ?? '';
    return Number(text.replace(/\D/g, ''));
}

/**
 * @param {import('@playwright/test').Page} page the page
 * @returns {Promise<void>} resolves when the worker has reported a running world
 */
async function worldRunning(page) {
    await expect.poll(() => tickOf(page), { timeout: 30_000 }).toBeGreaterThan(5);
}

test.beforeEach(({ page }) => {
    problems = [];
    consoleLines = [];
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
        consoleLines.push(message.text());
        if (message.type() === 'error' && !knownErrors.some((known) => known.test(message.text()))) {
            problems.push(`console.error: ${message.text()}`);
        }
    });
});

test.afterEach(() => {
    expect(problems, 'uncaught errors and console.error messages').toEqual([]);
});

/**
 * @returns {string} the URL of the page under test
 */
function appUrl() {
    const url = process.env.SMOKE_URL;
    if (!url) {
        throw new Error('SMOKE_URL is not set: run scripts/browser-smoke.sh');
    }
    return url;
}

test('boots at the default settings: canvas, worker ready, snapshots arriving, population shown', async ({ page }) => {
    await page.goto(appUrl());
    await expect(page.locator('#canvas-container canvas')).toBeAttached();
    await worldRunning(page);
    await expect(page.locator(POPULATION)).toHaveText(/^pop [1-9]/);
    await expect(page.locator(SPEED)).toHaveText(/^x1/);
    const first = await tickOf(page);
    await expect.poll(() => tickOf(page), { timeout: 20_000 }).toBeGreaterThan(first);
});

test('draws frames: the animation loop runs and the canvas is not blank', async ({ page }) => {
    await page.goto(appUrl() + WORLD);
    await worldRunning(page);
    const frames = await page.evaluate(
        () =>
            new Promise((resolve) => {
                let count = 0;
                const start = performance.now();
                const step = () => {
                    count += 1;
                    if (performance.now() - start >= 2000) {
                        resolve(count);
                    } else {
                        globalThis.requestAnimationFrame(step);
                    }
                };
                globalThis.requestAnimationFrame(step);
            }),
    );
    expect(frames).toBeGreaterThan(5);
    const canvas = page.locator('#canvas-container canvas');
    const box = await canvas.boundingBox();
    expect(box?.width).toBeGreaterThan(100);
    const shot = await canvas.screenshot();
    expect(shot.length, 'a drawn world compresses to more than a flat black PNG').toBeGreaterThan(8000);
});

test('pause, step and speed keys drive the worker', async ({ page }) => {
    await page.goto(appUrl() + WORLD);
    await worldRunning(page);

    await page.keyboard.press('Space');
    await expect(page.locator(SPEED)).toHaveText('paused');
    const paused = await tickOf(page);
    await page.waitForTimeout(1200);
    expect(await tickOf(page), 'no ticks while paused').toBe(paused);

    await page.keyboard.press('Period');
    await expect.poll(() => tickOf(page)).toBeGreaterThan(paused);
    const stepped = await tickOf(page);
    await page.keyboard.press('Shift+Period');
    await expect.poll(() => tickOf(page)).toBeGreaterThanOrEqual(stepped + 10);

    await page.keyboard.press('Space');
    await expect(page.locator(SPEED)).toHaveText(/^x1/);
    await page.keyboard.press('BracketRight');
    await expect(page.locator(SPEED)).toHaveText(/^x2/);
    await page.keyboard.press('BracketLeft');
    await page.keyboard.press('BracketLeft');
    await expect(page.locator(SPEED)).toHaveText(/^x0\.5/);
});

test('N asks for confirmation and a second press starts a new world', async ({ page }) => {
    await page.goto(appUrl() + WORLD);
    await worldRunning(page);
    await page.keyboard.press('KeyN');
    await expect(page.locator('#top-bar .top-bar-notice')).toHaveText(/again/);
    const before = await tickOf(page);
    expect(before).toBeGreaterThan(5);
    await page.keyboard.press('KeyN');
    await expect(page.locator('#top-bar .top-bar-notice')).toHaveText('');
    await expect.poll(() => tickOf(page), { timeout: 30_000 }).toBeLessThan(before);
    await expect.poll(() => tickOf(page), { timeout: 30_000 }).toBeGreaterThan(5);
});

test('camera keys and a click do not break the loop', async ({ page }) => {
    await page.goto(appUrl() + WORLD);
    await worldRunning(page);
    for (const key of ['Equal', 'ArrowLeft', 'ArrowUp', 'Minus', 'Home']) {
        await page.keyboard.press(key);
    }
    await page.mouse.click(300, 300);
    await page.mouse.wheel(0, -200);
    const before = await tickOf(page);
    await expect.poll(() => tickOf(page), { timeout: 20_000 }).toBeGreaterThan(before);
});

test('recovers from a lost WebGL context', async ({ page }) => {
    await page.goto(appUrl() + WORLD);
    await worldRunning(page);
    await page.evaluate(() => {
        const canvas = /** @type {HTMLCanvasElement} */ (globalThis.document.querySelector('#canvas-container canvas'));
        const gl = /** @type {WebGL2RenderingContext} */ (canvas.getContext('webgl2'));
        const lose = /** @type {any} */ (gl.getExtension('WEBGL_lose_context'));
        /** @type {any} */ (globalThis).__lose = lose;
        lose.loseContext();
    });
    await expect.poll(() => consoleLines.some((line) => line.includes('ContextLost'))).toBe(true);
    await page.evaluate(() => /** @type {any} */ (globalThis).__lose.restoreContext());
    await expect.poll(() => consoleLines.some((line) => line.includes('ContextRestored'))).toBe(true);
    const before = await tickOf(page);
    await expect.poll(() => tickOf(page), { timeout: 20_000 }).toBeGreaterThan(before);
    const shot = await page.locator('#canvas-container canvas').screenshot();
    expect(shot.length, 'the world draws again after the restore').toBeGreaterThan(8000);
});
