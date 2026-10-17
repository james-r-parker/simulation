import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { RANDOM_ARM, assertArm, createControllerBrain } from '../../js/evo/controller-brain.js';
import { createRng } from '../../js/sim/rng.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

describe('assertArm', () => {
    it('accepts random and scripted controllers, and names the known ones for anything else', () => {
        expect(() => assertArm(RANDOM_ARM)).not.toThrow();
        expect(() => assertArm('cruiser')).not.toThrow();
        expect(() => assertArm('nope')).toThrow(/Unknown controller "nope"; known: random/);
    });
});

describe('createControllerBrain', () => {
    it('runs one arm on every agent', () => {
        const { world } = observed();
        const slot = addBlob(world, { spec: 0 });
        createControllerBrain(world, createRng(1), 'jawSitter')(world);
        expect(world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.BITE]).toBe(1);
    });

    it('runs each arm on its own group: hunters and the rest', () => {
        const { world } = observed();
        const forager = addBlob(world, { spec: 0 });
        const predator = addBlob(world, { spec: 1 });
        createControllerBrain(world, createRng(1), { canHunt: 'jawSitter', rest: 'cruiser' })(world);
        expect(world.outputs[predator * OUTPUT_COUNT + OUTPUT_INDEX.BITE]).toBe(1);
        expect(world.outputs[forager * OUTPUT_COUNT + OUTPUT_INDEX.BITE]).toBe(0);
        expect(world.outputs[forager * OUTPUT_COUNT + OUTPUT_INDEX.THRUST]).toBeGreaterThan(0);
    });

    it('leaves the random arm to its own brain outputs', () => {
        const { world } = observed();
        const forager = addBlob(world, { spec: 0 });
        const predator = addBlob(world, { spec: 1 });
        createControllerBrain(world, createRng(1), { canHunt: 'jawSitter', rest: RANDOM_ARM })(world);
        expect(world.outputs[predator * OUTPUT_COUNT + OUTPUT_INDEX.BITE]).toBe(1);
        expect(world.outputs[forager * OUTPUT_COUNT + OUTPUT_INDEX.BITE]).not.toBe(1);
    });
});
