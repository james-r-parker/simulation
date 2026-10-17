// Records a browser frame-time baseline through Playwright or a Chrome over CDP: the v6 app into
// bench/browser-baseline.json (keyed by viewport) or, with --app legacy, the legacy app into bench/legacy-baseline.json.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLegacy, runV6 } from './lib/perf-run.mjs';
import { parseViewport } from './lib/perf-v6.mjs';

const DEFAULT_SECONDS = 60;
const DEFAULT_OUT = 'bench/legacy-baseline.json';

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
 * Runs the whole measurement and writes the baseline file.
 * @param {Options} options Parsed options.
 * @returns {Promise<void>}
 */
function run(options) {
    return options.app === 'legacy' ? runLegacy(options, { buildBaseline, describeAdapter }) : runV6(options);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        await run(parseArgs(process.argv.slice(2)));
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}
