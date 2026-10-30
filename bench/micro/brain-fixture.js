// Brain bench inputs: copies of a micro world that share its genomes but own the state `forwardAll` writes, with the
// input rows reshaped so the sparsity of the brain's input is a knob, not an accident of one world.
import { mkdirSync, writeFileSync } from 'node:fs';
import { RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { aliveSlots } from './fixture.js';

/** Where the sweep suites write facts a bench name cannot carry (read back by `scripts/bench-micro.mjs`). */
export const INFO_DIR = '.bench-micro-info';

/**
 * A copy of a world that `forwardAll` can run without disturbing the original: own `inputs`, `pooled`, `hidden`,
 * `outputs`, `fastOut` and scratch; genomes and every other array are shared.
 * @param {Record<string, any>} world a micro world
 * @param {Record<string, any>} [over] fields to replace on the copy
 * @returns {Record<string, any>} the copy
 */
export function forkBrainWorld(world, over = {}) {
    return {
        ...world,
        inputs: world.inputs.slice(),
        pooled: world.pooled.slice(),
        hidden: world.hidden.slice(),
        outputs: world.outputs.slice(),
        fastOut: world.fastOut.slice(),
        brainScratch: world.brainScratch.slice(),
        ...over,
    };
}

/**
 * @param {Record<string, any>} world a micro world
 * @param {'none' | 'body' | 'dense'} shape `none`: every input 0 (all pooled values 0); `body`: no ray hits, the body
 *   block as it is; `dense`: every ray hits one channel (round robin) and every body value is 0.5, so nearly every
 *   pooled value is nonzero
 * @returns {Record<string, any>} a forked world with that input row
 */
export function shapedBrainWorld(world, shape) {
    const copy = forkBrainWorld(world);
    const { rayCount } = world.config;
    const raw = world.layout.rawInputCount;
    for (const slot of aliveSlots(world)) {
        const base = slot * raw;
        const body = base + rayCount * RAY_CHANNELS;
        if (shape === 'none') {
            copy.inputs.fill(0, base, base + raw);
            continue;
        }
        copy.inputs.fill(0, base, body);
        if (shape === 'dense') {
            for (let k = 0; k < rayCount; k++) {
                copy.inputs[base + k * RAY_CHANNELS] = 0.5;
                copy.inputs[base + k * RAY_CHANNELS + 1 + (k % 8)] = 0.5;
            }
            copy.inputs.fill(0.5, body, base + raw);
        }
    }
    return copy;
}

/**
 * @param {Record<string, any>} world a world whose `pooled` rows are current
 * @returns {number} the mean count of nonzero pooled values (of `layout.inputCount`) over the alive agents
 */
export function meanNonzeroInputs(world) {
    const slots = aliveSlots(world);
    const n = world.layout.inputCount;
    let nonzero = 0;
    for (const slot of slots) {
        for (let i = 0; i < n; i++) {
            nonzero += world.pooled[slot * n + i] !== 0 ? 1 : 0;
        }
    }
    return nonzero / slots.length;
}

/**
 * Records a fact about a suite's fixtures for the runner to print.
 * @param {string} suite the bench file's module name
 * @param {Record<string, number>} facts a number per fixture
 * @returns {void}
 */
export function writeInfo(suite, facts) {
    mkdirSync(INFO_DIR, { recursive: true });
    writeFileSync(`${INFO_DIR}/${suite}.json`, JSON.stringify(facts, null, 2));
}
