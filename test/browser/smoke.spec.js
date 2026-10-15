// Browser smoke: the built app loads, draws frames and logs nothing unexpected. SMOKE_URL is set by scripts/browser-smoke.sh.
import { mkdirSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const FRAME_WINDOW_MS = 5000;
const MIN_FRAMES = 30;
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
        const frames = await page.evaluate(
            (windowMs) =>
                new Promise((resolve) => {
                    let count = 0;
                    const start = performance.now();
                    const step = () => {
                        count += 1;
                        if (performance.now() - start >= windowMs) {
                            resolve(count);
                        } else {
                            globalThis.requestAnimationFrame(step);
                        }
                    };
                    globalThis.requestAnimationFrame(step);
                }),
            FRAME_WINDOW_MS,
        );
        expect(frames, `frames advanced in ${FRAME_WINDOW_MS} ms`).toBeGreaterThanOrEqual(MIN_FRAMES);
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
