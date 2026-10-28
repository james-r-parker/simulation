// Fails when a steady-state tick allocates: heap growth over 1000 ticks of the default world with every Phase 3 feature and merit on must stay under 1 MB.
// Run with `node --expose-gc scripts/alloc-check.mjs [--policy <name>]`. With `--policy` the ticks run through
// `feedPolicy` with the eval observer, as `npm run bench -- --policy` does, so the observer's per-tick work counts.
import { fileURLToPath } from 'node:url';
import { cloneWithNoisePolicy } from '../js/sim/birth-policy.js';
import { createConfig } from '../js/sim/config.js';
import { createWorld } from '../js/sim/spawn.js';
import { step } from '../js/sim/step.js';
import { createSubject, MERIT_ON } from './bench.mjs';

const WARMUP_TICKS = 500;
const MEASURED_TICKS = 1000;
const RUNS = 3;
const LIMIT_BYTES = 1024 * 1024;
const USAGE = 'usage: node --expose-gc scripts/alloc-check.mjs [--policy <name>]';

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {{policy?: string}} parsed options; `policy` is set only with `--policy`
 * @throws {Error} on an unknown argument or a missing policy name
 */
export function parseArgs(argv) {
    /** @type {{policy?: string}} */
    const opts = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--policy' || arg.startsWith('--policy=')) {
            const name = arg === '--policy' ? argv[++i] : arg.slice('--policy='.length);
            if (name === undefined || name === '') {
                throw new Error(`--policy needs a policy name\n${USAGE}`);
            }
            opts.policy = name;
        } else {
            throw new Error(`unknown argument: ${arg}\n${USAGE}`);
        }
    }
    return opts;
}

/**
 * @param {string | undefined} policyName a registered policy to step with its observer; the reference policy when omitted
 * @returns {{world: Record<string, any>, advance: (world: Record<string, any>) => void}} a fresh world and one tick
 */
function createRun(policyName) {
    const config = createConfig(MERIT_ON);
    if (policyName === undefined) {
        const brain = cloneWithNoisePolicy();
        return { world: createWorld(config, brain), advance: (world) => step(world, brain) };
    }
    const { brain, advance, observe } = createSubject(config, policyName);
    const world = createWorld(config, brain);
    observe(world);
    return { world, advance };
}

/**
 * @param {object} options what to measure
 * @param {string} [options.policy] a registered policy name; the reference policy when omitted
 * @param {() => void} options.gc forces a collection (`globalThis.gc`)
 * @param {number} [options.warmup] ticks before measuring
 * @param {number} [options.measured] ticks per run
 * @param {number} [options.runs] runs; the best (smallest) growth is returned
 * @returns {number} the smallest heap growth in bytes over `measured` ticks
 */
export function measureHeapGrowth({ policy, gc, warmup = WARMUP_TICKS, measured = MEASURED_TICKS, runs = RUNS }) {
    const { world, advance } = createRun(policy);
    for (let i = 0; i < warmup; i++) {
        advance(world);
    }
    let best = Infinity;
    for (let run = 0; run < runs; run++) {
        gc();
        const before = process.memoryUsage().heapUsed;
        for (let i = 0; i < measured; i++) {
            advance(world);
        }
        gc();
        best = Math.min(best, process.memoryUsage().heapUsed - before);
    }
    return best;
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {number} the process exit code
 */
export function main(argv) {
    if (typeof globalThis.gc !== 'function') {
        console.error('alloc-check: run with node --expose-gc');
        return 2;
    }
    const { policy } = parseArgs(argv);
    const best = measureHeapGrowth({ policy, gc: globalThis.gc });
    const label = policy === undefined ? '' : ` (policy ${policy})`;
    console.log(
        `alloc-check: best heap growth over ${MEASURED_TICKS} ticks is ${best} bytes (limit ${LIMIT_BYTES})${label}`,
    );
    return best > LIMIT_BYTES ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exit(main(process.argv.slice(2)));
}
