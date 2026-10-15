// Headless sim benchmark: median step and per-phase time at several population sizes (`npm run bench`).
// Two passes over one world, so the phase split cannot distort the step number: the step pass times `step` itself;
// the phase pass then calls STEP_PHASES[i].run in step's order (clearEvents first, tick incremented last, so the
// world and the event ring advance exactly as `step` advances them) and times each call.
import { fileURLToPath } from 'node:url';
import { cloneWithNoisePolicy } from '../js/sim/birth-policy.js';
import { createConfig } from '../js/sim/config.js';
import { clearEvents } from '../js/sim/events.js';
import { createWorld } from '../js/sim/spawn.js';
import { STEP_PHASES, step } from '../js/sim/step.js';
import { createMetrics } from './lib/otel.mjs';

const DEFAULT_SIZES = [100, 250, 500];
const WARMUP_TICKS = 500;
const MEASURED_TICKS = 2000;

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {{sizes: number[], json: boolean}} parsed options
 */
export function parseArgs(argv) {
    let sizes = DEFAULT_SIZES;
    let json = false;
    for (const arg of argv) {
        if (arg === '--json') {
            json = true;
        } else if (arg.startsWith('--sizes=')) {
            sizes = arg
                .slice('--sizes='.length)
                .split(',')
                .map((part) => Number(part));
            if (sizes.length === 0 || sizes.some((n) => !Number.isInteger(n) || n < 1)) {
                throw new Error(`--sizes must be comma-separated positive integers, got: ${arg}`);
            }
        } else {
            throw new Error(`unknown argument: ${arg} (expected --json or --sizes=100,250,500)`);
        }
    }
    return { sizes, json };
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
 * @returns {Record<string, number>} the flat metric object
 */
export function formatMetrics(size, stepMs, phaseMs) {
    /** @type {Record<string, number>} */
    const metrics = { [`bench.step_ms@${size}`]: round4(stepMs) };
    for (const [name, ms] of Object.entries(phaseMs)) {
        metrics[`bench.phase_ms.${name}@${size}`] = round4(ms);
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
 * @param {number} size population size, held fixed by min = max = initial
 * @returns {Record<string, number>} the metrics for that size
 */
export function benchSize(size) {
    const policy = cloneWithNoisePolicy();
    const world = createWorld(createConfig({ initialAgents: size, minAgents: size, maxAgents: size }), policy);
    for (let i = 0; i < WARMUP_TICKS; i++) {
        step(world, policy);
    }
    const stepTimes = new Float64Array(MEASURED_TICKS);
    for (let i = 0; i < MEASURED_TICKS; i++) {
        const start = performance.now();
        step(world, policy);
        stepTimes[i] = performance.now() - start;
    }
    const phaseTimes = STEP_PHASES.map(() => new Float64Array(MEASURED_TICKS));
    for (let i = 0; i < MEASURED_TICKS; i++) {
        clearEvents(world.events);
        for (let p = 0; p < STEP_PHASES.length; p++) {
            const start = performance.now();
            STEP_PHASES[p].run(world, policy);
            phaseTimes[p][i] = performance.now() - start;
        }
        world.tick += 1;
    }
    /** @type {Record<string, number>} */
    const phaseMs = {};
    STEP_PHASES.forEach(({ name }, p) => {
        phaseMs[name] = median(phaseTimes[p]);
    });
    return formatMetrics(size, median(stepTimes), phaseMs);
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
 * @returns {Promise<void>}
 */
export async function main(argv) {
    const { sizes, json } = parseArgs(argv);
    /** @type {Record<string, number>} */
    const all = {};
    for (const size of sizes) {
        Object.assign(all, benchSize(size));
    }
    console.log(json ? JSON.stringify(all, null, 2) : formatLines(all));
    const metrics = await createMetrics();
    recordMetrics(metrics, all);
    await metrics.shutdown();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await main(process.argv.slice(2));
}
