// Headless sim benchmark: median step and per-phase time at several population sizes (`npm run bench`).
// Two passes over one world, so the phase split cannot distort the step number: the step pass times `step` itself;
// the phase pass then calls STEP_PHASES[i].run in step's order (clearEvents first, tick incremented last, so the
// world and the event ring advance exactly as `step` advances them) and times each call.
import { fileURLToPath } from 'node:url';
import { createObserver, observerPhases } from '../js/evo/observer.js';
import { cloneWithNoisePolicy } from '../js/sim/birth-policy.js';
import { getPolicy } from '../js/evo/policies/index.js';
import { createConfig } from '../js/sim/config.js';
import { clearEvents } from '../js/sim/events.js';
import { createSimLog } from '../js/sim/log.js';
import { createRng, fork } from '../js/sim/rng.js';
import { createWorld } from '../js/sim/spawn.js';
import { STEP_PHASES, step } from '../js/sim/step.js';
import { feedPolicy } from './lib/feed-policy.mjs';
import { FEATURES_OFF, FEATURES_ON } from './lib/features-on.mjs';
import { createMetrics } from './lib/otel.mjs';

const DEFAULT_SIZES = [100, 250, 500];
const WARMUP_TICKS = 500;
const MEASURED_TICKS = 2000;

/**
 * The tunables `bench/baseline.json` was recorded with (commit 282ffeb), frozen so `bench.step_ms@<n>` and `bench-check`
 * compare like with like when `createConfig` defaults are retuned. It lists only the keys whose defaults have changed
 * since; every other key follows the defaults. Every Phase 3 feature key is pinned off (`FEATURES_OFF`), so the switch-on
 * in world-balance T41 leaves this world as it was. The T15d defaults (`biteArc`, and the predator's `biteMultiplier`
 * that `FEATURES_OFF` does not pin) are restated at their pre-T15d values, so the tuned defaults leave this world as it was.
 */
export const BENCH_CONFIG = Object.freeze({
    ...FEATURES_OFF,
    maxFood: 800,
    foodTargetPerAgent: 8,
    huntSizeRatio: 1.05,
    alarmCost: 4,
    huntCallCost: 4,
    biteArc: Math.PI / 4,
    specialisations: {
        predator: { plantFoodValue: 1, passiveLossMultiplier: 1, splitMinEnergyMultiplier: 1, biteMultiplier: 4 },
    },
});

/**
 * `FEATURES_ON` with merit on at representative settings (fitness-and-selection T25): the merit score, mate choice by
 * merit, birth energy by merit and the split gate, so the `merit` row records what the merit phase and its users cost.
 */
export const MERIT_ON = Object.freeze({
    ...FEATURES_ON,
    meritEnabled: true,
    meritMateWeight: 0.05,
    meritBirthBoost: 0.25,
    splitDeliberateMin: 200,
});

/**
 * Extra rows at 500 agents, not gated by `bench-check`: a suffix and the overrides on today's defaults. The `defaults`
 * row runs every Phase 3 feature on (`FEATURES_ON`), so it records what the features cost.
 */
export const TRACKED_VARIANTS = Object.freeze([
    { suffix: 'defaults', overrides: FEATURES_ON },
    { suffix: 'merit', overrides: MERIT_ON },
    { suffix: 'w7680', overrides: Object.freeze({ worldWidth: 7680, worldHeight: 4320 }) },
]);

const TRACKED_SIZE = 500;

const USAGE = 'usage: bench [--json] [--sizes=100,250,500] [--policy <name>]';

/**
 * @param {string} arg a `--sizes=...` argument
 * @returns {number[]} the sizes
 * @throws {Error} when any size is not a positive integer
 */
function parseSizes(arg) {
    const sizes = arg
        .slice('--sizes='.length)
        .split(',')
        .map((part) => Number(part));
    if (sizes.length === 0 || sizes.some((n) => !Number.isInteger(n) || n < 1)) {
        throw new Error(`--sizes must be comma-separated positive integers, got: ${arg}`);
    }
    return sizes;
}

/**
 * @param {string | undefined} name the policy name given to `--policy`
 * @returns {string} the name
 * @throws {Error} when it is missing or not a registered policy (the `getPolicy` error, plus usage)
 */
function parsePolicy(name) {
    if (name === undefined || name === '') {
        throw new Error(`--policy needs a policy name\n${USAGE}`);
    }
    try {
        getPolicy(name);
    } catch (error) {
        throw new Error(`${error instanceof Error ? error.message : error}\n${USAGE}`, { cause: error });
    }
    return name;
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {{sizes: number[], json: boolean, policy?: string}} parsed options; `policy` is set only with `--policy`
 */
export function parseArgs(argv) {
    /** @type {{sizes: number[], json: boolean, policy?: string}} */
    const opts = { sizes: DEFAULT_SIZES, json: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--json') {
            opts.json = true;
        } else if (arg.startsWith('--sizes=')) {
            opts.sizes = parseSizes(arg);
        } else if (arg === '--policy') {
            opts.policy = parsePolicy(argv[++i]);
        } else if (arg.startsWith('--policy=')) {
            opts.policy = parsePolicy(arg.slice('--policy='.length));
        } else {
            throw new Error(`unknown argument: ${arg} (expected --json, --sizes=100,250,500 or --policy <name>)`);
        }
    }
    return opts;
}

/**
 * @param {ArrayLike<number>} values at least one number
 * @returns {number} the median (mean of the middle two for an even count)
 */
export function median(values) {
    if (values.length === 0) {
        throw new Error('median needs at least one value');
    }
    const sorted = Array.from(values).sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * @param {number} ms milliseconds
 * @returns {number} the value rounded to 4 decimals
 */
export function round4(ms) {
    return Math.round(ms * 1e4) / 1e4;
}

/**
 * @param {number} size population size
 * @param {number} stepMs median step time
 * @param {Record<string, number>} phaseMs median time per phase name
 * @param {string} [suffix] appended to the size in each key, for a tracked variant
 * @returns {Record<string, number>} the flat metric object
 */
export function formatMetrics(size, stepMs, phaseMs, suffix = '') {
    /** @type {Record<string, number>} */
    const metrics = { [`bench.step_ms@${size}${suffix}`]: round4(stepMs) };
    for (const [name, ms] of Object.entries(phaseMs)) {
        metrics[`bench.phase_ms.${name}@${size}${suffix}`] = round4(ms);
    }
    return metrics;
}

/**
 * @param {Record<string, number>} metrics flat metric object
 * @returns {string} one `key value` line per metric
 */
export function formatLines(metrics) {
    return Object.entries(metrics)
        .map(([key, value]) => `${key} ${value}`)
        .join('\n');
}

/**
 * Builds what the bench steps: the reference policy, or the named policy fed by an eval observer exactly as
 * `scripts/eval-worker.mjs` feeds it (observe, event hooks, `afterStep`), so a policy that learns from the run
 * (`map-elites-v1`) does its archive work inside the timed tick.
 * @param {Record<string, any>} config the world config
 * @param {string | undefined} name a registered policy name, or undefined for the reference policy
 * @returns {{brain: any, advance: (world: Record<string, any>) => void, observe: (world: Record<string, any>) => void,
 *   policy?: Record<string, any>}} the brain, one timed tick, the feed for the freshly created world, and the policy
 */
export function createSubject(config, name) {
    if (name === undefined) {
        const brain = cloneWithNoisePolicy();
        return { brain, advance: (world) => step(world, brain), observe: () => {} };
    }
    const log = createSimLog(() => {}, { level: 'error' });
    const observer = createObserver(config, fork(createRng(config.seed), 'eval'));
    const policy = getPolicy(name).create({ config, log, observer });
    const phases = observerPhases(observer);
    const run = { policy, observer };
    return {
        brain: policy.brain,
        policy,
        advance(world) {
            step(world, policy.brain, phases);
            feedPolicy(run, world);
        },
        observe: (world) => feedPolicy(run, world),
    };
}

/**
 * @param {number} size population size, held fixed by min = max = initial
 * @param {string} [policyName] a registered policy to bench with its hooks; the reference policy when omitted
 * @param {{suffix?: string, overrides?: Record<string, any>}} [variant] a tracked variant: the key suffix and the
 *   overrides on today's defaults; the frozen `BENCH_CONFIG` world when omitted
 * @returns {Record<string, number>} the metrics for that size
 */
export function benchSize(size, policyName, variant) {
    const base = variant === undefined ? BENCH_CONFIG : (variant.overrides ?? {});
    const config = createConfig({ ...base, initialAgents: size, minAgents: size, maxAgents: size });
    const { brain, advance, observe } = createSubject(config, policyName);
    const world = createWorld(config, brain);
    observe(world);
    for (let i = 0; i < WARMUP_TICKS; i++) {
        advance(world);
    }
    const stepTimes = new Float64Array(MEASURED_TICKS);
    for (let i = 0; i < MEASURED_TICKS; i++) {
        const start = performance.now();
        advance(world);
        stepTimes[i] = performance.now() - start;
    }
    const phaseTimes = STEP_PHASES.map(() => new Float64Array(MEASURED_TICKS));
    for (let i = 0; i < MEASURED_TICKS; i++) {
        clearEvents(world.events);
        for (let p = 0; p < STEP_PHASES.length; p++) {
            const start = performance.now();
            STEP_PHASES[p].run(world, brain);
            phaseTimes[p][i] = performance.now() - start;
        }
        world.tick += 1;
    }
    /** @type {Record<string, number>} */
    const phaseMs = {};
    STEP_PHASES.forEach(({ name }, p) => {
        phaseMs[name] = median(phaseTimes[p]);
    });
    return formatMetrics(size, median(stepTimes), phaseMs, variant?.suffix);
}

/**
 * Records each size's step and phase medians as `sim.step_ms` (attributes `phase`, `agents`) when metrics are enabled.
 * @param {import('./lib/otel.mjs').Metrics} metrics the recorder
 * @param {Record<string, number>} all the flat metric object from `formatMetrics`
 * @returns {void}
 */
export function recordMetrics(metrics, all) {
    if (!metrics.enabled) {
        return;
    }
    for (const [key, value] of Object.entries(all)) {
        const match = /^bench\.(?:step_ms|phase_ms\.(.+))@(\d+)$/.exec(key);
        if (match !== null) {
            metrics.record('sim.step_ms', value, { phase: match[1] ?? 'step', agents: Number(match[2]) });
        }
    }
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {{trackedSize?: number}} [options] the size whose row also runs the tracked variants (tests pass a small one)
 * @returns {Promise<void>}
 */
export async function main(argv, { trackedSize = TRACKED_SIZE } = {}) {
    const { sizes, json, policy } = parseArgs(argv);
    /** @type {Record<string, number>} */
    const all = {};
    for (const size of sizes) {
        Object.assign(all, benchSize(size, policy));
        if (size === trackedSize) {
            for (const variant of TRACKED_VARIANTS) {
                Object.assign(all, benchSize(size, policy, variant));
            }
        }
    }
    if (json) {
        console.log(JSON.stringify(policy === undefined ? all : { policy, ...all }, null, 2));
    } else {
        console.log(policy === undefined ? formatLines(all) : `policy ${policy}\n${formatLines(all)}`);
    }
    const metrics = await createMetrics();
    recordMetrics(metrics, all);
    await metrics.shutdown();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await main(process.argv.slice(2));
}
