// Runs every alive agent's Elman RNN brain forward one step, in the contract's summation order.

import { detTanh } from './det-math.js';

/**
 * Computes one agent's new hidden row (into `world.hidden`'s scratch row) from its inputs and old hidden row.
 * @param {Record<string, any>} world the world
 * @param {number} slot the alive slot
 * @returns {void}
 */
function hiddenStep(world, slot) {
    const { weights, inputs, hidden, brainScratch: acc, layout } = world;
    const H = layout.hidden;
    const wBase = slot * layout.weightCount;
    const inBase = slot * layout.inputCount;
    const hBase = slot * H;
    const scratchBase = world.config.maxAgents * H;
    const wIn = wBase + layout.wIn;
    const wRec = wBase + layout.wRec;
    const bHidden = wBase + layout.bHidden;
    for (let j = 0; j < H; j++) {
        acc[j] = weights[bHidden + j];
    }
    for (let i = 0; i < layout.inputCount; i++) {
        const x = inputs[inBase + i];
        if (x === 0) {
            continue;
        }
        const row = wIn + i * H;
        for (let j = 0; j < H; j++) {
            acc[j] += weights[row + j] * x;
        }
    }
    for (let k = 0; k < H; k++) {
        const h = hidden[hBase + k];
        const row = wRec + k * H;
        for (let j = 0; j < H; j++) {
            acc[j] += weights[row + j] * h;
        }
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
