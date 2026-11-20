// Where a training run's wall time goes (`npm run train:profile -- --curriculum <ladder> --generations 20`;
// docs/designs/training-loop.md, Phase 5): runs the trainer with the usual `train` options into `--out` (default
// `.sim/train-profile/<ladder>-g<generations>`) and prints, per stage, the share of wall time in episodes, checkpoints and
// archive writes, and the worker busy share. `--from <dir>` reads a finished run's `train.jsonl` instead of training.
// A detector, never fitness.
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exitCodeOf } from './lib/cli-args.mjs';
import { checkOut, parseArgs as parseTrainArgs } from './lib/train-args.mjs';
import { formatProfile, profileTimings } from './lib/train-profile.mjs';
import { runTraining } from './train.mjs';

const USAGE = 'usage: train:profile --generations <g> [--out <dir>] [<train options>] | train:profile --from <run-dir>';

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {{from: string | null, train: import('./lib/train-args.mjs').TrainArgs | null}} the run directory to read, or
 *   the options of the run to make
 * @throws {Error} on a bad `train` option, a missing `--generations`, or `--from` beside other options
 */
export function parseArgs(argv) {
    const at = argv.indexOf('--from');
    if (at >= 0) {
        if (argv.length !== 2 || argv[at + 1] === undefined) {
            throw new Error(`--from takes one run directory and nothing else\n${USAGE}`);
        }
        return { from: argv[at + 1], train: null };
    }
    if (!argv.includes('--generations')) {
        throw new Error(`--generations is required\n${USAGE}`);
    }
    const given = argv.includes('--out') ? argv : [...argv, '--out', '__default__'];
    const train = parseTrainArgs(given);
    if (train.out === '__default__') {
        const ladder = train.curriculum === null ? 'world' : basename(train.curriculum).replace(/\.json$/, '');
        train.out = join('.sim', 'train-profile', `${ladder}-g${train.generations}`);
    }
    return { from: null, train };
}

/**
 * @param {string} dir a run directory
 * @returns {Record<string, any>[]} its `train.jsonl` records
 * @throws {Error} when the run has no `train.jsonl`
 */
function readLog(dir) {
    const file = join(dir, 'train.jsonl');
    if (!existsSync(file)) {
        throw new Error(`${file} does not exist`);
    }
    return readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => JSON.parse(line));
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {(line: string) => void} [print] receives each output line
 * @returns {Promise<number>} the process exit code: 0 profiled, 1 on bad input or a failed run
 */
export async function main(argv, print = console.log) {
    return exitCodeOf(async () => {
        const { from, train } = parseArgs(argv);
        let dir = from;
        if (train !== null) {
            checkOut(train);
            if (existsSync(join(train.out, 'train.jsonl'))) {
                throw new Error(
                    `${train.out} already holds a run; read it with --from ${train.out} or pick another --out`,
                );
            }
            try {
                await runTraining(train, {});
            } catch (error) {
                if (/** @type {any} */ (error).exitCode !== 3) {
                    throw error;
                }
                print('the run stalled at a required stage; its generations are profiled');
            }
            dir = train.out;
        }
        const profile = profileTimings(readLog(/** @type {string} */ (dir)));
        formatProfile(profile).forEach((line) => print(line));
    });
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
