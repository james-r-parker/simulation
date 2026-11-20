// Whether the shared baseline still describes the default rules (`npm run baseline:status`,
// docs/designs/detector-baseline.md, Keeping it current): prints the newest shared report's `rulesHash` beside the
// default config's and exits 1 when they differ.
import { fileURLToPath } from 'node:url';
import { createConfig, rulesHash } from '../js/sim/config.js';
import { newestBaselinePath, readReport } from './lib/baseline-report.mjs';
import { parseFlags } from './lib/cli-args.mjs';

const USAGE = 'usage: baseline:status [--report <report.json>]';

/**
 * @param {Record<string, any>} reportConfig the config the report ran
 * @param {Record<string, any>} defaultConfig the config the code defaults to now
 * @returns {{ reportHash: string, defaultHash: string, match: boolean }} the two `rulesHash` values and whether they agree
 */
export function compareRules(reportConfig, defaultConfig) {
    const reportHash = rulesHash(reportConfig);
    const defaultHash = rulesHash(defaultConfig);
    return { reportHash, defaultHash, match: reportHash === defaultHash };
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {(line: string) => void} print where lines go
 * @param {Record<string, any>} [defaultConfig] the default config (injectable for tests)
 * @returns {number} the exit code: 0 when the hashes match, 1 when they differ or no report exists
 */
export function runBaselineStatus(argv, print, defaultConfig = createConfig({ seed: 1 })) {
    const opts = parseFlags(argv, {
        valueFlags: { '--report': (v) => ['report', v] },
        defaults: { report: null },
        usage: USAGE,
    });
    const path = opts.report ?? newestBaselinePath();
    if (path === null || path === undefined) {
        print('no shared baseline report under evals/power/');
        return 1;
    }
    const { reportHash, defaultHash, match } = compareRules(readReport(path).config, defaultConfig);
    print(`report   ${path}`);
    print(`report   rulesHash ${reportHash}`);
    print(`default  rulesHash ${defaultHash}`);
    print(
        match
            ? 'baseline current'
            : 'baseline STALE: the rules changed since the report ran; a plan dates its prediction',
    );
    return match ? 0 : 1;
}

/* v8 ignore start -- thin CLI; runBaselineStatus is tested */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        process.exitCode = runBaselineStatus(process.argv.slice(2), console.log);
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 2;
    }
}
/* v8 ignore stop */
