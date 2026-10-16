import { describe, expect, it } from 'vitest';
import { checkpoint, diversity } from '../../js/evo/observer-checkpoint.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

/**
 * @param {any} world the world
 * @param {number[]} lineages one lineage id per new agent
 * @returns {void}
 */
function addLineages(world, lineages) {
    for (const lineageId of lineages) {
        addBlob(world, { lineageId });
    }
}

/**
 * Removes an agent from the world's alive set.
 * @param {any} world the world
 * @param {number} slot the slot
 * @returns {void}
 */
function remove(world, slot) {
    world.alive[slot] = 0;
    world.population -= 1;
}

describe('checkpoint', () => {
    it('records tick, population, lineages and predator share', () => {
        const { world, observer } = observed();
        addLineages(world, [5, 5, 6]);
        world.spec[1] = 1;
        world.tick = 1000;
        checkpoint(observer, world);
        const s = observer.series;
        expect(observer.checkpointCount).toBe(1);
        expect([s.tick[0], s.population[0], s.lineagesAlive[0]]).toEqual([1000, 3, 2]);
        expect(s.predatorShare[0]).toBeCloseTo(1 / 3, 12);
    });

    it('makes a lineage dominant only when it leads by at least 2', () => {
        const { world, observer } = observed();
        addLineages(world, [5, 5, 6]);
        checkpoint(observer, world);
        expect(observer.series.dominantLineage[0]).toBe(0);
        addLineages(world, [5]);
        checkpoint(observer, world);
        expect(observer.series.dominantLineage[1]).toBe(5);
    });

    it('keeps the previous dominant on a tie or a margin of 1', () => {
        const { world, observer } = observed();
        addLineages(world, [5, 5, 5, 6]);
        checkpoint(observer, world);
        expect(observer.series.dominantLineage[0]).toBe(5);
        addLineages(world, [6, 6]);
        checkpoint(observer, world);
        expect(observer.series.dominantLineage[1]).toBe(5);
        addLineages(world, [6]);
        checkpoint(observer, world);
        expect(observer.series.dominantLineage[2]).toBe(5);
        addLineages(world, [6]);
        checkpoint(observer, world);
        expect(observer.series.dominantLineage[3]).toBe(6);
        remove(world, 3);
        remove(world, 4);
        checkpoint(observer, world);
        expect(observer.series.dominantLineage[4]).toBe(6);
    });

    it('records a predator share of 0 and NaN diversity for an empty world', () => {
        const { world, observer } = observed();
        checkpoint(observer, world);
        expect(observer.series.predatorShare[0]).toBe(0);
        expect(observer.series.diversity[0]).toBeNaN();
    });

    it('grows the series past 64 checkpoints', () => {
        const { world, observer } = observed();
        for (let i = 0; i < 65; i++) {
            world.tick = (i + 1) * 1000;
            checkpoint(observer, world);
        }
        expect(observer.series.capacity).toBe(128);
        expect(observer.series.tick[64]).toBe(65000);
    });
});

describe('diversity', () => {
    it('is NaN under 2 agents', () => {
        const { world, observer } = observed();
        expect(diversity(observer, world)).toBeNaN();
        addBlob(world);
        expect(diversity(observer, world)).toBeNaN();
    });

    it('is the pairwise L2 distance over sqrt(weightCount) for two agents', () => {
        const { world, observer } = observed();
        const a = addBlob(world);
        addBlob(world);
        const n = world.layout.weightCount;
        world.weights[a * n] = 3;
        world.weights[a * n + 1] = 4;
        expect(diversity(observer, world)).toBeCloseTo(5 / Math.sqrt(n), 6);
    });

    it('is the mean over all pairs for three agents', () => {
        const { world, observer } = observed();
        const slots = [addBlob(world), addBlob(world), addBlob(world)];
        const n = world.layout.weightCount;
        world.weights[slots[1] * n] = 1;
        world.weights[slots[2] * n] = 4;
        expect(diversity(observer, world)).toBeCloseTo((1 + 4 + 3) / 3 / Math.sqrt(n), 6);
    });

    it('is deterministic for a given rng and samples at most 64 agents', () => {
        const over = { maxAgents: 80, maxFood: 4, initialFood: 0 };
        const run = () => {
            const { world, observer } = observed(over);
            for (let i = 0; i < 80; i++) {
                const slot = addBlob(world);
                world.weights[slot * world.layout.weightCount + (i % 7)] = i * 0.1;
            }
            return diversity(observer, world);
        };
        const first = run();
        expect(first).toBeGreaterThan(0);
        expect(run()).toBe(first);
    });
});
