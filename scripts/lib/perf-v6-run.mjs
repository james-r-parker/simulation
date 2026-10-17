// The browser half of the v6 perf run: loads the app at a viewport, waits out the warm-up, measures through
// `window.__perf()`, the long-task observer and a Chromium trace, and builds the baseline entry. Runs only inside a real
// browser (browser-perf covers it by use), so it is excluded from the unit coverage like the other browser helpers.

import { buildV6Entry, checkRefresh, checkRenderer, GC_TRACE_CATEGORIES, sumGcPauseMs, WARMUP_MS } from './perf-v6.mjs';

const READY_TIMEOUT_MS = 60_000;
const SEED = 1;

const LONG_TASK_SCRIPT = `
window.__longTaskTimes = [];
try {
    new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__longTaskTimes.push(entry.startTime);
    }).observe({ type: 'longtask', buffered: true });
} catch (error) {
    window.__longTaskTimes = null;
}`;

/**
 * @param {import('@playwright/test').Page} page the loaded page
 * @returns {Promise<string>} the WebGL renderer string, `unknown` when the browser hides it
 */
function webglRenderer(page) {
    return page.evaluate(() => {
        const gl = /** @type {any} */ (globalThis).document.createElement('canvas').getContext('webgl2');
        const info = gl?.getExtension('WEBGL_debug_renderer_info');
        return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
    });
}

/**
 * @param {import('@playwright/test').Browser} browser the browser
 * @param {{viewport: {width: number, height: number}, agents: number}} options the canvas size and the agent count
 * @param {string} url the app URL
 * @returns {Promise<import('@playwright/test').Page>} a page that has loaded the app and whose worker is running
 */
async function openApp(browser, { viewport, agents }, url) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await page.addInitScript(LONG_TASK_SCRIPT);
    await page.goto(`${url}?agents=${agents}&quality=0&seed=${SEED}`);
    await page.waitForFunction(
        () => {
            const w = /** @type {any} */ (globalThis);
            return typeof w.__perf === 'function' && w.__perf().ticksPerSecond > 0;
        },
        null,
        { timeout: READY_TIMEOUT_MS },
    );
    return page;
}

/**
 * Measures the app for `seconds` after a warm-up and builds its baseline entry.
 * @param {import('@playwright/test').Browser} browser the browser (Playwright's or a Chrome over CDP)
 * @param {{url: string, seconds: number, agents: number, viewport: {width: number, height: number},
 *   allowLowRefresh: boolean, allowFallback: boolean, commit: string}} options what to run and how strictly
 * @returns {Promise<{viewport: string, entry: Record<string, any>}>} the viewport key and its entry
 * @throws {Error} when the display is under 120 Hz or the renderer is software, unless the matching flag is given
 */
export async function measureV6(browser, options) {
    const page = await openApp(browser, options, options.url);
    const renderer = await webglRenderer(page);
    checkRenderer(renderer, options.allowFallback);
    await page.waitForTimeout(WARMUP_MS);
    await page.evaluate(() => /** @type {any} */ (globalThis).__perf.reset());
    await browser.startTracing(page, { categories: [...GC_TRACE_CATEGORIES] });
    await page.waitForTimeout(options.seconds * 1000);
    const trace = JSON.parse((await browser.stopTracing()).toString('utf8'));
    const { perf, longTaskTimes } = await page.evaluate(() => ({
        perf: /** @type {any} */ (globalThis).__perf(),
        longTaskTimes: /** @type {any} */ (globalThis).__longTaskTimes,
    }));
    if (longTaskTimes === null) {
        throw new Error(
            'this browser has no longtask PerformanceObserver, so browser.main_long_tasks cannot be measured',
        );
    }
    checkRefresh(perf.refreshHz, options.allowLowRefresh);
    const { width, height } = options.viewport;
    const entry = buildV6Entry({
        perf,
        longTaskTimes,
        gcPauseMs: sumGcPauseMs(trace.traceEvents ?? trace),
        run: {
            browser: browser.version(),
            gpuAdapter: renderer,
            viewport: `${width}x${height}`,
            seconds: options.seconds,
            commit: options.commit,
            recordedAt: new Date().toISOString(),
        },
    });
    await page.close();
    return { viewport: `${width}x${height}`, entry };
}
