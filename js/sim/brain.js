// Runs every alive agent's Elman RNN brain forward one step, in the contract's summation order.

import { detTanhInto } from './det-math.js';
import { hebbianStep } from './hebbian.js';
import { GENE_OUTPUTS, OUTPUT_INDEX, POOLED_VALUES } from './brain-layout.js';
import { poolRays } from './ray-pool.js';

/**
 * Adds each nonzero pooled input times its weight row to `brainScratch`. Two nonzero inputs share one pass over the scratch;
 * each unit still takes its terms one after another in the same order, so the sums are bit-identical to adding the
 * rows one at a time.
 * @param {Record<string, any>} world the world
 * @param {number} slot the alive slot
 * @returns {void}
 */
function addInputs(world, slot) {
    const { weights, pooled, brainScratch: acc, layout } = world;
    const H = layout.hidden;
    const inBase = slot * layout.inputCount;
    const wIn = slot * layout.weightCount + layout.wIn;
    let pending = -1;
    let pendingX = 0;
    for (let i = 0; i < layout.inputCount; i++) {
        const x = pooled[inBase + i];
        if (x === 0) {
            continue;
        }
        const row = wIn + i * H;
        if (pending < 0) {
            pending = row;
            pendingX = x;
            continue;
        }
        for (let j = 0; j < H; j++) {
            acc[j] = acc[j] + weights[pending + j] * pendingX + weights[row + j] * x;
        }
        pending = -1;
    }
    for (let j = 0; pending >= 0 && j < H; j++) {
        acc[j] += weights[pending + j] * pendingX;
    }
}

/**
 * Adds the old hidden row times the recurrent weights to `brainScratch`, four hidden units per pass over the scratch
 * (same term order per unit as one at a time).
 * @param {Record<string, any>} world the world
 * @param {number} slot the alive slot
 * @returns {void}
 */
function addRecurrent(world, slot) {
    const { weights, hidden, brainScratch: acc, layout } = world;
    const H = layout.hidden;
    const hBase = slot * H;
    const wRec = slot * layout.weightCount + layout.wRec;
    let k = 0;
    for (; k + 4 <= H; k += 4) {
        const h0 = hidden[hBase + k];
        const h1 = hidden[hBase + k + 1];
        const h2 = hidden[hBase + k + 2];
        const h3 = hidden[hBase + k + 3];
        const r0 = wRec + k * H;
        for (let j = 0; j < H; j++) {
            acc[j] =
                acc[j] +
                weights[r0 + j] * h0 +
                weights[r0 + H + j] * h1 +
                weights[r0 + 2 * H + j] * h2 +
                weights[r0 + 3 * H + j] * h3;
        }
    }
    for (; k < H; k++) {
        const h = hidden[hBase + k];
        const row = wRec + k * H;
        for (let j = 0; j < H; j++) {
            acc[j] += weights[row + j] * h;
        }
    }
}

/**
 * Computes one agent's new hidden row (into `world.hidden`'s scratch row) from its inputs and old hidden row.
 * @param {Record<string, any>} world the world
 * @param {number} slot the alive slot
 * @returns {void}
 */
function hiddenStep(world, slot) {
    const { weights, hidden, brainScratch: acc, layout } = world;
    const H = layout.hidden;
    const scratchBase = world.config.maxAgents * H;
    const bHidden = slot * layout.weightCount + layout.bHidden;
    for (let j = 0; j < H; j++) {
        acc[j] = weights[bHidden + j];
    }
    addInputs(world, slot);
    addRecurrent(world, slot);
    const hBase = slot * H;
    const { leakRate } = world;
    detTanhInto(acc, acc, 0, H); // in place: each group of four is read whole before it is written
    for (let j = 0; j < H; j++) {
        const a = leakRate[hBase + j];
        hidden[scratchBase + j] = Math.fround((1 - a) * hidden[hBase + j] + a * acc[j]);
    }
}

/**
 * Adds the skip block to the output sums: each nonzero pooled value times its row of `wSkip`, pooled values in index
 * order, after the hidden terms of every output (so a reflex needs no hidden unit). The block is genome only; it is
 * not plastic.
 * @param {Record<string, any>} world the world
 * @param {number} slot the alive slot
 * @returns {void}
 */
function addSkip(world, slot) {
    const { weights, pooled, layout, brainScratch: sums } = world;
    const G = layout.geneOutputs;
    const inBase = slot * layout.inputCount;
    const skip = slot * layout.weightCount + layout.wSkip;
    for (let i = 0; i < POOLED_VALUES; i++) {
        const x = pooled[inBase + i];
        if (x === 0) {
            continue;
        }
        const row = skip + i * G;
        for (let g = 0; g < G; g++) {
            sums[GENE_OUTPUTS[g]] += weights[row + g] * x;
        }
    }
}

/**
 * Computes one agent's outputs from the new hidden row in the scratch row, then commits that row to the slot.
 * @param {Record<string, any>} world the world
 * @param {number} slot the alive slot
 * @returns {void}
 */
function outputStep(world, slot) {
    const { weights, hidden, outputs, layout } = world;
    const H = layout.hidden;
    const OUT = layout.outputCount;
    const G = layout.geneOutputs;
    const wBase = slot * layout.weightCount;
    const hBase = slot * H;
    const scratchBase = world.config.maxAgents * H;
    // With Hebbian learning on, the plastic copy of the block is read; the genome's block never changes in a life.
    const plastic = world.config.hebbianRate > 0;
    const block = plastic ? world.fastOut : weights;
    const wOut = plastic ? slot * H * G : wBase + layout.wOut;
    const bOut = wBase + layout.bOut;
    const sums = world.brainScratch;
    sums[OUTPUT_INDEX.SPLIT] = 0; // no genes: the output reads 0
    for (let g = 0; g < G; g++) {
        let sum = weights[bOut + g];
        for (let j = 0; j < H; j++) {
            sum += block[wOut + j * G + g] * hidden[scratchBase + j];
        }
        sums[GENE_OUTPUTS[g]] = sum;
    }
    addSkip(world, slot);
    detTanhInto(sums, outputs, slot * OUT, OUT);
    for (let j = 0; j < H; j++) {
        hidden[hBase + j] = hidden[scratchBase + j];
    }
}

/**
 * Runs the brain of every alive agent, slots ascending: updates `hidden` and writes `outputs`.
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function forwardAll(world) {
    const { alive } = world;
    const learn = world.config.hebbianRate > 0;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            poolRays(world, slot);
            hiddenStep(world, slot);
            outputStep(world, slot);
            if (learn) {
                hebbianStep(world, slot);
            }
        }
    }
}
