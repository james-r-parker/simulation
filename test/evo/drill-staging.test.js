import { describe, expect, it } from 'vitest';
import { createRng, fork } from '../../js/sim/rng.js';
import { killed, offset, preyDrill, stage, subjectAt } from '../../js/evo/drill-staging.js';
import { CENTRE_X, CENTRE_Y, HUNTER_ENERGY, SUBJECT_ENERGY } from '../../js/evo/memory-probe-scenarios.js';

const stream = (seed = 1) => fork(createRng(seed), 'drill:test');

describe('offset', () => {
    it('is within the degree range, of either sign', () => {
        const rng = stream();
        const signs = new Set();
        for (let i = 0; i < 60; i++) {
            const value = offset(rng, 60, 120);
            expect(Math.abs(value)).toBeGreaterThanOrEqual((60 * Math.PI) / 180 - 1e-9);
            expect(Math.abs(value)).toBeLessThanOrEqual((120 * Math.PI) / 180 + 1e-9);
            signs.add(Math.sign(value));
        }
        expect([...signs].sort()).toEqual([-1, 1]);
    });
});

describe('subjectAt and stage', () => {
    it('stages the subject at the arena centre with its specialisation energy', () => {
        expect(subjectAt(1, 0.5)).toEqual({
            role: 'subject',
            x: CENTRE_X,
            y: CENTRE_Y,
            angle: 0.5,
            spec: 1,
            energy: HUNTER_ENERGY,
        });
        expect(subjectAt(0, 0).energy).toBe(SUBJECT_ENERGY);
    });

    it('puts agents, foods and rocks in one stage, with no rocks by default', () => {
        expect(stage([{ role: 'subject' }], [{ x: 1, y: 2 }])).toEqual({
            foods: [{ x: 1, y: 2 }],
            rocks: [],
            agents: [{ role: 'subject' }],
        });
    });
});

describe('killed', () => {
    it('needs the prey dead and the subject credited with a deliberate kill', () => {
        const world = (/** @type {number} */ prey, /** @type {number} */ kills) =>
            /** @type {any} */ ({ alive: Uint8Array.of(1, prey), deliberateKills: Uint32Array.of(kills, 0) });
        expect([killed(world(0, 1)), killed(world(0, 0)), killed(world(1, 1))]).toEqual([true, false, false]);
    });
});

describe('preyDrill', () => {
    it('draws the prey heading after its place, from the stream, unless the drill says how', () => {
        const plain = preyDrill('a', { energy: 800, maxTicks: 10, abort: false }).plan(stream(), 300);
        const fixed = preyDrill('a', { energy: 800, maxTicks: 10, abort: false, preyAngle: () => 1.25 }).plan(
            stream(),
            300,
        );
        expect(fixed.stage.agents[1].angle).toBe(1.25);
        expect(fixed.stage.agents[1].x).toBe(plain.stage.agents[1].x);
        expect(plain.stage.agents[1].angle).not.toBe(1.25);
    });

    it('records a trace for a chase and none for an abort drill', () => {
        expect(preyDrill('a', { energy: 1, maxTicks: 1, abort: false }).plan(stream(), 300).trace).toBeTypeOf(
            'function',
        );
        expect(preyDrill('a', { energy: 1, maxTicks: 1, abort: true }).plan(stream(), 300).trace).toBeUndefined();
    });
});
