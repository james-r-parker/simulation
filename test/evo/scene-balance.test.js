import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import {
    BASIN_MIN_ALIVE,
    balanceMetrics,
    createBalanceScene,
    inverseSimpson,
    sampleBalance,
} from '../../js/evo/scene-balance.js';

const CONFIG = createConfig({ worldWidth: 4000 });
const SPEC = Object.fromEntries(Object.entries(CONFIG.specialisations).map(([name, s]) => [name, s.index]));

/**
 * A hand-built world: one alive agent per entry, west (x 1000) or east (x 3000) of the middle line.
 * @param {{basin: number, lineage: number, spec?: number}[]} agents the alive agents
 * @param {number} tick the world's tick
 * @returns {Record<string, any>} the world
 */
function handWorld(agents, tick) {
    const n = agents.length + 2;
    const world = {
        config: CONFIG,
        tick,
        alive: new Uint8Array(n),
        x: new Float32Array(n),
        lineageId: new Uint32Array(n),
        spec: new Uint8Array(n),
    };
    agents.forEach((a, slot) => {
        world.alive[slot] = 1;
        world.x[slot] = a.basin === 0 ? 1000 : 3000;
        world.lineageId[slot] = a.lineage;
        world.spec[slot] = a.spec ?? SPEC.forager;
    });
    world.x[n - 1] = 1000; // a dead slot, which counts for nothing
    world.lineageId[n - 1] = 99;
    return world;
}

/**
 * @param {number} basin 0 or 1
 * @param {number[]} sizes the agents in each lineage
 * @returns {{basin: number, lineage: number}[]} the agents
 */
function families(basin, sizes) {
    return sizes.flatMap((size, i) => Array.from({ length: size }, () => ({ basin, lineage: basin * 100 + i + 1 })));
}

describe('inverseSimpson', () => {
    it('is the count of equal lineages, fewer when one dominates, and 0 for none', () => {
        expect(
            inverseSimpson(
                new Map([
                    [1, 5],
                    [2, 5],
                    [3, 5],
                ]),
            ),
        ).toBeCloseTo(3, 12);
        expect(
            inverseSimpson(
                new Map([
                    [1, 18],
                    [2, 1],
                    [3, 1],
                ]),
            ),
        ).toBeCloseTo(400 / 326, 12);
        expect(inverseSimpson(new Map())).toBe(0);
    });
});

describe('the end state', () => {
    it('counts the alive hunters and the prey specialisations with an alive agent at the last tick', () => {
        const world = handWorld(
            [
                { basin: 0, lineage: 1, spec: SPEC.predator },
                { basin: 1, lineage: 2, spec: SPEC.predator },
                { basin: 0, lineage: 3, spec: SPEC.forager },
                { basin: 1, lineage: 4, spec: SPEC.forager },
                { basin: 1, lineage: 5, spec: SPEC.scout },
            ],
            200000,
        );
        const metrics = balanceMetrics(createBalanceScene(), world);
        expect(metrics['eval.predators_at_end']).toEqual({ value: 2 });
        expect(metrics['eval.prey_types_at_end']).toEqual({ value: 2 });
    });

    it('reads 0 hunters after a bust, and null without a world', () => {
        const busted = balanceMetrics(createBalanceScene(), handWorld(families(0, [3]), 1000));
        expect(busted['eval.predators_at_end']).toEqual({ value: 0 });
        expect(busted['eval.prey_types_at_end']).toEqual({ value: 1 });
        const bare = balanceMetrics(createBalanceScene(), {});
        expect(bare['eval.predators_at_end'].value).toBeNull();
        expect(bare['eval.predators_at_end'].reason).toBeTypeOf('string');
    });
});

describe('families per basin', () => {
    it('takes the smaller basin mean over the last quarter, skipping basins under BASIN_MIN_ALIVE', () => {
        const scene = createBalanceScene();
        // Early on the west is richer than anything late; only the last quarter (ticks 3000 and 4000) counts.
        sampleBalance(scene, handWorld([...families(0, [5, 5, 5, 5, 5, 5]), ...families(1, [20])], 1000));
        sampleBalance(scene, handWorld([...families(0, [10, 10, 10, 10]), ...families(1, [10, 10])], 3000));
        sampleBalance(scene, handWorld([...families(0, [10, 10, 10, 10]), ...families(1, [10, 10, 10, 10])], 4000));
        const metrics = balanceMetrics(scene, { tick: 4000 });
        expect(metrics['eval.basin_lineages_alive'].value).toBeCloseTo(3, 12);
        expect(metrics['eval.basin_lineage_effective'].value).toBeCloseTo(3, 12);
    });

    it('reads the one basin when only one qualifies, and null when none does', () => {
        const one = createBalanceScene();
        sampleBalance(one, handWorld([...families(0, [10, 10]), ...families(1, [BASIN_MIN_ALIVE - 1])], 1000));
        expect(balanceMetrics(one, { tick: 1000 })['eval.basin_lineages_alive']).toEqual({ value: 2 });
        const empty = createBalanceScene();
        sampleBalance(empty, handWorld(families(0, [5]), 1000));
        const metric = balanceMetrics(empty, { tick: 1000 })['eval.basin_lineage_effective'];
        expect(metric.value).toBeNull();
        expect(metric.reason).toBeTypeOf('string');
    });

    it('ignores dead slots', () => {
        const scene = createBalanceScene();
        sampleBalance(scene, handWorld(families(0, [BASIN_MIN_ALIVE]), 1000));
        expect(balanceMetrics(scene, { tick: 1000 })['eval.basin_lineages_alive']).toEqual({ value: 1 });
    });
});
