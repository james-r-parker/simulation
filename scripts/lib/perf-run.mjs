// Runs the browser measurements and writes the baseline files: the legacy app through its own readings, the v6 app through
// `measureV6`. Browser shells (browser-perf covers them by use), so they are excluded from the unit coverage like the other
// browser helpers; everything with logic is in browser-perf.mjs and perf-v6.mjs.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { withBrowserSession } from './browser-session.mjs';
import { measureV6 } from './perf-v6-run.mjs';
import { formatReport, mergeBaseline } from './perf-v6.mjs';

const PERF_READY_TIMEOUT_MS = 30_000;

const LONG_TASK_SCRIPT = `
window.__longTasks = 0;
try {
    new PerformanceObserver((list) => { window.__longTasks += list.getEntries().length; })
        .observe({ type: 'longtask', buffered: true });
} catch (error) {
    window.__longTasks = -1;
}`;

/**
 * Loads the app and measures it for the run length.
 * @param {import('@playwright/test').Browser} browser The launched browser.
 * @param {string} url The app URL.
 * @param {number} seconds Run length.
 * @param {{allowFallback: boolean, describeAdapter: (adapter: any, allowFallback: boolean) => string}} legacy Accept a software
 *   WebGPU adapter, and how to describe the adapter.
 * @returns {Promise<{ perf: any, longTasks: number, gpuAdapter: string, agentCount: number | null }>} Raw readings.
 */
async function measure(browser, url, seconds, { allowFallback, describeAdapter }) {
    const page = await browser.newPage();
    await page.addInitScript(LONG_TASK_SCRIPT);
    await page.goto(url);
    const adapter = await page.evaluate(async () => {
        const found = await /** @type {any} */ (navigator).gpu?.requestAdapter({ powerPreference: 'high-performance' });
        if (!found) {
            return null;
        }
        const info = found.info ?? {};
        const fallback = Boolean(found.isFallbackAdapter ?? info.isFallbackAdapter);
        return { vendor: info.vendor, architecture: info.architecture, description: info.description, fallback };
    });
    const gpuAdapter = describeAdapter(adapter, allowFallback);
    await page.waitForFunction(() => typeof (/** @type {any} */ (globalThis).__perf) === 'function', null, {
        timeout: PERF_READY_TIMEOUT_MS,
    });
    await page.waitForTimeout(seconds * 1000);
    const readings = await page.evaluate(() => {
        const w = /** @type {any} */ (globalThis);
        return {
            perf: w.__perf(),
            longTasks: w.__longTasks,
            agentCount: w.currentSimulation?.agents?.length ?? null,
        };
    });
    return { ...readings, gpuAdapter };
}

/**
 * Measures the legacy app and writes its baseline file.
 * @param {import('../browser-perf.mjs').Options} options Parsed options.
 * @param {{buildBaseline: (input: any) => Record<string, any>, describeAdapter: (adapter: any, allowFallback: boolean) => string}} parts
 *   the baseline builder and adapter describer from browser-perf.mjs
 * @returns {Promise<void>}
 */
export function runLegacy(options, { buildBaseline, describeAdapter }) {
    return withBrowserSession({ ...options, args: ['--enable-unsafe-webgpu'] }, async ({ browser, url }) => {
        const mode = options.cdp ? `over CDP at ${options.cdp}` : options.headed ? 'headed' : 'headless';
        console.log(`Measuring ${url} for ${options.seconds} s (${mode})`);
        const readings = await measure(browser, url, options.seconds, {
            allowFallback: options.allowFallback,
            describeAdapter,
        });
        const baseline = buildBaseline({
            ...readings,
            browserVersion: browser.version(),
            seconds: options.seconds,
            commit: gitCommit(),
            recordedAt: new Date().toISOString(),
        });
        const outPath = resolve(options.out);
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, `${JSON.stringify(baseline, null, 2)}\n`);
        console.log(`GPU adapter: ${baseline.gpuAdapter}`);
        console.log(`Run length: ${options.seconds} s, frames: ${baseline.frames}, agents: ${baseline.agentCount}`);
        for (const [name, value] of Object.entries(/** @type {Record<string, number>} */ (baseline.metrics))) {
            console.log(`${name}: ${value}`);
        }
        console.log(`Wrote ${outPath}`);
    });
}

/**
 * @returns {string} the sha of the measured tree
 */
function gitCommit() {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

/**
 * Measures the v6 app and merges its entry into the baseline file under its viewport.
 * @param {import('../browser-perf.mjs').Options} options Parsed options.
 * @returns {Promise<void>}
 */
export function runV6(options) {
    return withBrowserSession({ ...options, args: ['--ignore-gpu-blocklist'] }, async ({ browser, url }) => {
        const { width, height } = options.viewport;
        console.log(`Measuring ${url} at ${width}x${height}, ${options.agents} agents, for ${options.seconds} s`);
        const result = await measureV6(browser, { ...options, url, commit: gitCommit() });
        for (const line of formatReport(result)) {
            console.log(line);
        }
        const outPath = resolve(options.out);
        const existing = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : null;
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, `${JSON.stringify(mergeBaseline(existing, result.viewport, result.entry), null, 2)}\n`);
        console.log(`Wrote ${outPath}`);
    });
}
