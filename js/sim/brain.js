// Runs every alive agent's Elman RNN brain forward one step, in the contract's summation order.

import { detTanh } from './det-math.js';

/**
 * Adds each nonzero input times its weight row to `brainScratch`. Two nonzero inputs share one pass over the scratch;
 * each unit still takes its terms one after another in the same order, so the sums are bit-identical to adding the
 * rows one at a time.
 * @param {Record<string, any>} world the world
 * @param {number} slot the alive slot
 * @returns {void}
 */
function addInputs(world, slot) {
    const { weights, inputs, brainScratch: acc, layout } = world;
    const H = layout.hidden;
    const inBase = slot * layout.inputCount;
    const wIn = slot * layout.weightCount + layout.wIn;
    let pending = -1;
    let pendingX = 0;
    for (let i = 0; i < layout.inputCount; i++) {
        const x = inputs[inBase + i];
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
    if (world.config.leakEnabled) {
        const hBase = slot * H;
        for (let j = 0; j < H; j++) {
            const a = world.leakRate[hBase + j];
            hidden[scratchBase + j] = Math.fround((1 - a) * hidden[hBase + j] + a * detTanh(acc[j]));
        }
        return;
    }
    for (let j = 0; j < H; j++) {
        hidden[scratchBase + j] = Math.fround(detTanh(acc[j]));
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
    const wBase = slot * layout.weightCount;
    const hBase = slot * H;
    const scratchBase = world.config.maxAgents * H;
    const wOut = wBase + layout.wOut;
    const bOut = wBase + layout.bOut;
    for (let o = 0; o < OUT; o++) {
        let sum = weights[bOut + o];
        for (let j = 0; j < H; j++) {
            sum += weights[wOut + j * OUT + o] * hidden[scratchBase + j];
        }
        outputs[slot * OUT + o] = detTanh(sum);
    }
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
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            hiddenStep(world, slot);
            outputStep(world, slot);
        }
    }
}
