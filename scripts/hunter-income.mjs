// Splits a replay's hunter income by life: `node scripts/hunter-income.mjs <.sim/logs/<runId>.jsonl>` (the replay must
// run with `--level debug` so the log holds `HunterLedger` records). Prints the shares of `splitHunterIncome`.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ledgerRecords, splitHunterIncome } from '../js/evo/hunter-income-split.js';
import { exitCodeOf } from './lib/cli-args.mjs';

const USAGE = 'usage: hunter-income <log.jsonl>';

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {(line: string) => void} print where the output goes
 * @returns {import('../js/evo/hunter-income-split.js').IncomeSplit} the split
 * @throws {Error} when no log is named or it holds no `HunterLedger` record
 */
export function runHunterIncome(argv, print) {
    if (argv.length !== 1) {
        throw new Error(USAGE);
    }
    const records = ledgerRecords(readFileSync(argv[0], 'utf8'));
    if (records.length === 0) {
        throw new Error(`${argv[0]} holds no HunterLedger record; replay with --level debug`);
    }
    const split = splitHunterIncome(records);
    for (const [name, value] of Object.entries(split)) {
        print(`${name.padEnd(24)}${Number.isInteger(value) ? value : value.toFixed(3)}`);
    }
    return split;
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {Promise<number>} the process exit code
 */
export function main(argv) {
    return exitCodeOf(async () => runHunterIncome(argv, console.log));
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
