// The command line shared by `train:yield` and `train:compare`: run directories (or quoted globs) and `--out <path>`.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {{usage: string, count: number | null}} spec the usage line, and how many directories are wanted (null: one or more)
 * @returns {{patterns: string[], out: string | null}} the run directories (or globs) and the JSON path
 * @throws {Error} on an unknown flag, a bare `--out` or the wrong number of directories
 */
export function parseYieldArgs(argv, { usage, count }) {
    /** @type {string[]} */
    const patterns = [];
    let out = null;
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--out') {
            out = argv[++i] ?? null;
            if (out === null) {
                throw new Error(`--out needs a path\n${usage}`);
            }
        } else if (argv[i].startsWith('--')) {
            throw new Error(`unknown argument: ${argv[i]}\n${usage}`);
        } else {
            patterns.push(argv[i]);
        }
    }
    if (count === null ? patterns.length === 0 : patterns.length !== count) {
        throw new Error(usage);
    }
    return { patterns, out };
}

/**
 * @param {readonly string[]} lines the report
 * @param {{print: (line: string) => void, out: string | null, json: unknown}} to receives each line, and the JSON written
 *   to `out` unless it is null
 * @returns {void}
 */
export function emit(lines, { print, out, json }) {
    for (const line of lines) {
        print(line);
    }
    if (out !== null) {
        writeFileSync(out, `${JSON.stringify(json, null, 2)}\n`);
    }
}

/**
 * Runs a script's `main` when the file is the one node was started on, and sets the process exit code from it.
 * @param {string} url the script's `import.meta.url`
 * @param {(argv: string[]) => Promise<number>} main the script's main
 * @returns {Promise<void>}
 */
export async function runAsScript(url, main) {
    if (resolve(process.argv[1] ?? '') === fileURLToPath(url)) {
        process.exitCode = await main(process.argv.slice(2));
    }
}
