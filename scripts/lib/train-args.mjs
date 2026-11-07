// Command-line parsing for `npm run train`.
import { intValue, parseFlags } from './cli-args.mjs';

/** Episodes per generation. */
export const DEFAULT_EPISODES = 32;
/** Generations between checkpoints. */
export const DEFAULT_CHECKPOINT_EVERY = 10;
export const USAGE =
    'usage: train --generations <g> --out <dir> [--episodes <e>] [--workers <n>] [--curriculum <file>] [--config <file.json>] [--resume <archive.json>] [--checkpoint-every <n>] [--ticks <n>] [--offer-from <tick>] [--seed-offset <k>]';

/**
 * @typedef {object} TrainArgs
 * @property {number} generations total generations of the run (a resumed run counts the ones already done)
 * @property {number} episodes episodes per generation
 * @property {number | undefined} workers pool size
 * @property {string | null} curriculum a curriculum file
 * @property {string | null} config config overrides for every generation when there is no curriculum
 * @property {string | null} resume an archive file to continue from
 * @property {number} checkpointEvery generations between checkpoints; 0 for none
 * @property {number | undefined} ticks ticks per episode (default `EPISODE_TICKS`; a test and smoke-run knob)
 * @property {number | undefined} offerFrom the first death tick offered (default `OFFER_FROM_TICK`; a test and smoke-run knob)
 * @property {number} seedOffset shifts the episode seed index: episode `i` of generation `g` takes seed `(g x episodes + i + k) mod 256` (default 0)
 * @property {string} out the output directory
 */

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {TrainArgs} parsed options
 * @throws {Error} when `--generations` or `--out` is missing, an argument is unknown, or `--curriculum` and `--config`
 *   are both given
 */
export function parseArgs(argv) {
    const args = /** @type {TrainArgs & {out: string | null, generations: number | null}} */ (
        parseFlags(argv, {
            valueFlags: {
                '--generations': (v, f) => ['generations', intValue(f, v, 1, USAGE)],
                '--episodes': (v, f) => ['episodes', intValue(f, v, 1, USAGE)],
                '--workers': (v, f) => ['workers', intValue(f, v, 1, USAGE)],
                '--curriculum': (v) => ['curriculum', String(v)],
                '--config': (v) => ['config', String(v)],
                '--resume': (v) => ['resume', String(v)],
                '--checkpoint-every': (v, f) => ['checkpointEvery', intValue(f, v, 0, USAGE)],
                '--ticks': (v, f) => ['ticks', intValue(f, v, 1, USAGE)],
                '--offer-from': (v, f) => ['offerFrom', intValue(f, v, 0, USAGE)],
                '--seed-offset': (v, f) => ['seedOffset', intValue(f, v, 0, USAGE)],
                '--out': (v) => ['out', String(v)],
            },
            defaults: {
                generations: null,
                episodes: DEFAULT_EPISODES,
                workers: undefined,
                curriculum: null,
                config: null,
                resume: null,
                checkpointEvery: DEFAULT_CHECKPOINT_EVERY,
                ticks: undefined,
                offerFrom: undefined,
                seedOffset: 0,
                out: null,
            },
            usage: USAGE,
        })
    );
    if (args.generations === null || args.out === null) {
        throw new Error(`--generations and --out are required\n${USAGE}`);
    }
    if (args.curriculum !== null && args.config !== null) {
        throw new Error(`give --curriculum or --config, not both\n${USAGE}`);
    }
    return /** @type {TrainArgs} */ (args);
}
