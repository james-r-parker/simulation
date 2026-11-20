// The yield of ladder runs (`npm run train:yield -- <dir> [<dir> ...]`; docs/designs/training-loop.md, Ladder yield):
// each run's score and, per stage, the share of runs that passed it, the median generations to pass and the CPU hours
// per pass. A detector, never fitness.
import { ladderYield } from '../js/evo/ladder-yield.js';
import { exitCodeOf } from './lib/cli-args.mjs';
import { emit, parseYieldArgs, runAsScript } from './lib/yield-cli.mjs';
import { expandDirs, loadRuns } from './lib/yield-files.mjs';
import { formatRuns, formatYield } from './lib/yield-report.mjs';

const USAGE = 'usage: train:yield <dir|glob> [<dir|glob> ...] [--out <path>]';

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {{patterns: string[], out: string | null}} the run directories (or globs) and the JSON path
 * @throws {Error} on an unknown flag or no directory
 */
export const parseArgs = (argv) => parseYieldArgs(argv, { usage: USAGE, count: null });

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
        const lines = [...formatRuns(runs), '', ...formatYield(yielded)];
        emit(lines, { print, out, json: { ...yielded, perRun: runs } });
    });
}

await runAsScript(import.meta.url, main);
