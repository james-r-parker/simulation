// Records a browser frame-time baseline through Playwright or a Chrome over CDP: the v6 app into
// bench/browser-baseline.json (keyed by viewport).
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runV6 } from './lib/perf-run.mjs';
import { parseViewport } from './lib/perf-v6.mjs';

const DEFAULT_SECONDS = 60;

const DEFAULT_AGENTS = 500;
const DEFAULT_VIEWPORT = '3840x2160';
const DEFAULT_OUT = 'bench/browser-baseline.json';

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
        if (value !== 'v6') {
            throw new Error(`--app must be v6, got "${arg}"`);
        }
        return { app: value };
    },
    '--viewport': (_arg, value) => ({ viewport: parseViewport(value) }),
    '--out': (_arg, value) => ({ out: value }),
    '--cdp': (_arg, value) => ({ cdp: value }),
    '--look': (_arg, value) => ({ look: value }),
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
 * @property {'v6'} app which app to measure
 * @property {number} agents v6: the starting agent count
 * @property {{width: number, height: number}} viewport v6: the canvas size
 * @property {string} look v6: the ?look= parameter
 */

/**
 * Parses the command line.
 * @param {string[]} argv Arguments after the script name.
 * @returns {Options} The run options; `out` defaults to the browser baseline file.
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
        look: '',
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg in BOOLEAN_FLAGS) {
            options[BOOLEAN_FLAGS[arg]] = true;
        } else if (arg.includes('=')) {
            if (!applyValueFlag(options, arg)) {
                throw new Error(
                    `Unknown argument "${arg}"; expected ${Object.keys(PARSERS)
                        .map((f) => `${f}=<v>`)
                        .join(', ')}, ${Object.keys(BOOLEAN_FLAGS).join(', ')}`,
                );
            }
        } else if (arg in PARSERS) {
            const next = argv[++i];
            if (next === undefined || next.startsWith('--')) {
                throw new Error(`${arg} requires a value`);
            }
            Object.assign(options, PARSERS[arg](`${arg}=${next}`, next));
        } else {
            throw new Error(
                `Unknown argument "${arg}"; expected ${Object.keys(PARSERS)
                    .map((f) => `${f}=<v>`)
                    .join(', ')}, ${Object.keys(BOOLEAN_FLAGS).join(', ')}`,
            );
        }
    }
    options.out ||= DEFAULT_OUT;
    return /** @type {Options} */ (options);
}

/**
 * Runs the whole measurement and writes the baseline file.
 * @param {Options} options Parsed options.
 * @returns {Promise<void>}
 */
function run(options) {
    return runV6(options);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        await run(parseArgs(process.argv.slice(2)));
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}
