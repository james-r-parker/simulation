import { describe, expect, it } from 'vitest';
import { brainLayout, OUTPUT_INDEX, TRAIT_INDEX } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { arenaConfig, playTrial, viewOf } from '../../js/evo/memory-probe-run.js';

/**
 * @param {Record<string, any>} [over] fields of the plan to replace
 * @returns {any} a one-subject plan that stops after five ticks
 */
function plan(over = {}) {
    return {
        stage: {
            foods: [],
            rocks: [],
            agents: [{ role: 'subject', x: 1500, y: 2000, angle: 0, spec: 0, energy: 800 }],
        },
        timing: null,
        scent: false,
        maxTicks: 5,
        done: () => false,
        won: () => true,
        ...over,
    };
}

describe('arenaConfig', () => {
    it('restores the rules a genome depends on over the arena knobs and keeps the overrides', () => {
        const base = createConfig({ rayCount: 24 });
        const arena = arenaConfig({ rayCount: 24 });
        expect(arena).toMatchObject({
            rayCount: 24,
            hebbianRate: base.hebbianRate,
            alarmThreshold: base.alarmThreshold,
            huntCallThreshold: base.huntCallThreshold,
        });
    });
});

describe('viewOf', () => {
    it('is the specialisation range times the vision trait', () => {
        const config = createConfig({});
        const weights = new Float32Array(brainLayout(config).weightCount);
        expect(viewOf({ spec: 0, weights: null }, config)).toBe(300);
        expect(viewOf({ spec: 1, weights }, config)).toBe(350);
        weights[brainLayout(config).traitStart + TRAIT_INDEX.VISION] = 10;
        expect(viewOf({ spec: 0, weights }, config)).toBeGreaterThan(300 * 1.29);
    });
});

describe('playTrial', () => {
    it('gives the subject the genome as its brain, its specialisation and kin parents', () => {
        const config = createConfig({});
        const weights = new Float32Array(brainLayout(config).weightCount).fill(0.01);
        /** @type {any} */
        let seen = null;
        const spec = { name: 'g', id: 5, spec: 1, weights, act: null };
        const p = plan({
            stage: {
                foods: [],
                rocks: [],
                agents: [{ role: 'subject', x: 1500, y: 2000, angle: 0, spec: 0, energy: 800, parents: [9, 0] }],
            },
            done: (/** @type {any} */ w) => {
                seen = w;
                return true;
            },
        });
        playTrial({ plan: p, subject: spec, controlSpec: { name: 'intact' }, seed: 1, config: {} });
        expect(seen.spec[0]).toBe(1);
        expect(seen.parentA[0]).toBe(9);
        expect(Array.from(seen.weights.subarray(0, 4))).toEqual([0.01, 0.01, 0.01, 0.01].map(Math.fround));
    });

    it('runs a reference controller in place of the brain and returns the plan outcome', () => {
        let ticks = 0;
        const subject = {
            name: 'r',
            id: 0,
            spec: null,
            weights: null,
            act: () => {
                ticks += 1;
            },
        };
        const won = playTrial({ plan: plan(), subject, controlSpec: { name: 'intact' }, seed: 1, config: {} });
        expect(won).toBe(true);
        expect(ticks).toBe(5);
    });

    it('stops as soon as the plan is done', () => {
        let ticks = 0;
        const subject = { name: 'r', id: 0, spec: null, weights: null, act: () => (ticks += 1) };
        const p = plan({ done: (/** @type {any} */ w) => w.tick >= 2 });
        playTrial({ plan: p, subject, controlSpec: { name: 'intact' }, seed: 1, config: {} });
        expect(ticks).toBe(2);
    });

    it.each([
        ['intact', {}, 1],
        ['amnesia', { amnesia: true }, 0],
    ])('with the %s control the controller reads the memory it wrote last tick as %i', (name, extra, expected) => {
        /** @type {number[]} */
        const seen = [];
        const subject = {
            name: 'r',
            id: 0,
            spec: null,
            weights: null,
            act: (/** @type {any} */ w) => {
                seen.push(w.inputs[w.layout.rawInputCount - 2]);
                w.outputs[OUTPUT_INDEX.MEMORY_A] = 1;
            },
        };
        const p = plan({ maxTicks: 2 });
        playTrial({ plan: p, subject, controlSpec: { name, ...extra }, seed: 1, config: {} });
        expect(seen).toEqual([0, expected]);
    });
});
