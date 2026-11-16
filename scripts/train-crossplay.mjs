// Cross-play of a training run (`npm run train:crossplay -- <dir>`; docs/designs/training-stages.md, Cross-play): the
// champions of every checkpoint of the run in `<dir>`, each checkpoint's predator against every checkpoint's forager.
// Writes `<dir>/crossplay.json` and prints the matrix, hunter progress, prey progress and the cycle share.
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CROSS_TRIALS, cycleShare, hunterProgress, preyProgress } from '../js/evo/crossplay.js';
import { exitCodeOf, intFlag, parseFlags } from './lib/cli-args.mjs';
import { createCrossplayState, loadPlayers, playMatrix } from './lib/train-crossplay.mjs';

const USAGE = 'usage: train:crossplay <dir> [--trials <n>] [--no-group]';

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {{dir: string, trials: number, group: boolean}} the run directory, the trials per cell and whether the group
 *   cells are played
 * @throws {Error} unless the run directory is the first argument
 */
export function parseArgs(argv) {
    const [dir, ...rest] = argv;
    if (dir === undefined || dir.startsWith('--')) {
        throw new Error(`give the run directory first\n${USAGE}`);
    }
    const flags = /** @type {Record<string, any>} */ (
        parseFlags(rest, {
            valueFlags: { '--trials': intFlag('trials', 1, USAGE) },
            booleanFlags: { '--no-group': 'noGroup' },
            defaults: { trials: CROSS_TRIALS, noGroup: false },
            usage: USAGE,
        })
    );
    return { dir, trials: flags.trials, group: !flags.noGroup };
}

/**
 * @param {(number | null)[][]} kills a kill matrix
 * @param {number} trials trials per cell
 * @param {readonly number[]} generations the checkpoints' generations
 * @returns {string[]} the matrix as lines: predators down, foragers across, the kill share of each cell
 */
function matrixLines(kills, trials, generations) {
    const head = `predator\\forager ${generations.map((g) => `g${g}`.padStart(7)).join('')}`;
    const rows = kills.map(
        (row, i) =>
            `g${generations[i]}`.padEnd(16) +
            row.map((k) => (k === null ? '-' : (k / trials).toFixed(2)).padStart(7)).join(''),
    );
    return [head, ...rows];
}

/**
 * Plays the run's cross-play and writes `crossplay.json`.
 * @param {{dir: string, trials: number, group: boolean}} args the options
 * @param {(line: string) => void} [print] where the matrix and the numbers go
 * @returns {Record<string, any>} the written record
 * @throws {Error} when the run has fewer than two checkpoints with a predator and a forager champion
 */
export function runCrossplay(args, print = () => {}) {
    const found = loadPlayers(args.dir);
    if (found.players.length < 2) {
        throw new Error(
            `${args.dir} has ${found.players.length} checkpoint(s) with a predator and a forager champion; cross-play needs 2 (run npm run train with --checkpoint-every)`,
        );
    }
    const state = playMatrix(createCrossplayState(found, args.trials), { group: args.group });
    const { matrix, generations } = state;
    const record = {
        generations,
        trials: matrix.trials,
        kills: matrix.kills,
        packKills: args.group ? matrix.packKills : null,
        hunterProgress: hunterProgress(matrix),
        preyProgress: preyProgress(matrix),
        cycleShare: cycleShare(matrix),
    };
    writeFileSync(join(args.dir, 'crossplay.json'), `${JSON.stringify(record)}\n`);
    for (const line of matrixLines(matrix.kills, matrix.trials, generations)) {
        print(line);
    }
    if (args.group) {
        print('pack (three sibling predators, one prey one bite cannot kill):');
        for (const line of matrixLines(matrix.packKills, matrix.trials, generations)) {
            print(line);
        }
    }
    const fixed = (/** @type {{progress: number, low: number} | null} */ p) =>
        p === null ? '-' : `${p.progress.toFixed(3)} (low ${p.low.toFixed(3)})`;
    print(`hunter progress ${fixed(record.hunterProgress)}`);
    print(`prey progress   ${fixed(record.preyProgress)}`);
    print(`cycle share     ${record.cycleShare === null ? '-' : record.cycleShare.toFixed(3)}`);
    return record;
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv) {
    return exitCodeOf(() => runCrossplay(parseArgs(argv), console.log));
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
