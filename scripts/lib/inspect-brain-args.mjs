// Parses and documents the inspect-brain command options.

import { intValue, parseFlags } from './cli-args.mjs';

export const USAGE =
    'usage: inspect --champions <dir> --drill <name> --out <dir> [--name <champion>] [--seed <n>] [--trials <n>] [--trace-trials <n>] [--top <n>] [--edit <edits.json>] [--config <file.json>] [--workers <1-4>]';

/**
 * @param {string[]} argv command-line arguments
 * @returns {Record<string, any>} the parsed options
 */
export function parseArgs(argv) {
    /** @param {string} key @returns {(value: string | undefined) => [string, string]} */
    const text = (key) => (value) => [key, String(value)];
    /** @param {string} key @param {number} min @returns {(value: string | undefined, flag: string) => [string, number]} */
    const integer = (key, min) => (value, flag) => [key, intValue(flag, value, min, USAGE)];
    return parseFlags(argv, {
        valueFlags: {
            '--champions': text('champions'),
            '--name': text('name'),
            '--drill': text('drill'),
            '--out': text('out'),
            '--seed': integer('seed', 0),
            '--trials': integer('trials', 1),
            '--trace-trials': integer('traceTrials', 0),
            '--top': integer('top', 0),
            '--edit': text('edit'),
            '--config': text('config'),
            '--workers': integer('workers', 1),
        },
        defaults: {
            champions: null,
            name: null,
            drill: null,
            out: null,
            seed: 1,
            trials: 32,
            traceTrials: 4,
            top: 8,
            edit: null,
            config: null,
            workers: 4,
        },
        usage: USAGE,
    });
}
