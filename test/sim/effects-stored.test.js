// A stored effect, end to end: with one effect that keeps stacks in the registry, its rows are declared by `agentSpecs`
// (hashed, no kernel), allocated with the world, covered by `worldHash` and zeroed when the slot frees.

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../js/sim/effect-list.js', async (importOriginal) => {
    const original = /** @type {{EFFECTS: readonly object[]}} */ (await importOriginal());
    const rallied = {
        name: 'rallied',
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
    return { EFFECTS: Object.freeze([...original.EFFECTS, rallied]) };
});

const { HASHED_AGENT_ARRAYS, agentArrayInfo, ownerOf } = await import('../../js/sim/agent-arrays.js');
const { applyEffect } = await import('../../js/sim/effect-appliers.js');
const { EFFECT, fadeEffects } = await import('../../js/sim/effects.js');
const { hashWorld } = await import('../../js/sim/world-hash.js');
const { allocBody } = await import('./helpers/body.js');
const { smallWorld } = await import('./helpers/small-world.js');
const { freeAgent } = await import('../../js/sim/world.js');

describe('a stored effect in the registry', () => {
    it('declares its rows in agentSpecs: hashed after the fixed rows, taken by no kernel', () => {
        const stacks = agentArrayInfo('effect.rallied.stacks');
        const ticks = agentArrayInfo('effect.rallied.ticks');
        expect([stacks?.hashed, ticks?.hashed]).toEqual([41, 42]);
        expect(stacks?.kernels).toEqual([]);
        expect(ownerOf('effect.rallied.stacks')).toBeUndefined();
        expect(HASHED_AGENT_ARRAYS.slice(-2)).toEqual(['effect.rallied.stacks', 'effect.rallied.ticks']);
    });

    it('allocates the rows with the world and hashes them', () => {
        const world = smallWorld({ maxAgents: 4 });
        expect(world.effectStacks[0]).toBe(world['effect.rallied.stacks']);
        const slot = allocBody(world, 0);
        const before = hashWorld(world);
        expect(applyEffect(world, slot, EFFECT.RALLIED, 0)).toBe(true);
        const stacked = hashWorld(world);
        expect(stacked).not.toBe(before);
        world['effect.rallied.ticks'][slot] += 1;
        expect(hashWorld(world)).not.toBe(stacked);
    });

    it('zeroes the stacks and the timer when the slot frees, and fades them with the phase', () => {
        const world = smallWorld({ maxAgents: 4, callTicks: 2 });
        const slot = allocBody(world, 0);
        world.alive[slot] = 1;
        applyEffect(world, slot, EFFECT.RALLIED, 0);
        applyEffect(world, slot, EFFECT.RALLIED, 0);
        expect([world['effect.rallied.stacks'][slot], world['effect.rallied.ticks'][slot]]).toEqual([2, 2]);
        fadeEffects(world);
        expect(world['effect.rallied.stacks'][slot]).toBe(2);
        fadeEffects(world);
        expect(world['effect.rallied.stacks'][slot]).toBe(0);
        applyEffect(world, slot, EFFECT.RALLIED, 0);
        freeAgent(world, slot);
        expect([world['effect.rallied.stacks'][slot], world['effect.rallied.ticks'][slot]]).toEqual([0, 0]);
    });
});
