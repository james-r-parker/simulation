import { describe, expect, it } from 'vitest';
import { BORN_CAUSE, EVENT_TYPE, pushEvent } from '../../js/sim/events.js';
import { createGenerations, generationOf, noteBirths } from '../../js/worker/generation.js';
import { smallWorld } from '../sim/helpers/small-world.js';

/**
 * Pushes an `AgentBorn` record.
 * @param {ReturnType<typeof smallWorld>} world the world
 * @param {{slot: number, genomeId: number, parentA?: number, parentB?: number, cause: number}} born the newborn
 * @returns {void}
 */
function born(world, { slot, genomeId, parentA = 0, parentB = 0, cause }) {
    const o = pushEvent(world.events, EVENT_TYPE.AGENT_BORN, 1);
    const d = world.events.data;
    d[o + 2] = slot;
    d[o + 3] = genomeId;
    d[o + 6] = parentA;
    d[o + 7] = parentB;
    d[o + 8] = cause;
}

describe('noteBirths', () => {
    it('gives initial, floor and immigrant births generation 0, whatever the slot held', () => {
        const world = smallWorld();
        const gens = createGenerations(world.config);
        gens.depth.fill(5);
        born(world, { slot: 0, genomeId: 1, cause: BORN_CAUSE.INITIAL });
        born(world, { slot: 1, genomeId: 2, cause: BORN_CAUSE.FLOOR });
        born(world, { slot: 2, genomeId: 3, cause: BORN_CAUSE.IMMIGRANT });
        noteBirths(gens, world, new Map());
        expect([0, 1, 2].map((slot) => generationOf(gens, slot))).toEqual([0, 0, 0]);
    });

    it('makes a mate child one deeper than its deeper parent', () => {
        const world = smallWorld();
        const gens = createGenerations(world.config);
        gens.depth[0] = 2;
        gens.depth[1] = 4;
        born(world, { slot: 3, genomeId: 9, parentA: 10, parentB: 11, cause: BORN_CAUSE.MATE });
        noteBirths(
            gens,
            world,
            new Map([
                [10, 0],
                [11, 1],
            ]),
        );
        expect(generationOf(gens, 3)).toBe(5);
    });

    it('makes a split child one deeper than its single parent', () => {
        const world = smallWorld();
        const gens = createGenerations(world.config);
        gens.depth[0] = 3;
        born(world, { slot: 2, genomeId: 9, parentA: 10, parentB: 10, cause: BORN_CAUSE.SPLIT });
        noteBirths(gens, world, new Map([[10, 0]]));
        expect(generationOf(gens, 2)).toBe(4);
    });

    it('counts a parent that is not found as depth 0', () => {
        const world = smallWorld();
        const gens = createGenerations(world.config);
        gens.depth[0] = 6;
        born(world, { slot: 2, genomeId: 9, parentA: 10, parentB: 77, cause: BORN_CAUSE.MATE });
        noteBirths(gens, world, new Map([[10, 0]]));
        expect(generationOf(gens, 2)).toBe(7);
        born(world, { slot: 4, genomeId: 12, parentA: 78, parentB: 77, cause: BORN_CAUSE.MATE });
        noteBirths(gens, world, new Map());
        expect(generationOf(gens, 4)).toBe(1);
    });

    it('reads every parent before any newborn overwrites its slot', () => {
        const world = smallWorld();
        const gens = createGenerations(world.config);
        gens.depth[0] = 4;
        born(world, { slot: 0, genomeId: 20, cause: BORN_CAUSE.FLOOR });
        born(world, { slot: 1, genomeId: 21, parentA: 10, parentB: 10, cause: BORN_CAUSE.SPLIT });
        noteBirths(gens, world, new Map([[10, 0]]));
        expect(generationOf(gens, 0)).toBe(0);
        expect(generationOf(gens, 1)).toBe(5);
    });

    it('leaves slots without a birth this tick unchanged', () => {
        const world = smallWorld();
        const gens = createGenerations(world.config);
        gens.depth[5] = 3;
        noteBirths(gens, world, new Map());
        expect(generationOf(gens, 5)).toBe(3);
    });
});
