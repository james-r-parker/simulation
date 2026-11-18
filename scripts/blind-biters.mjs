// Where blind biters come from (honest-budgets Phase 6, E191; `js/evo/blind-bite-tracker.js`, `js/evo/blind-bite-lineage.js`).
//   node scripts/blind-biters.mjs run --seed <n> [--ticks <t>] [--out <dir>] [--policy <name>] [--config <file.json>]
//     replays the seed through `runReplay` with a tracker on every step and writes `<out>/blind-<seed>.json` (the hunters'
//     lives: birth source, parents, blind-bite ticks, the BITE weights they were born with); the sim is unchanged.
//   node scripts/blind-biters.mjs report <blind-*.json>... [--burn-in <t>] [--juvenile-ticks <t>] [--json <file>]
//     pools the lives of several runs and prints the four readings (birth source, parent against child, reproducers, BITE bias).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { biasDrift, byDepth, bySource, countedLives, parentChild, reproducers } from '../js/evo/blind-bite-lineage.js';
import { createBlindBiteTracker } from '../js/evo/blind-bite-tracker.js';
import { step } from '../js/sim/step.js';
import { exitCodeOf, intFlag, parseFlags } from './lib/cli-args.mjs';
import { runReplay } from './replay.mjs';

const USAGE =
    'usage: blind-biters run --seed <n> [--ticks <t>] [--out <dir>] [--policy <name>] [--config <file>] | report <blind-*.json>... [--burn-in <t>] [--juvenile-ticks <t>] [--json <file>]';
const MATURITY_TICKS = 600;
/** A parent seen for fewer ticks has no blind share worth reading. */
const MIN_PARENT_TICKS = 100;
/** Seeds are pooled by adding this to every genome id of the run (ids are unique within a run only). */
const ID_STRIDE = 1e9;

/**
 * @param {string[]} argv the flags after `run`
 * @returns {Record<string, any>} the options
 */
function runOptions(argv) {
    return parseFlags(argv, {
        valueFlags: {
            '--seed': intFlag('seed', 1, USAGE),
            '--ticks': intFlag('ticks', 1, USAGE),
            '--out': (v) => ['out', v],
            '--policy': (v) => ['policy', v],
            '--config': (v) => ['config', v],
        },
        defaults: { seed: 1, ticks: 100000, out: '.sim/blind', policy: undefined, config: null },
        usage: USAGE,
    });
}

/**
 * Replays one seed with the tracker on and writes its lives.
 * @param {string[]} argv the flags after `run`
 * @param {(line: string) => void} print where the output goes
 * @returns {Promise<{path: string, lives: number}>} the file written and the number of hunter lives in it
 */
export async function runBlindBiters(argv, print) {
    const o = runOptions(argv);
    const tracker = createBlindBiteTracker();
    mkdirSync(o.out, { recursive: true });
    const configOverrides = o.config === null ? {} : JSON.parse(readFileSync(o.config, 'utf8'));
    const result = await runReplay({
        seed: o.seed,
        ticks: o.ticks,
        policy: o.policy,
        configOverrides,
        logDir: join(o.out, 'logs'),
        dumpDir: join(o.out, 'dumps'),
        stepFn: (world, policy, phases) => {
            step(world, policy, phases);
            tracker.observe(world);
        },
    });
    const lives = tracker.lives();
    const path = join(o.out, `blind-${o.seed}.json`);
    writeFileSync(
        path,
        JSON.stringify({
            seed: o.seed,
            ticks: o.ticks,
            endTick: tracker.endTick(),
            ok: result.ok,
            configOverrides,
            lives,
        }),
    );
    print(`seed ${o.seed}: ${lives.length} hunter lives to tick ${tracker.endTick()} -> ${path}`);
    return { path, lives: lives.length };
}

/**
 * @param {string[]} argv the flags and files after `report`
 * @returns {{files: string[], burnIn: number, juvenileTicks: number, json: string | null}} the options
 */
function reportOptions(argv) {
    const files = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1] ?? '').startsWith('--'));
    const flags = argv.filter((a, i) => a.startsWith('--') || (argv[i - 1] ?? '').startsWith('--'));
    const o = parseFlags(flags, {
        valueFlags: {
            '--burn-in': intFlag('burnIn', 0, USAGE),
            '--juvenile-ticks': intFlag('juvenileTicks', 1, USAGE),
            '--json': (v) => ['json', v],
        },
        defaults: { burnIn: 10000, juvenileTicks: 3000, json: null },
        usage: USAGE,
    });
    if (files.length === 0) {
        throw new Error(USAGE);
    }
    return { files, burnIn: o.burnIn, juvenileTicks: o.juvenileTicks, json: o.json };
}

/**
 * @param {string[]} files the `blind-<seed>.json` files
 * @returns {{lives: import('../js/evo/blind-bite-tracker.js').BiteLife[], endTick: number}} their lives with ids made unique
 *   across runs; `endTick` is the shortest run's last tick (lives of a longer run are read to their own end)
 */
function pool(files) {
    const runs = files.map((file) => JSON.parse(readFileSync(file, 'utf8')));
    const endTick = Math.max(...runs.map((run) => run.endTick));
    const lives = runs.flatMap((run, i) => {
        const up = (/** @type {number} */ id) => (id > 0 ? id + (i + 1) * ID_STRIDE : 0);
        return run.lives.map((/** @type {Record<string, any>} */ life) => ({
            ...life,
            id: up(life.id),
            parentA: up(life.parentA),
            parentB: up(life.parentB),
            last: life.last === run.endTick ? endTick : life.last,
        }));
    });
    return { lives, endTick };
}

/**
 * @param {number} value a number
 * @returns {string} it to 3 decimals, `-` for NaN
 */
const f = (value) => (Number.isNaN(value) ? '-' : Number.isInteger(value) ? String(value) : value.toFixed(3));

/**
 * @param {Record<string, Record<string, number>>} rows rows by name
 * @param {(line: string) => void} print where the output goes
 * @returns {void}
 */
function table(rows, print) {
    const names = Object.keys(rows);
    const cols = Object.keys(rows[names[0]] ?? {});
    print('group'.padEnd(22) + cols.map((c) => c.padStart(12)).join(''));
    for (const name of names) {
        print(name.padEnd(22) + cols.map((c) => f(rows[name][c]).padStart(12)).join(''));
    }
}

/**
 * Pools runs and prints the readings.
 * @param {string[]} argv the flags and files after `report`
 * @param {(line: string) => void} print where the output goes
 * @returns {Record<string, any>} the readings
 */
export function reportBlindBiters(argv, print) {
    const { files, burnIn, juvenileTicks, json } = reportOptions(argv);
    const { lives, endTick } = pool(files);
    const counted = countedLives(lives, { burnIn, endTick, juvenileTicks });
    if (counted.length === 0) {
        throw new Error('no hunter life with a known outcome; run longer than the burn-in');
    }
    const out = {
        counted: counted.length,
        bySource: bySource(counted, juvenileTicks),
        parentChild: parentChild(lives, counted, MIN_PARENT_TICKS),
        byDepth: byDepth(lives, counted),
        reproducers: reproducers(lives, counted, MATURITY_TICKS),
        biasDrift: { bias: biasDrift(lives, counted, 'bias'), preyBite: biasDrift(lives, counted, 'preyBite') },
    };
    print(
        `hunter lives counted ${out.counted} from ${files.length} runs (burn-in ${burnIn}, juvenile ${juvenileTicks})`,
    );
    print('-- by birth source');
    table(out.bySource, print);
    print('-- child against its tracked hunter parent');
    table({ pairs: out.parentChild }, print);
    print('-- by hunter generation depth');
    table(out.byDepth, print);
    print(`-- mature hunters (${MATURITY_TICKS}+ ticks) that were a parent and those that were not`);
    table(out.reproducers, print);
    print('-- birth weights, child against hunter parent: the BITE output bias and the prey-to-BITE skip weight');
    table(out.biasDrift, print);
    if (json !== null) {
        writeFileSync(json, JSON.stringify(out, null, 2));
    }
    return out;
}

/** @type {(argv: string[]) => Promise<number>} runs the script on `argv` and returns the process exit code */
export const main = (argv) =>
    exitCodeOf(async () => {
        const [command, ...rest] = argv;
        if (command === 'run') {
            await runBlindBiters(rest, console.log);
        } else if (command === 'report') {
            reportBlindBiters(rest, console.log);
        } else {
            throw new Error(USAGE);
        }
    });

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
