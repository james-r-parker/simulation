// The scene reel from the command line (`npm run reel`): runs the app headless in Chromium (the browser smoke's session)
// at x8 on a seed, and writes one clip per scene seen plus `reel.json` (scene, tick, score, file) into a directory. On
// the WebGL2 software path the look differs from the real GPU: the reel shows behaviour, not the look. It reads the
// detectors' companion and never feeds fitness (docs/designs/ambient-display.md, "The scene reel").
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIVE_POLICY } from '../js/evo/policies/index.js';
import { withBrowserSession } from './lib/browser-session.mjs';
import { intFlag, parseFlags } from './lib/cli-args.mjs';
import { reelManifest, reelPageUrl, writeReel } from './lib/reel-files.mjs';
import { collectReel } from './lib/reel-page.mjs';
import { resolvePolicyFlag } from './lib/run-config.mjs';

const USAGE = 'usage: reel --seed <n> --ticks <n> --out <dir> [--config <file.json>] [--policy <name>|live] [--headed]';
/** The longest the world may take to reach the ticks, in ms: x8 is 480 ticks a second, and a software path is slower. */
const MIN_TIMEOUT_MS = 120_000;
const MS_PER_TICK = 40;

/** @type {Record<string, (value: string | undefined, flag: string) => [string, any]>} */
const VALUE_FLAGS = {
    '--seed': intFlag('seed', 0, USAGE),
    '--ticks': intFlag('ticks', 1, USAGE),
    '--out': (value) => ['out', String(value)],
    '--config': (value) => ['config', String(value)],
    '--policy': (value) => ['policy', resolvePolicyFlag(value, USAGE)],
};

/**
 * @typedef {object} ReelArgs
 * @property {number} seed the world seed
 * @property {number} ticks the tick to run to
 * @property {string} out the directory the clips and `reel.json` go in
 * @property {string | null} config a config overrides file, as `replay --config` reads
 * @property {string} policy a registered policy name
 * @property {boolean} headed show the browser
 */

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {ReelArgs} parsed options
 * @throws {Error} on an unknown argument or a missing `--seed`, `--ticks` or `--out`
 */
export function parseArgs(argv) {
    const opts = /** @type {ReelArgs} */ (
        parseFlags(argv, {
            valueFlags: VALUE_FLAGS,
            booleanFlags: { '--headed': 'headed' },
            usage: USAGE,
            defaults: { seed: -1, ticks: -1, out: '', config: null, policy: LIVE_POLICY, headed: false },
        })
    );
    if (opts.seed < 0 || opts.ticks < 1 || opts.out === '') {
        throw new Error(`--seed, --ticks and --out are required\n${USAGE}`);
    }
    return opts;
}

/**
 * @param {string | null} file a config overrides file, or null for none
 * @returns {Record<string, number | boolean> | null} its overrides
 * @throws {Error} when it is not a non-empty JSON object of numbers and booleans (the page ignores anything else)
 */
export function readConfig(file) {
    if (file === null) {
        return null;
    }
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const entries =
        typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? Object.entries(parsed) : [];
    const plain = entries.every(([, v]) => typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)));
    if (entries.length === 0 || !plain) {
        throw new Error(`${file} must be a JSON object of numbers and booleans, as replay --config reads\n${USAGE}`);
    }
    return parsed;
}

/**
 * Runs the world in a browser page and writes the reel.
 * @param {import('@playwright/test').Page} page a fresh page
 * @param {{baseUrl: string, args: ReelArgs}} run the app's URL and the options
 * @returns {Promise<string>} the path of `reel.json`
 */
export async function runReel(page, { baseUrl, args }) {
    const config = readConfig(args.config);
    await page.goto(reelPageUrl(baseUrl, { seed: args.seed, policy: args.policy, config }));
    const refused = await page.evaluate(() => /** @type {any} */ (globalThis).__reelError ?? null);
    if (refused !== null) {
        throw new Error(`the page refused the config parameter: ${refused}`);
    }
    const reel = await collectReel(page, {
        ticks: args.ticks,
        timeoutMs: Math.max(MIN_TIMEOUT_MS, args.ticks * MS_PER_TICK),
    });
    const manifest = reelManifest({
        seed: args.seed,
        ticks: args.ticks,
        policy: args.policy,
        configFile: args.config,
        tick: reel.tick,
        clips: reel.clips,
        recording: reel.recording,
    });
    return writeReel(resolve(args.out), { manifest, clips: reel.clips });
}

/* v8 ignore start -- drives Chromium; covered by test/browser/reel.spec.js, not by unit tests */
/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {Promise<number>} the exit code
 */
export async function main(argv) {
    const args = parseArgs(argv);
    return withBrowserSession(
        { headed: args.headed, cdp: '', args: ['--ignore-gpu-blocklist'] },
        async ({ browser, url }) => {
            const file = await runReel(await browser.newPage(), { baseUrl: url, args });
            console.log(`Wrote ${file}`);
            return 0;
        },
    );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        process.exitCode = await main(process.argv.slice(2));
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}
/* v8 ignore stop */
