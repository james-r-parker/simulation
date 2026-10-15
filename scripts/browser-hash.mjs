// Runs every golden case in a Chromium Web Worker and checks the world hashes against test/sim/golden.json.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withBrowserSession } from './lib/browser-session.mjs';

const GOLDEN_PATH = new URL('../test/sim/golden.json', import.meta.url);
const PAGE_PATH = '/__browser-hash.html';
const WORKER_PATH = '/scripts/browser/hash-worker.js';
const PAGE_HTML = '<!doctype html><title>browser-hash</title>';

/**
 * Parses the command line.
 * @param {string[]} argv Arguments after the script name.
 * @returns {{ cdp: string, headed: boolean }} The run options.
 */
export function parseArgs(argv) {
    const options = { cdp: '', headed: false };
    for (const arg of argv) {
        if (arg === '--headed') {
            options.headed = true;
        } else if (arg.startsWith('--cdp=') && arg.length > '--cdp='.length) {
            options.cdp = arg.slice('--cdp='.length);
        } else {
            throw new Error(`Unknown argument "${arg}"; expected --headed or --cdp=<url>`);
        }
    }
    return options;
}

/**
 * Compares browser results with the golden cases.
 * @param {{ name: string, worldHash: string }[]} cases The golden cases.
 * @param {{ worldHash?: string, error?: string, ms: number }[]} results One browser result per case, in order.
 * @returns {{ rows: { name: string, expected: string, actual: string, ms: number, ok: boolean }[], ok: boolean }} Rows and the overall verdict.
 */
export function compareResults(cases, results) {
    if (cases.length !== results.length) {
        throw new Error(`Expected ${cases.length} results, got ${results.length}`);
    }
    const rows = cases.map((golden, i) => {
        const { worldHash, error, ms } = results[i];
        const actual = worldHash ?? `error: ${error ?? 'no hash returned'}`;
        return { name: golden.name, expected: golden.worldHash, actual, ms, ok: actual === golden.worldHash };
    });
    return { rows, ok: rows.every((row) => row.ok) };
}

/**
 * Formats one comparison row for the console.
 * @param {{ name: string, expected: string, actual: string, ms: number, ok: boolean }} row A comparison row.
 * @returns {string} The line.
 */
export function formatRow(row) {
    return `${row.ok ? 'ok  ' : 'FAIL'} ${row.name}: expected ${row.expected}, actual ${row.actual} (${Math.round(row.ms)} ms)`;
}

/* v8 ignore start -- drives Chromium; covered by running `npm run browser:hash`, not by unit tests */
/**
 * Runs every case in a module worker inside the page.
 * @param {import('@playwright/test').Page} page A page on the dev server origin.
 * @param {{ overrides: object, ticks: number }[]} cases The golden cases.
 * @returns {Promise<{ worldHash?: string, error?: string, ms: number }[]>} One result per case.
 */
function runCases(page, cases) {
    return page.evaluate(
        async ({ jobs, workerPath }) => {
            const out = [];
            for (const job of jobs) {
                const worker = new globalThis.Worker(workerPath, { type: 'module' });
                const started = performance.now();
                const reply = await new Promise((resolveReply) => {
                    worker.onmessage = (event) => resolveReply(event.data);
                    worker.onerror = (event) => resolveReply({ error: event.message || 'worker failed to load' });
                    worker.postMessage({ overrides: job.overrides, ticks: job.ticks });
                });
                worker.terminate();
                out.push({ ...reply, ms: performance.now() - started });
            }
            return out;
        },
        { jobs: cases, workerPath: WORKER_PATH },
    );
}

/**
 * Runs the whole check.
 * @param {{ cdp: string, headed: boolean }} options Parsed options.
 * @returns {Promise<boolean>} Whether every hash matched.
 */
function run(options) {
    const { cases } = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
    return withBrowserSession(options, async ({ browser, url }) => {
        const page = await browser.newPage();
        await page.route(`**${PAGE_PATH}`, (route) => route.fulfill({ contentType: 'text/html', body: PAGE_HTML }));
        await page.goto(new URL(PAGE_PATH, url).href);
        console.log(`Chromium ${browser.version()} against ${cases.length} golden cases`);
        const { rows, ok } = compareResults(cases, await runCases(page, cases));
        rows.forEach((row) => console.log(formatRow(row)));
        return ok;
    });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        process.exitCode = (await run(parseArgs(process.argv.slice(2)))) ? 0 : 1;
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}
/* v8 ignore stop */
