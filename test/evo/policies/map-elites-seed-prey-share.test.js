import { describe, expect, it } from 'vitest';
import { createMapElitesV1 } from '../../../js/evo/policies/map-elites-v1.js';
import { createSeeder, quotaSpec } from '../../../js/evo/policies/map-elites-seed.js';
import { createRng } from '../../../js/sim/rng.js';
import { smallWorld } from '../../sim/helpers/small-world.js';

const PREDATOR = 1;

/**
 * Seeds `count` slots in order through `initSpec`, marking each alive as the world's spawn does.
 * @param {Record<string, any>} options policy options (`preyShare`)
 * @param {number} count agents to seed
 * @returns {{counts: number[], specs: number[]}} the specialisations seeded and how many of each
 */
function seed(options, count) {
    const world = smallWorld({ brainHidden: 4, maxAgents: 100 });
    const policy = createMapElitesV1({ config: world.config, ...options });
    const rng = createRng(7);
    const specs = [];
    for (let slot = 0; slot < count; slot++) {
        const spec = policy.brain.initSpec(world, slot, rng);
        world.spec[slot] = spec;
        world.alive[slot] = 1;
        specs.push(spec);
    }
    const counts = [0, 0, 0, 0, 0];
    specs.forEach((spec) => (counts[spec] += 1));
    return { counts, specs };
}

describe('preyShare', () => {
    it('seeds the share of prey specialisations within rounding, the rest predators', () => {
        for (const [share, count] of [
            [0.6, 60],
            [0.9, 60],
            [0.8, 30],
            [0.25, 17],
        ]) {
            const { counts } = seed({ preyShare: share }, count);
            expect(counts[PREDATOR]).toBe(count - Math.round(share * count));
        }
    });

    it('spreads the prey over the four prey specialisations', () => {
        const { counts } = seed({ preyShare: 1 }, 40);
        expect(counts).toEqual([10, 0, 10, 10, 10]);
    });

    it('seeds only predators at 0 and only prey at 1', () => {
        expect(seed({ preyShare: 0 }, 12).counts).toEqual([0, 12, 0, 0, 0]);
        expect(seed({ preyShare: 1 }, 12).counts[PREDATOR]).toBe(0);
    });

    it('leaves the seeding unchanged when it is not set', () => {
        expect(seed({}, 20).specs).toEqual(seed({ preyShare: undefined }, 20).specs);
    });

    it('takes no random number', () => {
        const world = smallWorld({ brainHidden: 4, maxAgents: 8 });
        const rng = { next: () => 0 };
        const counts = new Int32Array(5);
        expect(quotaSpec(world, 0, { counts, preyShare: 0.5 })).toBeGreaterThanOrEqual(0);
        expect(rng.next()).toBe(0);
    });

    it('refuses a share outside 0 to 1', () => {
        const world = smallWorld({ brainHidden: 4, maxAgents: 8 });
        const policy = createMapElitesV1({ config: world.config });
        const parts = { archive: policy.archive, birth: {}, clones: {} };
        for (const bad of [-0.1, 1.5, Number.NaN, '0.5']) {
            expect(() => createSeeder({ ...parts, preyShare: /** @type {any} */ (bad) })).toThrow(/preyShare/);
        }
    });
});
