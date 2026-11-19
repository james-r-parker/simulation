// The learn probe's size flags, shared by `probe:learn` and `train:feasible`.
import { intValue } from './cli-args.mjs';

/**
 * @param {string} usage the usage text an error prints
 * @returns {Record<string, (value: string | undefined, flag: string) => [string, number]>} the `--generations`, `--seeds`,
 *   `--population` and `--trials` flag parsers
 */
export function learnSizeFlags(usage) {
    return {
        '--generations': (v, f) => ['generations', intValue(f, v, 1, usage)],
        '--seeds': (v, f) => ['seeds', intValue(f, v, 1, usage)],
        '--population': (v, f) => ['population', intValue(f, v, 2, usage)],
        '--trials': (v, f) => ['trials', intValue(f, v, 1, usage)],
    };
}
