// Runs the v6 browser measurement through `measureV6` and writes the baseline file. A browser shell (browser-perf covers
// it by use), so it is excluded from the unit coverage like the other browser helpers; everything with logic is in
// browser-perf.mjs and perf-v6.mjs.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { withBrowserSession } from './browser-session.mjs';
import { measureV6 } from './perf-v6-run.mjs';
import { formatReport, mergeBaseline } from './perf-v6.mjs';

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
