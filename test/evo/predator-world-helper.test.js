import { describe, expect, it } from 'vitest';
import { playPredatorWorld, predatorWorld, survivableWorld } from './helpers/predator-world.js';

/**
 * Counts the alive agents that are predators (spec 1) and the rest.
 * @param {any} world the world
 * @returns {{predators: number, prey: number}} the counts
 */
function census(world) {
    let predators = 0;
    let prey = 0;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            if (world.spec[slot] === 1) {
                predators++;
            } else {
                prey++;
            }
        }
    }
    return { predators, prey };
}

describe('playPredatorWorld layout options', () => {
    it('puts predators on even slots by default: half predators, half prey', () => {
        const { world } = playPredatorWorld(1, 1);
        const half = predatorWorld.initialAgents / 2;
        expect(census(world)).toEqual({ predators: half, prey: half });
    });

    it('puts predators on every fourth slot with predatorEvery 4', () => {
        const { world } = playPredatorWorld(1, 1, { predatorEvery: 4 });
        const n = predatorWorld.initialAgents;
        expect(census(world)).toEqual({ predators: n / 4, prey: (3 * n) / 4 });
    });

    it('takes the world file and applies config overrides on top of it', () => {
        const { world } = playPredatorWorld(1, 1, {
            world: survivableWorld,
            predatorEvery: 4,
            config: { maxFood: 170 },
        });
        expect(world.config.worldWidth).toBe(survivableWorld.worldWidth);
        expect(world.config.maxFood).toBe(170);
        expect(census(world).predators).toBe(survivableWorld.initialAgents / 4);
    });
});
