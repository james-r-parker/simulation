import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { eachAlive, setOutput, turnTowards, write } from '../../js/evo/scripted-parts.js';

describe('scripted parts', () => {
    it('turnTowards gives the side of a ray, 0 dead ahead and +1 dead behind', () => {
        expect([0, 1, 7, 8, 9, 15].map((k) => turnTowards(k, 16))).toEqual([0, 1, 1, 1, -1, -1]);
        expect(turnTowards(-1, 16)).toBe(0);
    });

    it('write zeroes the row then sets thrust and turn; setOutput changes one output only', () => {
        const world = { outputs: new Float32Array(OUTPUT_COUNT * 2).fill(0.9) };
        write(world, 1, 0.5, -1);
        setOutput(world, 1, OUTPUT_INDEX.BITE, 1);
        expect(Array.from(world.outputs.subarray(0, OUTPUT_COUNT)).every((v) => Math.fround(0.9) === v)).toBe(true);
        expect(Array.from(world.outputs.subarray(OUTPUT_COUNT))).toEqual([0.5, -1, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
    });

    it('eachAlive runs the writer for alive slots only', () => {
        const seen = /** @type {number[]} */ ([]);
        eachAlive((_w, slot) => seen.push(slot))({ alive: Uint8Array.of(1, 0, 1, 0) });
        expect(seen).toEqual([0, 2]);
    });
});
