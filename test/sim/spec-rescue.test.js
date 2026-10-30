import { describe, expect, it } from 'vitest';
import { SPEC_COUNT, countSpecs } from '../../js/sim/spec-rescue.js';
import { addBlob, lifeWorld } from './helpers/life-world.js';

describe('countSpecs', () => {
    it('counts the alive agents of each specialisation', () => {
        const w = lifeWorld();
        [0, 2, 2].forEach((spec) => addBlob(w, { spec }));
        const out = new Int32Array(SPEC_COUNT).fill(9);
        countSpecs(w, 7, out);
        expect(Array.from(out)).toEqual([1, 0, 2, 0, 0]);
    });

    it('does not count the slot being seeded', () => {
        const w = lifeWorld();
        const slot = addBlob(w, { spec: 1 });
        const out = new Int32Array(SPEC_COUNT);
        countSpecs(w, slot, out);
        expect(Array.from(out)).toEqual([0, 0, 0, 0, 0]);
    });
});
