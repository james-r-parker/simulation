import { describe, expect, it } from 'vitest';
import { RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { senseAll } from '../../js/sim/sensors.js';
import { addAgent, addFood, rebuild, senseWorld } from './helpers/sense-world.js';

describe('senseAll', () => {
    it('fills the ray block and body inputs of every alive agent and leaves dead rows alone', () => {
        const w = senseWorld();
        const a = addAgent(w, 500, 500, 20);
        const b = addAgent(w, 900, 200, 20);
        addFood(w, 600, 500, 20);
        w.energy[a] = w.config.maxEnergy;
        w.energy[b] = w.config.maxEnergy;
        const dead = 5;
        w.inputs.fill(7, dead * w.layout.inputCount, (dead + 1) * w.layout.inputCount);
        senseAll(w, rebuild(w));
        const { inputCount } = w.layout;
        const rayEnd = w.config.rayCount * RAY_CHANNELS;
        expect(w.inputs[a * inputCount + 1]).toBe(1);
        expect(w.inputs[b * inputCount + 6]).toBe(1);
        expect(w.inputs[a * inputCount + rayEnd]).toBe(1);
        expect(w.inputs[b * inputCount + rayEnd]).toBe(1);
        const row = w.inputs.subarray(dead * inputCount, (dead + 1) * inputCount);
        expect(Array.from(row).every((v) => v === 7)).toBe(true);
    });
});
