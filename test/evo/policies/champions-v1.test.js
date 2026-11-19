import { describe, expect, it } from 'vitest';
import { encodeWeights } from '../../../js/evo/base64.js';
import { SIGMA_START } from '../../../js/evo/mutation.js';
import { createChampionsV1 } from '../../../js/evo/policies/champions-v1.js';
import { POLICIES } from '../../../js/evo/policies/index.js';
import { createMapElitesV6 } from '../../../js/evo/policies/map-elites-v6.js';
import { brainLayout } from '../../../js/sim/brain-layout.js';
import { createSimLog } from '../../../js/sim/log.js';
import { createRng } from '../../../js/sim/rng.js';
import { smallWorld } from '../../sim/helpers/small-world.js';
import { makeChampionFileFor } from '../helpers/champion-file.js';
import { fill } from '../helpers/map-elites-world.js';

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @param {number} spec the specialisation
 * @param {number} value every weight
 * @returns {Record<string, any>} a champion file with every weight `value`
 */
function flatChampion(config, spec, value) {
    const file = makeChampionFileFor(config, `flat-${spec}`, 1, { specialisation: spec });
    const weights = new Float32Array(brainLayout(config).weightCount).fill(value);
    return { ...file, weights: encodeWeights(weights) };
}

/**
 * @param {Record<string, any>} [extra] policy options
 * @returns {{world: any, records: any[], make: (options?: Record<string, any>) => any}} a small world and a factory
 */
function rig(extra = {}) {
    const world = smallWorld({ brainHidden: 4, maxAgents: 8 });
    /** @type {any[]} */
    const records = [];
    const log = createSimLog((r) => records.push(r), { level: 'debug' });
    return {
        world,
        records,
        make: (options = {}) => createChampionsV1({ config: world.config, log, ...extra, ...options }),
    };
}

const mean = (/** @type {ArrayLike<number>} */ row) => Array.from(row).reduce((a, b) => a + b, 0) / row.length;

/**
 * @param {any} world the world
 * @param {number} slot the slot
 * @returns {Float32Array} a copy of the slot's weight row
 */
function rowOf(world, slot) {
    const n = world.layout.weightCount;
    return Float32Array.from(world.weights.subarray(slot * n, (slot + 1) * n));
}

describe('champions-v1', () => {
    it('is registered and named champions-v1, with the live policy scoring', () => {
        const { world } = rig();
        const policy = POLICIES['champions-v1'].create({
            config: world.config,
            champions: [makeChampionFileFor(world.config, 'a', 1)],
        });
        expect(policy.name).toBe('champions-v1');
        expect(policy.fitnessName).toBe('v6');
    });

    it('turns a random-brain draw into a mutated champion of the same specialisation', () => {
        const { world, make, records } = rig();
        const policy = make({ champions: [flatChampion(world.config, 2, 0.5), flatChampion(world.config, 3, -0.5)] });
        world.spec[0] = 2;
        policy.brain.initBrain(world, 0, createRng(7));
        const row = rowOf(world, 0);
        expect(mean(row)).toBeGreaterThan(0.35);
        expect(mean(row)).toBeLessThan(0.65);
        expect(row.some((w) => w !== 0.5)).toBe(true);
        expect(policy.sigma[0]).not.toBe(SIGMA_START);
        expect(records.find((r) => r.event === 'ImmigrantSeeded')).toMatchObject({ spec: 2, source: 'champion' });
        world.spec[1] = 3;
        policy.brain.initBrain(world, 1, createRng(7));
        expect(mean(rowOf(world, 1))).toBeLessThan(-0.35);
    });

    it('falls back to the random brain and logs it when the specialisation has no champion', () => {
        const { world, make, records } = rig();
        const policy = make({ champions: [flatChampion(world.config, 2, 0.5)] });
        const plain = createMapElitesV6({ config: world.config });
        world.spec[0] = 4;
        policy.brain.initBrain(world, 0, createRng(7));
        const mine = rowOf(world, 0);
        plain.brain.initBrain(world, 0, createRng(7));
        expect(rowOf(world, 0)).toEqual(mine);
        expect(policy.sigma[0]).toBeCloseTo(SIGMA_START, 6);
        expect(records.filter((r) => r.event === 'ChampionMissing')).toHaveLength(1);
        expect(records.find((r) => r.event === 'ImmigrantSeeded')).toMatchObject({ source: 'random' });
    });

    it('leaves archive draws and the other brain hooks as the live policy has them', () => {
        const { world, make } = rig({ archiveShare: 0, cloneShareEnd: 1 });
        const policy = make({ champions: [flatChampion(world.config, 0, 0.5)] });
        const plain = createMapElitesV6({ config: world.config, archiveShare: 0, cloneShareEnd: 1 });
        fill(policy, { spec: 0, count: 10 });
        fill(plain, { spec: 0, count: 10 });
        world.spec[0] = 0;
        policy.brain.initBrain(world, 0, createRng(3));
        const mine = rowOf(world, 0);
        plain.brain.initBrain(world, 0, createRng(3));
        expect(rowOf(world, 0)).toEqual(mine);
        expect(mean(mine)).toBeCloseTo(0.25, 5);
        expect(Object.keys(policy.brain)).toEqual(Object.keys(plain.brain));
        expect(policy.fitnessName).toBe(plain.fitnessName);
    });

    it('fails loudly without champions, and with a champion of other rules', () => {
        const { world, make } = rig();
        expect(() => make()).toThrow(/needs champion files/);
        expect(() => make({ champions: [] })).toThrow(/needs champion files/);
        const stale = { ...makeChampionFileFor(world.config, 'a', 1), rulesHash: 'old' };
        expect(() => make({ champions: [stale] })).toThrow(/champion file 0/);
    });
});
