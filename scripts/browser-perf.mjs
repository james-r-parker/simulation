// Records the legacy app's browser frame-time baseline through Playwright into bench/legacy-baseline.json.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const DEFAULT_SECONDS = 60;
const DEFAULT_OUT = 'bench/legacy-baseline.json';
const PERF_READY_TIMEOUT_MS = 30_000;

const LONG_TASK_SCRIPT = `
window.__longTasks = 0;
try {
    new PerformanceObserver((list) => { window.__longTasks += list.getEntries().length; })
        .observe({ type: 'longtask', buffered: true });
} catch (error) {
    window.__longTasks = -1;
}`;

/** @type {Record<string, 'headed' | 'allowFallback'>} */
const BOOLEAN_FLAGS = { '--headed': 'headed', '--allow-fallback': 'allowFallback' };

/**
 * Parses one `--name=value` argument into the options.
 * @param {Record<string, unknown>} options The options being built.
 * @param {string} arg The argument.
 * @returns {boolean} Whether the argument was a recognised value flag.
 */
function applyValueFlag(options, arg) {
    const [name, value] = [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)];
    if (!arg.includes('=') || value === '' || !['--seconds', '--out', '--cdp'].includes(name)) {
        return false;
    }
    if (name === '--seconds') {
        const seconds = Number(value);
        if (!Number.isFinite(seconds) || seconds <= 0) {
            throw new Error(`--seconds must be a positive number, got "${arg}"`);
        }
        options.seconds = seconds;
    } else {
        options[name.slice(2)] = value;
    }
    return true;
}

/**
 * Parses the command line.
 * @param {string[]} argv Arguments after the script name.
 * @returns {{ seconds: number, out: string, headed: boolean, allowFallback: boolean, cdp: string }} The run options.
 */
export function parseArgs(argv) {
    /** @type {{ seconds: number, out: string, headed: boolean, allowFallback: boolean, cdp: string }} */
    const options = { seconds: DEFAULT_SECONDS, out: DEFAULT_OUT, headed: false, allowFallback: false, cdp: '' };
    for (const arg of argv) {
        if (arg in BOOLEAN_FLAGS) {
            options[BOOLEAN_FLAGS[arg]] = true;
        } else if (!applyValueFlag(options, arg)) {
            throw new Error(
                `Unknown argument "${arg}"; expected --seconds=<n>, --out=<path>, --headed, --cdp=<url> or --allow-fallback`,
            );
        }
    }
    return options;
}

/**
 * Checks that a value is a finite number.
 * @param {unknown} value The value to check.
 * @param {string} name What the value is, for the error message.
 * @returns {number} The value.
 */
function requireFinite(value, name) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${name} must be a finite number, got ${JSON.stringify(value)}`);
    }
    return value;
}

/**
 * Validates a `window.__perf()` payload and builds the baseline JSON object.
 * @param {object} input The recorded run.
 * @param {any} input.perf The `window.__perf()` payload.
 * @param {number} input.longTasks Long-task count from the PerformanceObserver.
 * @param {string} input.browserVersion `browser.version()`.
 * @param {string} input.gpuAdapter The WebGPU adapter description.
 * @param {number | null} input.agentCount Agents alive at the end of the run, or null when unreachable.
 * @param {number} input.seconds Run length in seconds.
 * @param {string} input.commit Git commit sha of the measured tree.
 * @param {string} input.recordedAt ISO timestamp.
 * @returns {Record<string, unknown>} The baseline file contents.
 */
export function buildBaseline({
    perf,
    longTasks,
    browserVersion,
    gpuAdapter,
    agentCount,
    seconds,
    commit,
    recordedAt,
}) {
    if (!perf || perf.app !== 'legacy') {
        throw new Error(`window.__perf().app must be "legacy", got ${JSON.stringify(perf?.app)}`);
    }
    const frameMs = perf.frameMs ?? {};
    const p50 = requireFinite(frameMs.p50, 'frameMs.p50');
    const p95 = requireFinite(frameMs.p95, 'frameMs.p95');
    const p99 = requireFinite(frameMs.p99, 'frameMs.p99');
    const frames = requireFinite(perf.frames, 'frames');
    return {
        metrics: {
            'browser.frame_p50_ms': p50,
            'browser.frame_p95_ms': p95,
            'browser.frame_p99_ms': p99,
            'browser.main_long_tasks': requireFinite(longTasks, 'longTasks'),
        },
        frames,
        phases: perf.phases ?? null,
        browser: browserVersion,
        gpuAdapter,
        agentCount,
        seconds,
        commit,
        recordedAt,
    };
}

/**
 * Describes the WebGPU adapter as one line, refusing a software fallback adapter unless allowed.
 * @param {{ vendor: string, architecture: string, description: string, fallback: boolean } | null} adapter Adapter fields.
 * @param {boolean} allowFallback Accept a software adapter such as SwiftShader.
 * @returns {string} Vendor, architecture and description, with "(fallback)" for a software adapter.
 */
export function describeAdapter(adapter, allowFallback) {
    if (adapter === null) {
        throw new Error('No WebGPU adapter available in this Chromium. Re-run with --headed to use a visible browser.');
    }
    const name = [adapter.vendor, adapter.architecture, adapter.description].filter(Boolean).join(' / ') || 'unknown';
    if (adapter.fallback && !allowFallback) {
        throw new Error(
            `WebGPU adapter "${name}" is a software fallback, not the GPU; pass --allow-fallback to record it anyway.`,
        );
    }
    return adapter.fallback ? `${name} (fallback)` : name;
}

/**
 * Starts the Vite dev server on a free port.
 * @returns {Promise<{ server: import('vite').ViteDevServer, url: string }>} The server and its URL.
 */
async function startServer() {
    const server = await createServer({
        server: { host: '127.0.0.1', port: 0, open: false, strictPort: false },
        logLevel: 'error',
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') {
        throw new Error('Vite dev server did not report a port');
    }
    return { server, url: `http://127.0.0.1:${address.port}/` };
}

/**
 * Loads the app and measures it for the run length.
 * @param {import('@playwright/test').Browser} browser The launched browser.
 * @param {string} url The app URL.
 * @param {number} seconds Run length.
 * @param {boolean} allowFallback Accept a software WebGPU adapter.
 * @returns {Promise<{ perf: any, longTasks: number, gpuAdapter: string, agentCount: number | null }>} Raw readings.
 */
async function measure(browser, url, seconds, allowFallback) {
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
 * Connects to a running Chrome over CDP, or launches Playwright's Chromium.
 * @param {{ headed: boolean, cdp: string }} options Parsed options.
 * @returns {Promise<import('@playwright/test').Browser>} The browser.
 */
function openBrowser(options) {
    if (options.cdp) {
        return chromium.connectOverCDP(options.cdp);
    }
    return chromium.launch({ headless: !options.headed, args: ['--enable-unsafe-webgpu'] });
}

/**
 * Runs the whole measurement and writes the baseline file.
 * @param {{ seconds: number, out: string, headed: boolean, allowFallback: boolean, cdp: string }} options Parsed options.
 * @returns {Promise<void>}
 */
async function run(options) {
    const { server, url } = await startServer();
    /** @type {import('@playwright/test').Browser | null} */
    let browser = null;
    try {
        browser = await openBrowser(options);
        const mode = options.cdp ? `over CDP at ${options.cdp}` : options.headed ? 'headed' : 'headless';
        console.log(`Measuring ${url} for ${options.seconds} s (${mode})`);
        const readings = await measure(browser, url, options.seconds, options.allowFallback);
        const baseline = buildBaseline({
            ...readings,
            browserVersion: browser.version(),
            seconds: options.seconds,
            commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
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
    } finally {
        await browser?.close();
        await server.close();
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        await run(parseArgs(process.argv.slice(2)));
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}
