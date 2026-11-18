// Browser smoke: the built app loads, draws frames and logs nothing unexpected. SMOKE_URL is set by scripts/browser-smoke.sh.
import { mkdirSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { SMOKE_FRAME_BAR, sampleFramesAfterStartup } from '../../scripts/browser-frame-measurement.mjs';

const { minFrames: MIN_FRAMES, windowMs: FRAME_WINDOW_MS, startupTimeoutMs: STARTUP_TIMEOUT_MS } = SMOKE_FRAME_BAR;
const SCREENSHOT = '.checklogs/browser-smoke.png';

const allowlist = JSON.parse(readFileSync(new URL('./known-console-errors.json', import.meta.url), 'utf8'));
/** @type {RegExp[]} */
const knownErrors = allowlist.patterns.map((/** @type {string} */ pattern) => new RegExp(pattern));

test('the app loads, animates and logs no unexpected errors', async ({ page }) => {
    const url = process.env.SMOKE_URL;
    if (!url) {
        throw new Error('SMOKE_URL is not set: run scripts/browser-smoke.sh');
    }
    /** @type {string[]} */
    const pageErrors = [];
    /** @type {string[]} */
    const unexpected = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error' && !knownErrors.some((known) => known.test(message.text()))) {
            unexpected.push(message.text());
        }
    });

    try {
        await page.goto(url);
        await expect(page.locator('#canvas-container canvas').first()).toBeAttached();
        const startingTick = await page.evaluate(() => globalThis.__blob?.tick ?? 0);
        const sample = await sampleFramesAfterStartup({
            readFrames: () => page.evaluate(() => globalThis.__blob?.frames ?? 0),
            resetFrames: () => page.evaluate(() => globalThis.__blob?.resetFrames()),
            now: () => performance.now(),
            wait: () => new Promise((resolve) => setTimeout(resolve, 50)),
            ...SMOKE_FRAME_BAR,
        });
        expect(sample.ready, `the app recorded a frame within ${STARTUP_TIMEOUT_MS} ms`).toBe(true);
        expect(sample.frames, `app frames recorded in ${FRAME_WINDOW_MS} ms`).toBeGreaterThanOrEqual(MIN_FRAMES);
        await expect.poll(() => page.evaluate(() => globalThis.__blob?.tick ?? 0)).toBeGreaterThan(startingTick);
        expect(pageErrors, 'uncaught page errors').toEqual([]);
        expect(unexpected, 'console.error messages not in known-console-errors.json').toEqual([]);
    } catch (error) {
        mkdirSync('.checklogs', { recursive: true });
        await page.screenshot({ path: SCREENSHOT });
        console.error(`browser-smoke: screenshot saved to ${SCREENSHOT}`);
        for (const message of new Set([...pageErrors, ...unexpected])) {
            console.error(`browser-smoke: unexpected error: ${message}`);
        }
        throw error;
    }
});
