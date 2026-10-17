// Records a browser frame-time baseline through Playwright or a Chrome over CDP: the v6 app into
// bench/browser-baseline.json (keyed by viewport) or, with --app legacy, the legacy app into bench/legacy-baseline.json.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withBrowserSession } from './lib/browser-session.mjs';
import { measureV6 } from './lib/perf-v6-run.mjs';
import { mergeBaseline, overBudget, parseViewport } from './lib/perf-v6.mjs';

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

const DEFAULT_AGENTS = 500;
const DEFAULT_VIEWPORT = '3840x2160';
const DEFAULT_OUTS = { v6: 'bench/browser-baseline.json', legacy: DEFAULT_OUT };

/** @type {Record<string, 'headed' | 'allowFallback' | 'allowLowRefresh'>} */
const BOOLEAN_FLAGS = {
    '--headed': 'headed',
    '--allow-fallback': 'allowFallback',
    '--allow-low-refresh': 'allowLowRefresh',
};

/**
 * @param {string} arg a `--name=value` argument
 * @param {string} name its flag name
 * @param {string} value its value
 * @returns {number} the value as a positive integer
 * @throws {Error} when it is not one
 */
function positiveInt(arg, name, value) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`${name} must be a positive integer, got "${arg}"`);
    }
    return n;
}

/**
 * How each value flag turns its text into an option.
 * @type {Record<string, (arg: string, value: string) => Record<string, unknown>>}
 */
const PARSERS = {
    '--seconds': (arg, value) => {
        const seconds = Number(value);
        if (!Number.isFinite(seconds) || seconds <= 0) {
            throw new Error(`--seconds must be a positive number, got "${arg}"`);
        }
        return { seconds };
    },
    '--agents': (arg, value) => ({ agents: positiveInt(arg, '--agents', value) }),
    '--app': (arg, value) => {
        if (value !== 'v6' && value !== 'legacy') {
            throw new Error(`--app must be v6 or legacy, got "${arg}"`);
        }
        return { app: value };
    },
    '--viewport': (_arg, value) => ({ viewport: parseViewport(value) }),
    '--out': (_arg, value) => ({ out: value }),
    '--cdp': (_arg, value) => ({ cdp: value }),
};

/**
 * Parses one `--name=value` argument into the options.
 * @param {Record<string, any>} options The options being built.
 * @param {string} arg The argument.
 * @returns {boolean} Whether the argument was a recognised value flag.
 */
function applyValueFlag(options, arg) {
    const [name, value] = [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)];
    if (!arg.includes('=') || value === '' || !Object.hasOwn(PARSERS, name)) {
        return false;
    }
    Object.assign(options, PARSERS[name](arg, value));
    return true;
}

/**
 * @typedef {object} Options
 * @property {number} seconds run length
 * @property {string} out the baseline file
 * @property {boolean} headed use a visible browser
 * @property {boolean} allowFallback accept a software adapter or renderer
 * @property {boolean} allowLowRefresh record a display under 120 Hz
 * @property {string} cdp a Chrome DevTools endpoint to measure instead of launching one
 * @property {'v6' | 'legacy'} app which app to measure
 * @property {number} agents v6: the starting agent count
 * @property {{width: number, height: number}} viewport v6: the canvas size
 */

/**
 * Parses the command line.
 * @param {string[]} argv Arguments after the script name.
 * @returns {Options} The run options; `out` defaults to the app's baseline file.
 */
export function parseArgs(argv) {
    /** @type {Record<string, any>} */
    const options = {
        seconds: DEFAULT_SECONDS,
        out: '',
        headed: false,
        allowFallback: false,
        allowLowRefresh: false,
        cdp: '',
        app: 'v6',
        agents: DEFAULT_AGENTS,
        viewport: parseViewport(DEFAULT_VIEWPORT),
    };
    for (const arg of argv) {
        if (arg in BOOLEAN_FLAGS) {
            options[BOOLEAN_FLAGS[arg]] = true;
        } else if (!applyValueFlag(options, arg)) {
            throw new Error(
                `Unknown argument "${arg}"; expected ${Object.keys(PARSERS)
                    .map((f) => `${f}=<v>`)
                    .join(', ')}, ${Object.keys(BOOLEAN_FLAGS).join(', ')}`,
            );
        }
    }
    options.out ||= DEFAULT_OUTS[/** @type {'v6' | 'legacy'} */ (options.app)];
    return /** @type {Options} */ (options);
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
 * Measures the legacy app and writes its baseline file.
 * @param {Options} options Parsed options.
 * @returns {Promise<void>}
 */
function runLegacy(options) {
    return withBrowserSession({ ...options, args: ['--enable-unsafe-webgpu'] }, async ({ browser, url }) => {
        const mode = options.cdp ? `over CDP at ${options.cdp}` : options.headed ? 'headed' : 'headless';
        console.log(`Measuring ${url} for ${options.seconds} s (${mode})`);
        const readings = await measure(browser, url, options.seconds, options.allowFallback);
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
 * Prints a v6 entry's metrics against the budgets.
 * @param {{viewport: string, entry: Record<string, any>}} result the measured entry
 * @returns {void}
 */
function reportV6({ viewport, entry }) {
    console.log(
        `Viewport ${viewport}: ${entry.frames} frames, ${entry.agents} agents, ${entry.refreshHz} Hz, ${entry.gpuAdapter}`,
    );
    for (const [name, value] of Object.entries(entry.metrics)) {
        console.log(`${name}: ${value}`);
    }
    const over = overBudget(entry.metrics);
    for (const { metric, value, max, criterion } of over) {
        console.log(`${criterion ? 'OVER BUDGET' : 'over (reported only)'}: ${metric} ${value} > ${max}`);
    }
    console.log(over.some((o) => o.criterion) ? 'Budgets: not met' : 'Budgets: met');
}

/**
 * Measures the v6 app and merges its entry into the baseline file under its viewport.
 * @param {Options} options Parsed options.
 * @returns {Promise<void>}
 */
function runV6(options) {
    return withBrowserSession({ ...options, args: ['--ignore-gpu-blocklist'] }, async ({ browser, url }) => {
        const { width, height } = options.viewport;
        console.log(`Measuring ${url} at ${width}x${height}, ${options.agents} agents, for ${options.seconds} s`);
        const result = await measureV6(browser, { ...options, url, commit: gitCommit() });
        reportV6(result);
        const outPath = resolve(options.out);
        const existing = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : null;
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, `${JSON.stringify(mergeBaseline(existing, result.viewport, result.entry), null, 2)}\n`);
        console.log(`Wrote ${outPath}`);
    });
}

/**
 * Runs the whole measurement and writes the baseline file.
 * @param {Options} options Parsed options.
 * @returns {Promise<void>}
 */
function run(options) {
    return options.app === 'legacy' ? runLegacy(options) : runV6(options);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        await run(parseArgs(process.argv.slice(2)));
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}
