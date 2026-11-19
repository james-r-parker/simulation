// Compares two arms of ladder runs on matched seed offsets (`npm run train:compare -- <before> <after>`;
// docs/designs/training-loop.md, Ladder yield): the pairs, the per-stage pass shares, the CPU hours and the verdict.
// A detector, never fitness. Exits 2 on fewer than 16 matched offsets.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ladderYield } from '../js/evo/ladder-yield.js';
import { compareYield } from '../js/evo/yield-compare.js';
import { exitCodeOf } from './lib/cli-args.mjs';
import { expandDirs, loadRuns } from './lib/yield-files.mjs';
import { formatCompare } from './lib/yield-compare-report.mjs';

const USAGE = 'usage: train:compare <before-dir-glob> <after-dir-glob> [--out <path>]';

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {{before: string, after: string, out: string | null}} the two directory globs and the JSON path
 * @throws {Error} on an unknown flag or other than two patterns
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
    if (patterns.length !== 2) {
        throw new Error(USAGE);
    }
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
        for (const line of formatCompare(compare, arms)) {
            print(line);
        }
        if (out !== null) {
            writeFileSync(out, `${JSON.stringify({ compare, ...arms }, null, 2)}\n`);
        }
    });
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
