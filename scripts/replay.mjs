// Headless replay: runs a seeded world, writes a JSONL diagnostics log, prints checkpoint hashes (`npm run replay`).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createObserver, observe, observerPhases } from '../js/evo/observer.js';
import { getPolicy, POLICIES } from '../js/evo/policies/index.js';
import { configHash, createConfig } from '../js/sim/config.js';
import { EVENT_STRIDE, EVENT_TYPE, readEvents } from '../js/sim/events.js';
import { createSimLog, drainEvents, LOG_LEVEL } from '../js/sim/log.js';
import { createRng, fork } from '../js/sim/rng.js';
import { createWorld } from '../js/sim/spawn.js';
import { step } from '../js/sim/step.js';
import { hashWorld } from '../js/sim/world-hash.js';
import { dispatchEvents } from './eval-worker.mjs';
import { intValue, parseFlags } from './lib/cli-args.mjs';
import { createFollower } from './lib/follow.mjs';
import { createJsonlSink } from './lib/jsonl-sink.mjs';
import { createMetrics } from './lib/otel.mjs';

const CHECKPOINT_INTERVAL = 1000;
const DEFAULT_BUDGET_MS = 8;
const DEFAULT_POLICY = 'baseline-v5';
const USAGE =
    'usage: replay --seed <n> --ticks <n> [--config <file.json>] [--dump <tick>] [--level debug|info|warn|error] [--budget-ms <n>] [--check-invariants] [--policy <name>] [--follow <genomeId>]';

/** World fields that are not state data: config, derived tables, hash grid, event ring and row lists. */
const DUMP_SKIPPED = new Set(['config', 'layout', 'hash', 'events', 'agentRows', 'foodRows', 'birthOptions']);

/**
 * @typedef {object} ReplayArgs
 * @property {number} seed
 * @property {number} ticks
 * @property {string | null} config
 * @property {number | null} dump
 * @property {keyof typeof LOG_LEVEL} level
 * @property {number} budgetMs
 * @property {boolean} checkInvariants
 * @property {string} policy a key of `POLICIES`
 * @property {number | null} follow genome id to follow
 */

/** Value parsers by flag; each returns the option key and its parsed value. */
/** @type {Record<string, (value: string | undefined, flag: string) => [string, any]>} */
const VALUE_FLAGS = {
    '--seed': (value, flag) => ['seed', intValue(flag, value, 0, USAGE)],
    '--ticks': (value, flag) => ['ticks', intValue(flag, value, 1, USAGE)],
    '--dump': (value, flag) => ['dump', intValue(flag, value, 1, USAGE)],
    '--budget-ms': (value, flag) => ['budgetMs', intValue(flag, value, 0, USAGE)],
    '--follow': (value, flag) => ['follow', intValue(flag, value, 1, USAGE)],
    '--policy': (value) => ['policy', parsePolicy(value)],
    '--config': (value) => ['config', String(value)],
    '--level': (value) => ['level', parseLevel(value)],
};

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {ReplayArgs} parsed options
 */
export function parseArgs(argv) {
    const opts = /** @type {ReplayArgs} */ (
        parseFlags(argv, {
            valueFlags: VALUE_FLAGS,
            booleanFlags: { '--check-invariants': 'checkInvariants' },
            usage: USAGE,
            defaults: {
                seed: -1,
                ticks: -1,
                config: null,
                dump: null,
                level: 'info',
                budgetMs: DEFAULT_BUDGET_MS,
                checkInvariants: false,
                policy: DEFAULT_POLICY,
                follow: null,
            },
        })
    );
    if (opts.seed < 0 || opts.ticks < 1) {
        throw new Error(`--seed and --ticks are required\n${USAGE}`);
    }
    return opts;
}

/**
 * @param {string | undefined} value a policy name
 * @returns {string} the name, if known
 */
function parsePolicy(value) {
    if (value === undefined || !Object.hasOwn(POLICIES, value)) {
        throw new Error(`--policy: Unknown policy "${value}"; known: ${Object.keys(POLICIES).join(', ')}\n${USAGE}`);
    }
    return value;
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
 * @property {string} [policy] a key of `POLICIES`, default baseline-v5
 * @property {number | null} [follow] genome id to follow
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
    log.log('error', 'InvariantViolated', {
        tick: cause.tick ?? tick,
        invariant: cause.invariant,
        slot: cause.slot,
        value: cause.value,
    });
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
 * Feeds the eval observer and the policy's event hooks the way `scripts/eval-worker.mjs` does, so a policy that
 * learns from the run (`map-elites-v1`) replays an eval exactly. Neither touches the world.
 * @param {{policy: any, observer: any}} run the policy object and its observer
 * @param {Record<string, any>} world the world, just stepped (or just created)
 * @returns {void}
 */
function feedPolicy({ policy, observer }, world) {
    observe(observer, world, policy.fitness);
    dispatchEvents(policy, world);
    if (world.tick > 0) {
        policy.afterStep?.(world);
    }
}

/**
 * Runs the tick loop; returns false if an invariant violation stopped it.
 * @param {ReplayOptions & {log: any, runId: string, policy: any, run: {policy: any, observer: any}, world: Record<string, any>, follower: import('./lib/follow.mjs').Follower | null}} ctx run context
 * @param {string[]} hashes receives each checkpoint hash
 * @returns {boolean} whether the run completed
 */
function runTicks(ctx, hashes) {
    const { world, policy, log, ticks, budgetMs = DEFAULT_BUDGET_MS, stepFn = step, follower, run } = ctx;
    const phases = observerPhases(run.observer);
    const totals = { births: 0, deaths: 0 };
    for (let t = 0; t < ticks; t++) {
        const start = performance.now();
        try {
            stepFn(world, policy, phases);
        } catch (error) {
            if (logViolation(log, error, world.tick)) {
                return false;
            }
            throw error;
        }
        const stepMs = performance.now() - start;
        feedPolicy(run, world);
        const { births, deaths } = countEvents(world);
        totals.births += births;
        totals.deaths += deaths;
        drainEvents(world, log);
        follower?.update(world);
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
 * @param {ReplayOptions} options the run options
 * @param {Record<string, any>} config the world config
 * @param {import('../js/sim/log.js').SimLog} log the log
 * @returns {{policyName: string, policy: any, run: {policy: any, observer: any}}} the policy name, its brain hooks, and
 *   the policy object with the eval observer it was built with
 */
function buildPolicy(options, config, log) {
    const policyName = options.policy ?? DEFAULT_POLICY;
    const observer = createObserver(config, fork(createRng(config.seed), 'eval'));
    const full = getPolicy(policyName).create({ config, log, observer });
    return { policyName, policy: full.brain, run: { policy: full, observer } };
}

/**
 * @param {import('../js/sim/log.js').SimLog} log the log
 * @param {number | null | undefined} follow the genome id to follow, if any
 * @returns {import('./lib/follow.mjs').Follower | null} the follower
 */
function createFollowerFor(log, follow) {
    return follow ? createFollower(log, follow) : null;
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
    const { policyName, policy, run } = buildPolicy(options, config, log);
    log.log('info', 'RunStarted', {
        runId,
        seed,
        configHash: configHash(config),
        configOverrides,
        policy: policyName,
        follow: options.follow ?? null,
        ticks,
    });
    const ctx = {
        ...options,
        print: options.print ?? (() => {}),
        metrics: options.metrics ?? (await createMetrics()),
        log,
        runId,
        policy,
        run,
        follower: createFollowerFor(log, options.follow),
        world: createWorld(config, policy),
    };
    feedPolicy(run, ctx.world);
    /** @type {string[]} */
    const hashes = [];
    const ok = runTicks(ctx, hashes);
    const finalHash = hashWorld(ctx.world);
    if (ok) {
        ctx.follower?.finish(ctx.world);
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
