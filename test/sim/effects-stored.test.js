// A stored effect, end to end: with one effect that keeps stacks in the registry, its rows are declared by `agentSpecs`
// (hashed, no kernel), allocated with the world, covered by `worldHash` and zeroed when the slot frees.

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../js/sim/effect-list.js', async (importOriginal) => {
    const original = /** @type {{EFFECTS: readonly object[]}} */ (await importOriginal());
    const trial = {
        name: 'trial',
        family: 'social',
        maxStacks: 3,
        level: 'stacks',
        fades: { kind: 'ticks', key: 'callTicks' },
        scales: [],
        gates: [],
        drains: [],
        applier: 'test',
        visible: true,
    };
    return { EFFECTS: Object.freeze([...original.EFFECTS, trial]) };
});

const { EFFECT_AGENT_ARRAYS, HASHED_AGENT_ARRAYS, agentArrayInfo, ownerOf } =
    await import('../../js/sim/agent-arrays.js');
const { applyEffect } = await import('../../js/sim/effect-appliers.js');
const { EFFECT, fadeEffects } = await import('../../js/sim/effects.js');
const { hashWorld } = await import('../../js/sim/world-hash.js');
const { allocBody } = await import('./helpers/body.js');
const { smallWorld } = await import('./helpers/small-world.js');
const { freeAgent } = await import('../../js/sim/world.js');

describe('a stored effect in the registry', () => {
    it('declares its rows in agentSpecs: hashed with a social effect on, taken by no kernel', () => {
        const stacks = agentArrayInfo('effect.trial.stacks');
        const ticks = agentArrayInfo('effect.trial.ticks');
        expect([stacks?.hashed, ticks?.hashed]).toEqual(['effects', 'effects']);
        expect(stacks?.kernels).toBeUndefined();
        expect(ownerOf('effect.trial.stacks')).toBeUndefined();
        expect(EFFECT_AGENT_ARRAYS).toContain('effect.trial.stacks');
        expect(EFFECT_AGENT_ARRAYS).toContain('effect.trial.ticks');
        expect(HASHED_AGENT_ARRAYS).not.toContain('effect.trial.stacks');
    });

    it('leaves the rows out of the hash while every social number is 0, so a neutral world hashes as before', () => {
        const world = smallWorld({ maxAgents: 4 });
        const slot = allocBody(world, 0);
        const before = hashWorld(world);
        applyEffect(world, slot, EFFECT.TRIAL, 0);
        world['effect.trial.ticks'][slot] += 1;
        expect(hashWorld(world)).toBe(before);
    });

    it('allocates the rows with the world and hashes them once a social number is above 0', () => {
        const world = smallWorld({ maxAgents: 4, woundThrust: 0.1 });
        expect(world.effectStacks.at(-1)).toBe(world['effect.trial.stacks']);
        const slot = allocBody(world, 0);
        const before = hashWorld(world);
        expect(applyEffect(world, slot, EFFECT.TRIAL, 0)).toBe(true);
        const stacked = hashWorld(world);
        expect(stacked).not.toBe(before);
        world['effect.trial.ticks'][slot] += 1;
        expect(hashWorld(world)).not.toBe(stacked);
    });

    it('zeroes the stacks and the timer when the slot frees, and fades them with the phase', () => {
        const world = smallWorld({ maxAgents: 4, callTicks: 2 });
        const slot = allocBody(world, 0);
        world.alive[slot] = 1;
        applyEffect(world, slot, EFFECT.TRIAL, 0);
        applyEffect(world, slot, EFFECT.TRIAL, 0);
        expect([world['effect.trial.stacks'][slot], world['effect.trial.ticks'][slot]]).toEqual([2, 2]);
        fadeEffects(world);
        expect(world['effect.trial.stacks'][slot]).toBe(2);
        fadeEffects(world);
        expect(world['effect.trial.stacks'][slot]).toBe(0);
        applyEffect(world, slot, EFFECT.TRIAL, 0);
        freeAgent(world, slot);
        expect([world['effect.trial.stacks'][slot], world['effect.trial.ticks'][slot]]).toEqual([0, 0]);
    });
});
