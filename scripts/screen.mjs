// Screen runner: runs a grid of config arms on fixed seeds, scores each arm against the Phase 4 collapse criteria and
// writes per-arm reports, `verdicts.json` and `table.md` (`npm run screen -- --grid <grid.json>`).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exitCodeOf, intValue, parseFlags } from './lib/cli-args.mjs';
import { DEFAULT_LOCK, lockCommand } from './lib/cpu-lock.mjs';
import { expandGrid } from './lib/screen-grid.mjs';
import { runScreen } from './lib/screen-run.mjs';
import { renderTable } from './lib/screen-table.mjs';
import { screenVerdicts } from './lib/screen-verdict.mjs';

const USAGE =
    'usage: screen --grid <grid.json> [--out <dir>] [--workers <total>] [--seeds <n>] [--seed-offset <k>] [--ticks <t>] [--trace-interval <ticks>] [--force] [--no-lock] [--lock <file>]';
const RESERVED_CORES = 2;

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {Record<string, any>} parsed options; `seeds`, `seedOffset` and `ticks` override the grid file when given
 */
export function parseArgs(argv) {
    const opts = parseFlags(argv, {
        valueFlags: {
            '--grid': (value) => ['grid', String(value)],
            '--out': (value) => ['out', String(value)],
            '--lock': (value) => ['lock', String(value)],
            '--workers': (value, flag) => ['workers', intValue(flag, value, 1, USAGE)],
            '--seeds': (value, flag) => ['seeds', intValue(flag, value, 1, USAGE)],
            '--seed-offset': (value, flag) => ['seedOffset', intValue(flag, value, 0, USAGE)],
            '--ticks': (value, flag) => ['ticks', intValue(flag, value, 1, USAGE)],
            '--trace-interval': (value, flag) => ['traceInterval', intValue(flag, value, 1, USAGE)],
        },
        booleanFlags: { '--force': 'force', '--no-lock': 'noLock' },
        defaults: {
            grid: null,
            out: null,
            lock: DEFAULT_LOCK,
            workers: null,
            seeds: null,
            seedOffset: null,
            ticks: null,
            traceInterval: null,
            force: false,
            noLock: false,
        },
        usage: USAGE,
    });
    if (opts.grid === null) {
        throw new Error(`--grid is required\n${USAGE}`);
    }
    return opts;
}

/**
 * @param {Record<string, any>} args the parsed options
 * @returns {import('./lib/screen-grid.mjs').ScreenPlan} the grid file with the command-line overrides applied
 */
function planFrom(args) {
    const grid = JSON.parse(readFileSync(args.grid, 'utf8'));
    for (const key of ['seeds', 'seedOffset', 'ticks']) {
        if (args[key] !== null) {
            grid[key] = args[key];
        }
    }
    return expandGrid(grid);
}

/**
 * Runs the grid, then writes `verdicts.json` and `table.md` beside the reports.
 * @param {Record<string, any>} args the parsed options
 * @param {(line: string) => void} print receives progress lines
 * @returns {Promise<{ outDir: string, table: string, verdicts: Record<string, any> }>} where it wrote, and what
 */
export async function screen(args, print) {
    const plan = planFrom(args);
    const stem = basename(args.grid).replace(/(\.grid)?\.json$/, '');
    const outDir = args.out ?? join('evals', 'screens', 'results', stem);
    const workers = args.workers ?? Math.max(1, availableParallelism() - RESERVED_CORES);
    const { reports } = await runScreen({
        plan,
        outDir,
        workers,
        force: args.force,
        traceInterval: args.traceInterval,
        print,
    });
    const verdicts = screenVerdicts(reports, plan.reference);
    const table = renderTable(verdicts);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'verdicts.json'), `${JSON.stringify(verdicts, null, 2)}\n`);
    writeFileSync(join(outDir, 'table.md'), table);
    return { outDir, table, verdicts };
}

/**
 * Re-runs this script under the CPU lock, once for the whole sweep, unless the caller already holds it.
 * @param {string[]} argv the command-line arguments after the script name
 * @param {Record<string, any>} args the parsed options
 * @returns {number | null} the child's exit code, or null when this process should run the sweep itself
 */
function runLocked(argv, args) {
    if (args.noLock) {
        return null;
    }
    const { command, args: flockArgs } = lockCommand({
        lockPath: args.lock,
        execPath: process.execPath,
        script: fileURLToPath(import.meta.url),
        argv,
    });
    mkdirSync(args.lock.replace(/\/[^/]*$/, '') || '.', { recursive: true });
    console.log(`waiting for ${args.lock}`);
    return spawnSync(command, flockArgs, { stdio: 'inherit' }).status ?? 1;
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv) {
    let lockedExit = 0;
    const code = await exitCodeOf(async () => {
        const args = parseArgs(argv);
        const locked = runLocked(argv, args);
        if (locked !== null) {
            lockedExit = locked;
            return;
        }
        const { outDir, table } = await screen(args, (line) => console.log(line));
        console.log(`\n${table}\nwrote ${outDir}/table.md and verdicts.json`);
    });
    return code || lockedExit;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
