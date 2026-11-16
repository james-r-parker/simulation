import { describe, expect, it } from 'vitest';
import { seedArchive } from '../../../js/evo/archive.js';
import { snapshotArchive } from '../../../js/evo/archive-snapshot.js';
import { createRng } from '../../../js/sim/rng.js';
import { fill, setup } from '../helpers/map-elites-world.js';

const POOL_FILL = 0.5;
const POOL_SIGMA = 0.03;

/**
 * @param {any} policy a policy whose archive layout the snapshot must fit
 * @param {number} [specs] how many specialisations hold elites (0 and then 1)
 * @returns {import('../../../js/evo/archive-snapshot.js').ArchiveSnapshot} a snapshot of an archive of elites (id from 5000)
 */
function poolSnapshot(policy, specs = 2) {
    const { archive } = policy;
    for (let spec = 0; spec < specs; spec++) {
        for (let cell = 0; cell < 12; cell++) {
            const weights = new Float32Array(archive.layout.weightCount).fill(POOL_FILL);
            seedArchive(archive, { spec, cell, id: 5000 + spec * 100 + cell, sigma: POOL_SIGMA, weights });
        }
    }
    return snapshotArchive(archive);
}

/**
 * @param {Record<string, any>} options extra policy options
 * @returns {{policy: any, world: any, records: any[]}} a policy whose own archive holds forager elites (fill 0.25)
 */
function withArchive(options) {
    const made = setup(options);
    fill(made.policy, { spec: 0, count: 12 });
    return made;
}

/** @returns {import('../../../js/evo/archive-snapshot.js').ArchiveSnapshot} a snapshot from a scratch policy */
function scratchSnapshot() {
    return poolSnapshot(setup().policy);
}

describe('the opponents option', () => {
    it('seeds a founder as an unmutated clone of a pool elite of its specialisation, marked as a pool founder', () => {
        const { policy, world, records } = withArchive({ opponents: { snapshots: [scratchSnapshot()], share: 1 } });
        world.spec[0] = 1;
        world.genomeId[0] = 77;
        policy.brain.initBrain(world, 0, createRng(1));
        const row = world.weights.subarray(0, world.layout.weightCount);
        expect(Array.from(row).every((w) => w === POOL_FILL)).toBe(true);
        expect(policy.sigma[0]).toBeCloseTo(POOL_SIGMA);
        expect(records.at(-1)).toMatchObject({ source: 'pool', spec: 1 });
        expect(policy.poolFounders.has(77)).toBe(true);
        expect([policy.isClone[0], policy.fromArchive[0], policy.archiveRef[0]]).toEqual([0, 0, -1]);
    });

    it('falls back to the ordinary draw when the pool holds no genome of the specialisation', () => {
        const snapshot = poolSnapshot(setup().policy, 1);
        const { policy, world, records } = withArchive({ opponents: { snapshots: [snapshot], share: 1 } });
        world.spec[0] = 3;
        world.genomeId[0] = 9;
        policy.brain.initBrain(world, 0, createRng(1));
        expect(records.at(-1).source).toBe('random');
        expect(policy.poolFounders.size).toBe(0);
    });

    it('draws the share of founders from the pool', () => {
        const { policy, world, records } = withArchive({ opponents: { snapshots: [scratchSnapshot()], share: 0.3 } });
        const draws = 2000;
        for (let i = 0; i < draws; i++) {
            world.spec[0] = 0;
            world.genomeId[0] = i + 1;
            policy.brain.initBrain(world, 0, createRng(i + 1));
        }
        const share = records.filter((r) => r.source === 'pool').length / draws;
        expect(share).toBeGreaterThan(0.26);
        expect(share).toBeLessThan(0.34);
    });

    it('draws nothing at a share of 0: the same genomes, marks and stream as no option', () => {
        const plain = withArchive({});
        const zero = withArchive({ opponents: { snapshots: [scratchSnapshot()], share: 0 } });
        const rngA = createRng(21);
        const rngB = createRng(21);
        for (let i = 0; i < 300; i++) {
            for (const [made, rng] of /** @type {const} */ ([
                [plain, rngA],
                [zero, rngB],
            ])) {
                made.world.spec[0] = i % 2;
                made.world.genomeId[0] = i + 1;
                made.policy.brain.initBrain(made.world, 0, rng);
            }
            expect(Array.from(zero.world.weights.subarray(0, zero.world.layout.weightCount))).toEqual(
                Array.from(plain.world.weights.subarray(0, plain.world.layout.weightCount)),
            );
            expect(zero.policy.sigma[0]).toBe(plain.policy.sigma[0]);
            expect(zero.policy.isClone[0]).toBe(plain.policy.isClone[0]);
        }
        expect(Array.from(rngB.s)).toEqual(Array.from(rngA.s));
        expect(zero.records.map((r) => r.source)).toEqual(plain.records.map((r) => r.source));
        expect(zero.policy.poolFounders.size).toBe(0);
    });

    it('does not draw from the brain-init stream: an empty pool at any share changes nothing', () => {
        const plain = withArchive({});
        const empty = withArchive({ opponents: { snapshots: [], share: 1 } });
        const rngA = createRng(5);
        const rngB = createRng(5);
        plain.world.spec[0] = 0;
        empty.world.spec[0] = 0;
        plain.policy.brain.initBrain(plain.world, 0, rngA);
        empty.policy.brain.initBrain(empty.world, 0, rngB);
        expect(Array.from(rngB.s)).toEqual(Array.from(rngA.s));
    });

    it('rejects a share outside 0 to 1, naming the option', () => {
        expect(() => setup({ opponents: { snapshots: [], share: 1.5 } })).toThrow(/opponents share 1\.5/);
        expect(() => setup({ opponents: { snapshots: [], share: -0.1 } })).toThrow(/opponents share/);
    });
});
