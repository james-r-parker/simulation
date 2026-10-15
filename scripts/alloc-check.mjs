// Fails when a steady-state tick allocates: heap growth over 1000 default-world ticks must stay under 1 MB.
// Run with `node --expose-gc scripts/alloc-check.mjs`.
import { cloneWithNoisePolicy } from '../js/sim/birth-policy.js';
import { createConfig } from '../js/sim/config.js';
import { createWorld } from '../js/sim/spawn.js';
import { step } from '../js/sim/step.js';

const WARMUP_TICKS = 500;
const MEASURED_TICKS = 1000;
const RUNS = 3;
const LIMIT_BYTES = 1024 * 1024;

if (typeof globalThis.gc !== 'function') {
    console.error('alloc-check: run with node --expose-gc');
    process.exit(2);
}

const policy = cloneWithNoisePolicy();
const world = createWorld(createConfig({}), policy);
for (let i = 0; i < WARMUP_TICKS; i++) {
    step(world, policy);
}

let best = Infinity;
for (let run = 0; run < RUNS; run++) {
    globalThis.gc();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < MEASURED_TICKS; i++) {
        step(world, policy);
    }
    globalThis.gc();
    best = Math.min(best, process.memoryUsage().heapUsed - before);
}

console.log(`alloc-check: best heap growth over ${MEASURED_TICKS} ticks is ${best} bytes (limit ${LIMIT_BYTES})`);
process.exit(best > LIMIT_BYTES ? 1 : 0);
