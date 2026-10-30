// Brain state across slot reuse and births (natural-selection.md Phase 4 T40). Already pinned elsewhere:
// `test/sim/hebbian.test.js` pins that `fastOut` is zeroed when a slot is freed, re-copied from the genome when it is
// reused, and that a child starts at the genome block and not at what its mother learned. This file adds the rest:
// a reused slot starts with a zero hidden row and zero memory outputs (so a zero memory read-back), and a mother's and
// her child's recurrent state never share storage.
import { describe, expect, it } from 'vitest';
import { forwardAll } from '../../js/sim/brain.js';
import { BODY_INPUT, OUTPUT_COUNT, OUTPUT_INDEX, RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { writeBodyInputs } from '../../js/sim/body-inputs.js';
import { splitAll } from '../../js/sim/reproduction.js';
import { applyGenes } from '../../js/sim/traits.js';
import { freeAgent } from '../../js/sim/world.js';
import { addBlob, lifeWorld, recordingPolicy } from './helpers/life-world.js';

/**
 * @param {any} w the world
 * @param {number} slot the slot
 * @returns {number[]} the slot's hidden row
 */
function hiddenRow(w, slot) {
    const H = w.layout.hidden;
    return Array.from(w.hidden.subarray(slot * H, (slot + 1) * H));
}

/**
 * @param {any} w the world
 * @param {number} slot the slot
 * @returns {number[]} the slot's memory read-back body inputs after `writeBodyInputs`
 */
function memoryReadBack(w, slot) {
    writeBodyInputs(w, slot);
    const o = slot * w.layout.rawInputCount + w.config.rayCount * RAY_CHANNELS;
    return [w.inputs[o + BODY_INPUT.MEMORY_A], w.inputs[o + BODY_INPUT.MEMORY_B]];
}

describe('a reused slot', () => {
    it('starts with a zero hidden row, zero memory outputs and a zero memory read-back', () => {
        const w = lifeWorld();
        const first = addBlob(w);
        w.hidden.fill(0.75, first * w.layout.hidden, (first + 1) * w.layout.hidden);
        w.outputs[first * OUTPUT_COUNT + OUTPUT_INDEX.MEMORY_A] = 0.9;
        w.outputs[first * OUTPUT_COUNT + OUTPUT_INDEX.MEMORY_B] = -0.6;
        expect(memoryReadBack(w, first)).toEqual([Math.fround(0.9), Math.fround(-0.6)]);
        freeAgent(w, first);
        const reborn = addBlob(w);
        expect(reborn).toBe(first);
        expect(hiddenRow(w, reborn).every((v) => v === 0)).toBe(true);
        expect(Array.from(w.outputs.subarray(reborn * OUTPUT_COUNT, (reborn + 1) * OUTPUT_COUNT))).toEqual(
            new Array(OUTPUT_COUNT).fill(0),
        );
        expect(memoryReadBack(w, reborn)).toEqual([0, 0]);
    });
});

describe('a mother and her child', () => {
    it('keep separate recurrent state: the child starts at zero and neither row moves the other', () => {
        const w = lifeWorld({ splitMinEnergy: 500 });
        const mother = addBlob(w, { energy: 900 });
        w.weights.fill(0.25, mother * w.layout.weightCount, (mother + 1) * w.layout.weightCount);
        applyGenes(w, mother);
        w.hidden.fill(0.5, mother * w.layout.hidden, (mother + 1) * w.layout.hidden);
        w.outputs[mother * OUTPUT_COUNT + OUTPUT_INDEX.MEMORY_A] = 0.8;
        splitAll(w, recordingPolicy([]));
        const child = 1;
        expect(w.alive[child]).toBe(1);
        expect(hiddenRow(w, child).every((v) => v === 0)).toBe(true);
        expect(w.outputs[child * OUTPUT_COUNT + OUTPUT_INDEX.MEMORY_A]).toBe(0);
        const motherBefore = hiddenRow(w, mother);
        w.hidden.fill(-0.3, child * w.layout.hidden, (child + 1) * w.layout.hidden);
        expect(hiddenRow(w, mother)).toEqual(motherBefore);
        w.hidden.fill(0.9, mother * w.layout.hidden, (mother + 1) * w.layout.hidden);
        expect(hiddenRow(w, child).every((v) => v === Math.fround(-0.3))).toBe(true);
    });

    it('step apart: a forward pass from different hidden rows gives the two different hidden rows', () => {
        const w = lifeWorld({ splitMinEnergy: 500 });
        const mother = addBlob(w, { energy: 900 });
        w.weights.fill(0.25, mother * w.layout.weightCount, (mother + 1) * w.layout.weightCount);
        applyGenes(w, mother);
        splitAll(w, recordingPolicy([]));
        const child = 1;
        w.hidden.fill(0.5, mother * w.layout.hidden, (mother + 1) * w.layout.hidden);
        forwardAll(w);
        expect(hiddenRow(w, mother)).not.toEqual(hiddenRow(w, child));
    });
});
