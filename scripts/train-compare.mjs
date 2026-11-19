// Compares two arms of ladder runs on matched seed offsets (`npm run train:compare -- <before> <after>`;
// docs/designs/training-loop.md, Ladder yield): the pairs, the per-stage pass shares, the CPU hours and the verdict.
// A detector, never fitness. Exits 2 on fewer than 16 matched offsets.
import { ladderYield } from '../js/evo/ladder-yield.js';
import { compareYield } from '../js/evo/yield-compare.js';
import { exitCodeOf } from './lib/cli-args.mjs';
import { emit, parseYieldArgs, runAsScript } from './lib/yield-cli.mjs';
import { expandDirs, loadRuns } from './lib/yield-files.mjs';
import { formatCompare } from './lib/yield-compare-report.mjs';

const USAGE = 'usage: train:compare <before-dir-glob> <after-dir-glob> [--out <path>]';

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {{before: string, after: string, out: string | null}} the two directory globs and the JSON path
 * @throws {Error} on an unknown flag or other than two patterns
 */
export function parseArgs(argv) {
    const { patterns, out } = parseYieldArgs(argv, { usage: USAGE, count: 2 });
    return { before: patterns[0], after: patterns[1], out };
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {(line: string) => void} [print] receives each output line
 * @returns {Promise<number>} the process exit code: 0 compared, 2 refused (too few matched offsets) or bad input
 */
export async function main(argv, print = console.log) {
    return exitCodeOf(async () => {
        const { before, after, out } = parseArgs(argv);
        const first = loadRuns(expandDirs([before]));
        const second = loadRuns(expandDirs([after]));
        const stages = second.stages.length > first.stages.length ? second.stages : first.stages;
        const compare = compareYield(first.runs, second.runs);
        const arms = { before: ladderYield(first.runs, stages), after: ladderYield(second.runs, stages) };
        emit(formatCompare(compare, arms), { print, out, json: { compare, ...arms } });
    });
}

await runAsScript(import.meta.url, main);
