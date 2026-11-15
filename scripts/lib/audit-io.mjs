// The shell the audit and probe scripts share (`audit:chase`, `audit:signals`, `probe:learn`): the flags they all take,
// printing a report and writing it to `--out`, and running `main` when the file is the entry point.
import { rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSimLog } from '../../js/sim/log.js';
import { intValue } from './cli-args.mjs';
import { createJsonlSink } from './jsonl-sink.mjs';

/**
 * @param {string} usage the usage line appended to an error
 * @returns {Record<string, (value: string | undefined, flag: string) => [string, unknown]>} the `--config`, `--workers`
 *   and `--out` flags as `parseFlags` value flags
 */
export function sharedFlags(usage) {
    return {
        '--config': (value) => ['config', String(value)],
        '--workers': (value, flag) => ['workers', intValue(flag, value, 1, usage)],
        '--out': (value) => ['out', String(value)],
    };
}

/**
 * Prints a report and, when `out` is given, writes it there.
 * @param {string} text the report
 * @param {{print: (text: string) => void, out: string | null}} where the printer and the output file
 * @returns {void}
 */
export function emitReport(text, { print, out }) {
    print(text);
    if (out !== null) {
        writeFileSync(out, `${text}\n`);
    }
}

/**
 * Runs `main` with the command line when the module is the process entry point.
 * @param {string} moduleUrl the calling module's `import.meta.url`
 * @param {(argv: string[]) => Promise<number>} main the script's main
 * @returns {Promise<void>}
 */
export async function runAsMain(moduleUrl, main) {
    if (resolve(process.argv[1] ?? '') === fileURLToPath(moduleUrl)) {
        process.exitCode = await main(process.argv.slice(2));
    }
}

/**
 * Runs `body` with a sim log that writes a fresh JSON lines file, and closes the file after it.
 * @template T
 * @param {{path: string, level: 'debug' | 'info'}} file where the log goes and its level
 * @param {(log: import('../../js/sim/log.js').SimLog) => Promise<T>} body the run
 * @returns {Promise<T>} what `body` returns
 */
export async function withLogFile({ path, level }, body) {
    rmSync(path, { force: true });
    const file = createJsonlSink(path);
    try {
        return await body(createSimLog(file.sink, { level }));
    } finally {
        await file.close();
    }
}
