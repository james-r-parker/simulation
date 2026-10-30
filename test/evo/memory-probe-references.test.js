import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX, RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { REFERENCES, referenceSubject } from '../../js/evo/memory-probe-references.js';
import { stageWorld } from '../../js/evo/pool-discrimination-stage.js';
import { CH_FOOD } from '../../js/evo/scripted-parts.js';

/**
 * Runs a reference once on a staged agent whose rays and memory read-back are set by hand.
 * @param {string} kind the reference
 * @param {{food?: boolean, memory?: number}} senses food seen straight ahead (ray 0), and the memory read-back
 * @returns {Float32Array} the agent's outputs
 */
function outputsFor(kind, { food = false, memory = 0 }) {
    const { world } = stageWorld({
        foods: [],
        rocks: [],
        agents: [{ x: 1500, y: 2000, angle: 0, spec: 0, energy: 800 }],
        seed: 1,
    });
    world.inputs.fill(0);
    if (food) {
        world.inputs[0] = 0.8;
        world.inputs[CH_FOOD] = 1;
    }
    world.inputs[world.config.rayCount * RAY_CHANNELS + 31] = memory;
    referenceSubject(kind).act?.(world);
    return world.outputs.slice(0, OUTPUT_COUNT);
}

describe('referenceSubject', () => {
    it('knows the memoryless and the memory-storing reference and rejects other names', () => {
        expect(REFERENCES).toEqual(['memoryless', 'memory-storing']);
        expect(() => referenceSubject('lucky')).toThrow(
            'reference: expected one of memoryless, memory-storing, got "lucky"',
        );
    });

    it('takes the specialisation of the scenario it runs in', () => {
        expect(referenceSubject('memoryless').spec).toBeNull();
    });

    it('stores the target in MEMORY_A when it sees food, and the memoryless one never does', () => {
        expect(outputsFor('memory-storing', { food: true })[OUTPUT_INDEX.MEMORY_A]).toBe(1);
        expect(outputsFor('memoryless', { food: true })[OUTPUT_INDEX.MEMORY_A]).toBe(0);
    });

    it('keeps going when the stored target is read back with nothing in view, and the memoryless one backs off', () => {
        const kept = outputsFor('memory-storing', { memory: 1 });
        expect(kept[OUTPUT_INDEX.THRUST]).toBeGreaterThan(0);
        expect(kept[OUTPUT_INDEX.MEMORY_A]).toBe(1);
        expect(outputsFor('memoryless', { memory: 1 })[OUTPUT_INDEX.THRUST]).toBeLessThan(0);
    });

    it('backs off with nothing stored and nothing in view', () => {
        expect(outputsFor('memory-storing', {})[OUTPUT_INDEX.THRUST]).toBeLessThan(0);
        expect(outputsFor('memory-storing', {})[OUTPUT_INDEX.MEMORY_A]).toBe(0);
    });
});
