// Headless replay: runs a seeded world, writes a JSONL diagnostics log, prints checkpoint hashes (`npm run replay`).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloneWithNoisePolicy } from '../js/sim/birth-policy.js';
import { configHash, createConfig } from '../js/sim/config.js';
import { EVENT_STRIDE, EVENT_TYPE, readEvents } from '../js/sim/events.js';
import { createSimLog, drainEvents, LOG_LEVEL } from '../js/sim/log.js';
import { createWorld } from '../js/sim/spawn.js';
import { step } from '../js/sim/step.js';
import { hashWorld } from '../js/sim/world-hash.js';
import { createJsonlSink } from './lib/jsonl-sink.mjs';
import { createMetrics } from './lib/otel.mjs';

const CHECKPOINT_INTERVAL = 1000;
const DEFAULT_BUDGET_MS = 8;
const USAGE =
    'usage: replay --seed <n> --ticks <n> [--config <file.json>] [--dump <tick>] [--level debug|info|warn|error] [--budget-ms <n>] [--check-invariants]';

/** World fields that are not state data: config, derived tables, hash grid, event ring and row lists. */
const DUMP_SKIPPED = new Set(['config', 'layout', 'hash', 'events', 'agentRows', 'foodRows', 'birthOptions']);

/**
 * @param {string} flag the flag name
 * @param {string | undefined} text the flag's value
 * @param {number} min the smallest allowed value
 * @returns {number} the value as an integer
 */
function intValue(flag, text, min) {
    const value = Number(text);
    if (text === undefined || !Number.isInteger(value) || value < min) {
        throw new Error(`${flag} must be an integer >= ${min}, got: ${text}\n${USAGE}`);
    }
    return value;
}

/**
 * @typedef {object} ReplayArgs
 * @property {number} seed
 * @property {number} ticks
 * @property {string | null} config
 * @property {number | null} dump
 * @property {keyof typeof LOG_LEVEL} level
 * @property {number} budgetMs
 * @property {boolean} checkInvariants
 */

/** Value parsers by flag; each returns the option key and its parsed value. */
/** @type {Record<string, (value: string | undefined, flag: string) => [string, any]>} */
const VALUE_FLAGS = {
    '--seed': (value, flag) => ['seed', intValue(flag, value, 0)],
    '--ticks': (value, flag) => ['ticks', intValue(flag, value, 1)],
    '--dump': (value, flag) => ['dump', intValue(flag, value, 0)],
    '--budget-ms': (value, flag) => ['budgetMs', intValue(flag, value, 0)],
    '--config': (value) => ['config', String(value)],
    '--level': (value) => ['level', parseLevel(value)],
};

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {ReplayArgs} parsed options
 */
export function parseArgs(argv) {
    /** @type {ReplayArgs} */
    const opts = {
        seed: -1,
        ticks: -1,
        config: null,
        dump: null,
        level: 'info',
        budgetMs: DEFAULT_BUDGET_MS,
        checkInvariants: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];
        if (flag === '--check-invariants') {
            opts.checkInvariants = true;
        } else if (Object.hasOwn(VALUE_FLAGS, flag)) {
            const [key, parsed] = VALUE_FLAGS[flag](argv[++i], flag);
            Object.assign(opts, { [key]: parsed });
        } else {
            throw new Error(`unknown argument: ${flag}\n${USAGE}`);
        }
    }
    if (opts.seed < 0 || opts.ticks < 1) {
        throw new Error(`--seed and --ticks are required\n${USAGE}`);
    }
    return opts;
}

/**
 * @param {string | undefined} value a level name
 * @returns {keyof typeof LOG_LEVEL} the level
 */
function parseLevel(value) {
    if (value === undefined || !Object.hasOwn(LOG_LEVEL, value)) {
        throw new Error(`--level must be one of ${Object.keys(LOG_LEVEL).join(', ')}, got: ${value}\n${USAGE}`);
    }
    return /** @type {keyof typeof LOG_LEVEL} */ (value);
}

/**
 * @param {number} seed the world seed
 * @param {string} hash the config hash
 * @returns {string} `<seed>-<configHash>`
 */
export function runIdFor(seed, hash) {
    return `${seed}-${hash}`;
}

/**
 * Converts a world value to plain JSON data: typed arrays become number arrays, objects are walked.
 * @param {any} value a world field
 * @returns {any} JSON-safe data
 */
function plain(value) {
    if (ArrayBuffer.isView(value)) {
        return Array.from(/** @type {any} */ (value));
    }
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, plain(inner)]));
    }
    return value;
}

/**
 * Serialises a world's arrays and scalars (including rng state) for `--dump`.
 * @param {Record<string, any>} world the world
 * @returns {Record<string, any>} JSON-safe data
 */
export function dumpWorld(world) {
    /** @type {Record<string, any>} */
    const out = {};
    for (const [key, value] of Object.entries(world)) {
        if (!DUMP_SKIPPED.has(key) && typeof value !== 'function') {
            out[key] = plain(value);
        }
    }
    return out;
}

/**
 * @param {Record<string, any>} world the world
 * @returns {{births: number, deaths: number}} births and deaths in the tick's event ring
 */
function countEvents(world) {
    const count = readEvents(world.events);
    let births = 0;
    let deaths = 0;
    for (let i = 0; i < count; i++) {
        const type = world.events.data[i * EVENT_STRIDE];
        births += type === EVENT_TYPE.AGENT_BORN ? 1 : 0;
        deaths += type === EVENT_TYPE.AGENT_DIED ? 1 : 0;
    }
    return { births, deaths };
}

/**
 * @typedef {object} ReplayOptions
 * @property {number} seed
 * @property {number} ticks
 * @property {Record<string, any>} [configOverrides]
 * @property {number | null} [dump] tick to dump the world after
 * @property {keyof typeof LOG_LEVEL} [level]
 * @property {number} [budgetMs]
 * @property {boolean} [checkInvariants]
 * @property {string} logDir directory for `<runId>.jsonl`
 * @property {string} dumpDir directory for `<runId>-<tick>.json`
 * @property {import('./lib/otel.mjs').Metrics} [metrics]
 * @property {(line: string) => void} [print] receives the checkpoint lines
 * @property {typeof step} [stepFn] replaces `step`, for tests
 */

/**
 * @param {import('../js/sim/log.js').SimLog} log the log
 * @param {unknown} error an error thrown by a step
 * @param {number} tick the tick being stepped
 * @returns {boolean} whether it was an invariant violation, logged
 */
function logViolation(log, error, tick) {
    const cause = /** @type {any} */ (error instanceof Error ? error.cause : null);
    if (cause === null || cause === undefined || cause.invariant === undefined) {
        return false;
    }
    log.log('error', 'InvariantViolated', { tick, invariant: cause.invariant, slot: cause.slot, value: cause.value });
    return true;
}

/**
 * @param {ReplayOptions} options the run options
 * @param {Record<string, any>} world the world
 * @param {{births: number, deaths: number}} totals running totals
 * @returns {string} the checkpoint hash, after logging, printing and recording it
 */
function checkpoint(options, world, totals) {
    const { log, runId, metrics, print } = /** @type {any} */ (options);
    const worldHash = hashWorld(world);
    log.log('info', 'Checkpoint', { tick: world.tick, population: world.population, ...totals, worldHash });
    print(`tick ${world.tick} worldHash ${worldHash}`);
    if (metrics.enabled) {
        const attrs = { run: runId };
        metrics.record('sim.population', world.population, attrs);
        metrics.record('sim.births', totals.births, attrs);
        metrics.record('sim.deaths', totals.deaths, attrs);
    }
    return worldHash;
}

/**
 * Runs the tick loop; returns false if an invariant violation stopped it.
 * @param {ReplayOptions & {log: any, runId: string, policy: any, world: Record<string, any>}} ctx run context
 * @param {string[]} hashes receives each checkpoint hash
 * @returns {boolean} whether the run completed
 */
function runTicks(ctx, hashes) {
    const { world, policy, log, ticks, budgetMs = DEFAULT_BUDGET_MS, stepFn = step } = ctx;
    const totals = { births: 0, deaths: 0 };
    for (let t = 0; t < ticks; t++) {
        const start = performance.now();
        try {
            stepFn(world, policy);
        } catch (error) {
            if (logViolation(log, error, world.tick)) {
                return false;
            }
            throw error;
        }
        const stepMs = performance.now() - start;
        const { births, deaths } = countEvents(world);
        totals.births += births;
        totals.deaths += deaths;
        drainEvents(world, log);
        if (stepMs > budgetMs) {
            log.log('warn', 'StepBudgetExceeded', { tick: world.tick, stepMs, budgetMs });
        }
        if (world.tick % CHECKPOINT_INTERVAL === 0) {
            hashes.push(checkpoint(ctx, world, totals));
        }
        if (ctx.dump === world.tick) {
            writeDump(ctx, world);
        }
    }
    return true;
}

/**
 * @param {ReplayOptions & {runId: string}} ctx run context
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
function writeDump(ctx, world) {
    mkdirSync(ctx.dumpDir, { recursive: true });
    writeFileSync(join(ctx.dumpDir, `${ctx.runId}-${world.tick}.json`), JSON.stringify(dumpWorld(world)));
}

/**
 * Runs one replay: logs to `<logDir>/<runId>.jsonl`, prints each checkpoint, and dumps the world if asked.
 * @param {ReplayOptions} options the run options
 * @returns {Promise<{runId: string, hashes: string[], finalHash: string, ok: boolean}>} the result; `ok` is false on an invariant violation
 */
export async function runReplay(options) {
    const { seed, ticks, configOverrides = {}, level = 'info', checkInvariants = false } = options;
    const overrides = { ...configOverrides, seed, ...(checkInvariants ? { checkInvariants: true } : {}) };
    const config = createConfig(overrides);
    const runId = runIdFor(seed, configHash(config));
    const logPath = join(options.logDir, `${runId}.jsonl`);
    rmSync(logPath, { force: true });
    const jsonl = createJsonlSink(logPath);
    const log = createSimLog(jsonl.sink, { level });
    const policy = cloneWithNoisePolicy();
    log.log('info', 'RunStarted', {
        runId,
        seed,
        configHash: configHash(config),
        configOverrides,
        policy: 'clone-with-noise',
        ticks,
    });
    const ctx = {
        ...options,
        print: options.print ?? (() => {}),
        metrics: options.metrics ?? (await createMetrics()),
        log,
        runId,
        policy,
        world: createWorld(config, policy),
    };
    /** @type {string[]} */
    const hashes = [];
    const ok = runTicks(ctx, hashes);
    const finalHash = hashWorld(ctx.world);
    if (ok) {
        log.log('info', 'RunFinished', { tick: ctx.world.tick, worldHash: finalHash });
    }
    await jsonl.close();
    return { runId, hashes, finalHash, ok };
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {{logDir?: string, dumpDir?: string}} [dirs] output directories, default under `.sim/`
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv, { logDir = '.sim/logs', dumpDir = '.sim/dumps' } = {}) {
    const args = parseArgs(argv);
    const configOverrides = args.config === null ? {} : JSON.parse(readFileSync(args.config, 'utf8'));
    const metrics = await createMetrics();
    try {
        const result = await runReplay({
            ...args,
            configOverrides,
            metrics,
            logDir,
            dumpDir,
            print: (line) => console.log(line),
        });
        if (!result.ok) {
            console.error(`invariant violated; see ${logDir}/${result.runId}.jsonl`);
        }
        return result.ok ? 0 : 1;
    } finally {
        await metrics.shutdown();
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
