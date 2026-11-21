import { describe, expect, it } from 'vitest';
import { BODY_INPUT, CH_PREY, OUTPUT_INDEX, RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { createReflexWorld } from '../../js/evo/reflex-eval.js';
import {
    GO_THRUST,
    closeOnPrey,
    heardLoudness,
    heardSide,
    nearness,
    pooledAt,
    pooledValues,
    sprintOnPrey,
} from '../../js/evo/reflex-references-parts.js';

/** @returns {Record<string, any>} a one-slot world with every raw input 0 */
function blank() {
    const world = createReflexWorld({}, 1, 1);
    world.inputs.fill(0);
    return world;
}

describe('the reads', () => {
    it('read a ray nearness and a heard call of either half', () => {
        const world = blank();
        const body = world.config.rayCount * RAY_CHANNELS;
        world.inputs[3 * RAY_CHANNELS] = 0.7;
        world.inputs[body + BODY_INPUT.HEARD_HUNT] = 1;
        world.inputs[body + BODY_INPUT.HEARD_HUNT + 2] = -1;
        expect(nearness(world, 0, 3)).toBeCloseTo(0.7, 6);
        expect([heardLoudness(world, 0), heardSide(world, 0)]).toEqual([0, 0]);
        const hunt = BODY_INPUT.HEARD_HUNT;
        expect([heardLoudness(world, 0, hunt), heardSide(world, 0, hunt)]).toEqual([1, -1]);
        expect(GO_THRUST).toBeGreaterThan(0.3);
    });

    it('pool the rays and read pooled values at offsets the layout names', () => {
        const world = blank();
        world.inputs[2 * RAY_CHANNELS] = 0.5;
        world.inputs[2 * RAY_CHANNELS + CH_PREY] = 0.5;
        const { pooled, sense, count } = pooledAt(world);
        const [strength, shareThreat] = pooledValues(world, 0, [pooled.prey, count]);
        expect(strength).toBeCloseTo(0.5, 6);
        expect(shareThreat).toBe(0);
        expect(count).toBeGreaterThan(sense);
    });
});

describe('closeOnPrey and sprintOnPrey', () => {
    it('stand still with no prey, and go with a sprint graded by nearness when there is one', () => {
        const world = blank();
        expect(closeOnPrey(world, 0)).toBe(-1);
        expect(world.outputs[OUTPUT_INDEX.THRUST]).toBe(0);
        world.inputs[0] = 0.2;
        world.inputs[CH_PREY] = 0.2;
        sprintOnPrey(world, 0);
        const far = world.outputs[OUTPUT_INDEX.SPRINT];
        world.inputs[0] = 0.4;
        world.inputs[CH_PREY] = 0.4;
        sprintOnPrey(world, 0);
        expect(world.outputs[OUTPUT_INDEX.THRUST]).toBe(1);
        expect(world.outputs[OUTPUT_INDEX.SPRINT]).toBeGreaterThan(far);
    });
});
