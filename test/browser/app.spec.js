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
const TICK = '.help-tick';
const SPEED = '#top-bar .top-bar-speed';
const STATUS = '#top-bar .top-bar-status';

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

test.beforeEach(async ({ page }) => {
    // A returning visitor: no title card, and the speed is x1 as the flows below expect.
    await page.addInitScript(() => {
        if (!globalThis.localStorage.getItem('blobEvolution.prefs.v1')) {
            globalThis.localStorage.setItem('blobEvolution.prefs.v1', JSON.stringify({ seen: true }));
        }
    });
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
    await expect(page.locator(STATUS)).toHaveText(/blobs and (growing|shrinking|steady)/);
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
    await expect(page.locator('.toast')).toHaveText(/again/);
    // The seed field shows the seed of the worker's last `ready`, so it changes only when the worker has started the
    // new world. A falling tick is no signal: the new world can pass the old tick between two HUD refreshes.
    const seedField = page.locator('.control-seed');
    await expect(seedField).toHaveValue('3');
    await page.keyboard.press('KeyN');
    await expect(seedField).not.toHaveValue('3', { timeout: 30_000 });
    await expect(seedField).toHaveValue(/^\d+$/);
    await worldRunning(page);
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

test('the top bar shows the status, the calendar with the generation, the counts by type and the born share', async ({
    page,
}) => {
    await page.goto(appUrl() + WORLD);
    await worldRunning(page);
    await expect(page.locator(STATUS)).toHaveText(/^(Spring|Summer|Autumn|Winter), year \d+: \d+ blobs and /);
    await expect(page.locator('#top-bar .top-bar-seasonBox')).toHaveText(/^Year \d+, \w+, Gen \d+$/);
    await expect(page.locator('#top-bar .top-bar-type')).toHaveCount(5);
    await expect(page.locator('#top-bar .top-bar-born')).toHaveText(/^born /);
    await expect(page.locator('.help-elapsed')).toHaveText(/^\d+:\d\d/);
});

test('a first visit shows the title card at x2 and any key dismisses it for good', async ({ page }) => {
    await page.addInitScript(() => globalThis.localStorage.removeItem('blobEvolution.prefs.v1'));
    await page.goto(appUrl() + '?seed=3&agents=100&quality=2');
    await expect(page.locator('.title-card')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.title-card .legend-item')).toHaveCount(5);
    await expect(page.locator(SPEED)).toHaveText(/^x2/);
    await page.keyboard.press('KeyZ');
    await expect(page.locator('.title-card')).toBeHidden();
    const seen = await page.evaluate(() => JSON.parse(localStorage.getItem('blobEvolution.prefs.v1') ?? '{}').seen);
    expect(seen).toBe(true);
});

test('the help drawer shows the legend, the HUD size and the family colour buttons', async ({ page }) => {
    await page.goto(appUrl() + WORLD);
    await worldRunning(page);
    await page.keyboard.press('Shift+Slash');
    await expect(page.locator('.drawer-help .legend-item')).toHaveCount(5);
    await page.locator('.drawer-help .help-size', { hasText: 'cvd safe' }).click();
    const palette = () =>
        page.evaluate(() => JSON.parse(localStorage.getItem('blobEvolution.prefs.v1') ?? '{}').palette);
    await expect.poll(palette).toBe('cvd-safe');
    await page.locator('.drawer-help .help-size', { hasText: '2x' }).click();
    await expect.poll(() => page.evaluate(() => globalThis.document.documentElement.style.fontSize)).toBe('32px');
});

test('C, I and ? open one drawer each, Escape closes it', async ({ page }) => {
    await page.goto(appUrl() + WORLD);
    await worldRunning(page);
    const open = page.locator('.drawer.open');
    await page.keyboard.press('KeyC');
    await expect(open).toHaveCount(1);
    await expect(page.locator('.drawer-charts.open')).toBeAttached();
    await expect(page.locator('.drawer-charts .uplot')).toHaveCount(5, { timeout: 20_000 });
    await page.keyboard.press('KeyI');
    await expect(page.locator('.drawer-inspector.open')).toBeAttached();
    await expect(open).toHaveCount(1);
    await expect(page.locator('.drawer-charts .uplot')).toHaveCount(0);
    await page.keyboard.press('Shift+Slash');
    await expect(page.locator('.drawer-help.open')).toBeAttached();
    await expect(page.locator('.help-keys dt').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(open).toHaveCount(0);
    await page.keyboard.press('F1');
    await expect(page.locator('.drawer-help.open')).toBeAttached();
    await page.keyboard.press('Escape');
    await expect(open).toHaveCount(0);
});

test('keys 1 to 4 toggle the lenses and the choice is remembered', async ({ page }) => {
    await page.goto(appUrl() + WORLD);
    await worldRunning(page);
    for (const key of ['Digit1', 'Digit2', 'Digit3', 'Digit4']) {
        await page.keyboard.press(key);
    }
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('blobEvolution.prefs.v1') ?? '{}').lenses);
    await expect.poll(stored).toEqual([true, true, true, true]);
    await page.keyboard.press('Digit2');
    await expect.poll(stored).toEqual([true, false, true, true]);
    const before = await tickOf(page);
    await expect.poll(() => tickOf(page), { timeout: 20_000 }).toBeGreaterThan(before);
    await page.reload();
    await worldRunning(page);
    expect(await stored()).toEqual([true, false, true, true]);
});

test('H hides and shows the HUD, Shift+N focuses the seed field', async ({ page }) => {
    await page.goto(appUrl() + WORLD);
    await worldRunning(page);
    await page.keyboard.press('KeyH');
    await expect(page.locator('#top-bar')).toBeHidden();
    await page.keyboard.press('KeyH');
    await expect(page.locator('#top-bar')).toBeVisible();
    await page.keyboard.press('Shift+KeyN');
    await expect(page.locator('.control-seed')).toBeFocused();
    await expect(page.locator('.control-seed')).toHaveValue('3');
    await page.locator('.control-seed').fill('11');
    await page.keyboard.press('Enter');
    await expect.poll(() => page.locator('.control-seed').inputValue(), { timeout: 30_000 }).toBe('11');
});

test('E and B download the archive and the debug bundle, Shift+F does not break the loop', async ({ page }) => {
    await page.goto(appUrl() + WORLD);
    await worldRunning(page);
    const bundle = page.waitForEvent('download');
    await page.keyboard.press('KeyB');
    expect((await bundle).suggestedFilename()).toMatch(/^blob-debug-3-\d+\.json$/);
    const archive = page.waitForEvent('download');
    await page.keyboard.press('KeyE');
    expect((await archive).suggestedFilename()).toBe('blob-archive-3.json');
    await page.keyboard.press('Shift+KeyF');
    const before = await tickOf(page);
    await expect.poll(() => tickOf(page), { timeout: 20_000 }).toBeGreaterThan(before);
});

test('every control button has a title with its key and an aria-label', async ({ page }) => {
    await page.goto(appUrl() + WORLD);
    await worldRunning(page);
    const buttons = page.locator('#top-bar button');
    expect(await buttons.count()).toBeGreaterThan(5);
    for (const button of await buttons.all()) {
        await expect(button).toHaveAttribute('aria-label', /.+/);
        await expect(button).toHaveAttribute('title', /\(.+\)$/);
    }
    await page.locator('.control-toggleHelp').click();
    await expect(page.locator('.drawer-help.open')).toBeAttached();
});
