// The purpose guard of the heat levers (docs/designs/low-density-edge.md, Phase 3, T12):
// `node scripts/heat-guard.mjs --grid evals/screens/low-density-edge-heat.grid.json [--seeds 1] [--arms a,b]`.
// Runs the constant-thrust controllers on the defaults plus each heat arm's keys; exits 1 if any arm fails.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formatArm, guardArm, isHeatArm } from './lib/heat-guard.mjs';

const USAGE = 'usage: node scripts/heat-guard.mjs --grid <grid.json> [--seeds 1] [--arms a,b] [--ticks <n>]';

/**
 * @param {string[]} argv arguments after the script name
 * @returns {{ grid: string, seeds: number[], arms: string[] | null, ticks: number | undefined }} the options
 */
export function parseArgs(argv) {
    const opts = { grid: '', seeds: [1], arms: null, ticks: undefined };
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];
        const value = argv[++i];
        if (value === undefined) {
            throw new Error(`${flag} needs a value\n${USAGE}`);
        }
        if (flag === '--grid') {
            opts.grid = value;
        } else if (flag === '--seeds') {
            opts.seeds = value.split(',').map(Number);
        } else if (flag === '--arms') {
            opts.arms = value.split(',');
        } else if (flag === '--ticks') {
            opts.ticks = Number(value);
        } else {
            throw new Error(`unknown argument: ${flag}\n${USAGE}`);
        }
    }
    if (!opts.grid || opts.seeds.some((s) => !Number.isInteger(s))) {
        throw new Error(USAGE);
    }
    return opts;
}

/**
 * @param {string[]} argv arguments after the script name
 * @returns {number} the exit code: 1 when any checked arm fails
 */
export function main(argv) {
    const opts = parseArgs(argv);
    const grid = JSON.parse(readFileSync(opts.grid, 'utf8'));
    const names = opts.arms ?? Object.keys(grid.arms).filter(isHeatArm);
    let failed = 0;
    for (const name of names) {
        if (!Object.hasOwn(grid.arms, name)) {
            throw new Error(`no arm ${name} in ${opts.grid}`);
        }
        const rows = guardArm(grid.arms[name], opts.seeds, opts.ticks);
        console.log(formatArm(name, rows));
        failed += rows.every((r) => r.pass) ? 0 : 1;
    }
    console.log(failed === 0 ? 'heat-guard: all arms pass' : `heat-guard: ${failed} arm(s) FAIL`);
    return failed === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = main(process.argv.slice(2));
}
