import { describe, expect, it } from 'vitest';
import { createRng } from '../../js/sim/rng.js';
import { SPEC_COUNT, pickEmptySpec } from '../../js/sim/spec-rescue.js';
import { addBlob, lifeWorld } from './helpers/life-world.js';

describe('pickEmptySpec', () => {
    it('returns only specialisations with no alive agent, and reaches each of them', () => {
        const w = lifeWorld();
        [0, 2, 2].forEach((spec) => addBlob(w, { spec }));
        const rng = createRng(3);
        const seen = new Set();
        for (let i = 0; i < 80; i++) {
            seen.add(pickEmptySpec(w, 7, rng));
        }
        expect([...seen].sort()).toEqual([1, 3, 4]);
    });

    it('does not count the slot being seeded', () => {
        const w = lifeWorld();
        const slot = addBlob(w, { spec: 1 });
        const seen = new Set();
        const rng = createRng(4);
        for (let i = 0; i < 80; i++) {
            seen.add(pickEmptySpec(w, slot, rng));
        }
        expect(seen.size).toBe(SPEC_COUNT);
    });

    it('returns -1 and draws nothing when every specialisation has an agent', () => {
        const w = lifeWorld({ maxAgents: 8 });
        for (let spec = 0; spec < SPEC_COUNT; spec++) {
            addBlob(w, { spec });
        }
        const rng = createRng(5);
        const before = Array.from(rng.s);
        expect(pickEmptySpec(w, 7, rng)).toBe(-1);
        expect(Array.from(rng.s)).toEqual(before);
    });
});
