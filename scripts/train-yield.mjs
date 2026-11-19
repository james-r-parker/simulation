// The yield of ladder runs (`npm run train:yield -- <dir> [<dir> ...]`; docs/designs/training-loop.md, Ladder yield):
// each run's score and, per stage, the share of runs that passed it, the median generations to pass and the CPU hours
// per pass. A detector, never fitness.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ladderYield } from '../js/evo/ladder-yield.js';
import { exitCodeOf } from './lib/cli-args.mjs';
import { expandDirs, loadRuns } from './lib/yield-files.mjs';
import { formatRuns, formatYield } from './lib/yield-report.mjs';

const USAGE = 'usage: train:yield <dir|glob> [<dir|glob> ...] [--out <path>]';

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {{patterns: string[], out: string | null}} the run directories (or globs) and the JSON path
 * @throws {Error} on an unknown flag or no directory
 */
export function parseArgs(argv) {
    /** @type {string[]} */
    const patterns = [];
    let out = null;
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--out') {
            out = argv[++i] ?? null;
            if (out === null) {
                throw new Error(`--out needs a path\n${USAGE}`);
            }
        } else if (argv[i].startsWith('--')) {
            throw new Error(`unknown argument: ${argv[i]}\n${USAGE}`);
        } else {
            patterns.push(argv[i]);
        }
    }
    if (patterns.length === 0) {
        throw new Error(USAGE);
    }
    return { patterns, out };
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {(line: string) => void} [print] receives each output line
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv, print = console.log) {
    return exitCodeOf(async () => {
        const { patterns, out } = parseArgs(argv);
        const { runs, stages } = loadRuns(expandDirs(patterns));
        const yielded = ladderYield(runs, stages);
        for (const line of [...formatRuns(runs), '', ...formatYield(yielded)]) {
            print(line);
        }
        if (out !== null) {
            writeFileSync(out, `${JSON.stringify({ ...yielded, perRun: runs }, null, 2)}\n`);
        }
    });
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
