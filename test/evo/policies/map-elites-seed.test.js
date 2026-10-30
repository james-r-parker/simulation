import { describe, expect, it } from 'vitest';
import { createMapElitesV1 } from '../../../js/evo/policies/map-elites-v1.js';
import { createSimLog } from '../../../js/sim/log.js';
import { createSeeder } from '../../../js/evo/policies/map-elites-seed.js';
import { SIGMA_MIN } from '../../../js/evo/mutation.js';
import { createRng } from '../../../js/sim/rng.js';
import { smallWorld } from '../../sim/helpers/small-world.js';
import { setup, fill } from '../helpers/map-elites-world.js';

describe('initSpec', () => {
    it('picks the specialisation with the fewest alive agents, ties to the lowest index', () => {
        const { policy, world } = setup();
        const counts = [2, 1, 1, 3, 1];
        let slot = 0;
        counts.forEach((n, spec) => {
            for (let i = 0; i < n; i++, slot++) {
                world.alive[slot] = 1;
                world.spec[slot] = spec;
            }
        });
        expect(slot).toBe(8);
        // Slot 7 is being seeded: its stale spec (4) is not counted, so spec 4 has none and wins.
        expect(policy.brain.initSpec(world, 7, createRng(1))).toBe(4);
        // Spec 1 and spec 4 now tie at none: the lowest index wins.
        world.alive[2] = 0;
        expect(policy.brain.initSpec(world, 7, createRng(1))).toBe(1);
    });

    it('returns 0 on an empty world', () => {
        const { policy, world } = setup();
        expect(policy.brain.initSpec(world, 0, createRng(1))).toBe(0);
    });
});

describe('initSpec with specMutationRate above 0', () => {
    /**
     * @returns {{policy: any, world: any}} a policy on a world with heritable specialisation
     */
    function heritable() {
        const world = smallWorld({ brainHidden: 4, maxAgents: 8, specMutationRate: 0.002 });
        const log = createSimLog(() => {}, { level: 'debug' });
        return { policy: createMapElitesV1({ config: world.config, log }), world };
    }

    it('draws a random specialisation while the archive is short, ignoring who is alive', () => {
        const { policy, world } = heritable();
        world.alive[0] = 1;
        world.spec[0] = 1;
        const rng = createRng(3);
        const seen = new Set();
        for (let i = 0; i < 100; i++) {
            seen.add(policy.brain.initSpec(world, 7, rng));
        }
        expect(seen.size).toBe(5);
    });

    it('draws the specialisation of a random elite once the archive has 10 cells', () => {
        const { policy, world } = heritable();
        fill(policy, { spec: 0, count: 10 });
        fill(policy, { spec: 4, count: 10 });
        const rng = createRng(4);
        const counts = [0, 0, 0, 0, 0];
        for (let i = 0; i < 2000; i++) {
            counts[policy.brain.initSpec(world, 7, rng)] += 1;
        }
        expect([counts[1], counts[2], counts[3]]).toEqual([0, 0, 0]);
        expect(counts[0]).toBeGreaterThan(900);
        expect(counts[4]).toBeGreaterThan(900);
    });

    it('draws only from the stream it is given', () => {
        const { policy, world } = heritable();
        const before = Array.from(world.rng.spawn.s);
        policy.brain.initSpec(world, 7, createRng(5));
        expect(Array.from(world.rng.spawn.s)).toEqual(before);
    });
});

describe('initSpec without a rescue', () => {
    it('is the least-populated rule and draws nothing', () => {
        const { policy, world } = setup();
        [0, 0, 1, 2].forEach((spec, slot) => {
            world.alive[slot] = 1;
            world.spec[slot] = spec;
        });
        const rng = createRng(5);
        const before = Array.from(rng.s);
        expect(policy.brain.initSpec(world, 7, rng)).toBe(3);
        expect(Array.from(rng.s)).toEqual(before);
    });

    it('falls back to the least populated when none is at 0', () => {
        const { policy, world } = setup();
        [0, 0, 1, 2, 3, 4, 4].forEach((spec, slot) => {
            world.alive[slot] = 1;
            world.spec[slot] = spec;
        });
        expect(policy.brain.initSpec(world, 7, createRng(1))).toBe(1);
    });
});

describe('initBrain genome check', () => {
    it('logs GenomeRejected at error and rethrows when an archive row does not fit the world layout', () => {
        const { policy, world, records } = setup();
        fill(policy, { spec: 0, count: 12 });
        const fits = policy.archive.layout.weightCount;
        world.layout = { ...world.layout, weightCount: fits + 1 };
        const rng = createRng(2);
        let thrown = null;
        for (let i = 0; i < 50 && thrown === null; i++) {
            try {
                policy.brain.initBrain(world, 0, rng);
            } catch (e) {
                thrown = e;
            }
        }
        expect(String(thrown)).toMatch(/weights\.length: expected \d+, got \d+/);
        const rejected = records.filter((r) => r.event === 'GenomeRejected');
        expect(rejected).toHaveLength(1);
        expect(rejected[0]).toMatchObject({
            level: 'error',
            field: 'weights.length',
            expected: fits + 1,
            actual: fits,
        });
    });
});

describe('initBrain sources', () => {
    it('seeds randomly, drawing nothing, while the archive has fewer than 10 cells', () => {
        const { policy, world, records } = setup();
        fill(policy, { spec: 0, count: 9 });
        const rng = createRng(5);
        const before = JSON.stringify(rng);
        for (let i = 0; i < 20; i++) {
            world.spec[0] = 0;
            policy.brain.initBrain(world, 0, rng);
        }
        const seeded = records.filter((r) => r.event === 'ImmigrantSeeded');
        expect(seeded).toHaveLength(20);
        expect(seeded.every((r) => r.source === 'random' && r.archiveRef === -1)).toBe(true);
        expect(JSON.stringify(rng)).not.toBe(before);
        expect(policy.isClone[0]).toBe(0);
    });

    it('mixes archive, clone and random about 0.5 / 0.3 / 0.2 once the archive has 10 cells', () => {
        const { policy, world, records } = setup();
        fill(policy, { spec: 0, count: 12 });
        const rng = createRng(11);
        const draws = 3000;
        for (let i = 0; i < draws; i++) {
            world.spec[0] = 0;
            policy.brain.initBrain(world, 0, rng);
            const last = records[records.length - 1];
            expect(policy.isClone[0]).toBe(last.source === 'clone' ? 1 : 0);
            expect(policy.fromArchive[0]).toBe(last.source === 'random' ? 0 : 1);
            if (last.source === 'clone') {
                expect(policy.refId[0]).toBe(last.archiveRef + 1);
                expect(policy.archiveRef[0]).toBe(last.archiveRef);
            }
        }
        const share = (/** @type {string} */ source) => records.filter((r) => r.source === source).length / draws;
        expect(share('archive')).toBeGreaterThan(0.46);
        expect(share('archive')).toBeLessThan(0.54);
        expect(share('clone')).toBeGreaterThan(0.26);
        expect(share('clone')).toBeLessThan(0.34);
        expect(share('random')).toBeGreaterThan(0.16);
        expect(share('random')).toBeLessThan(0.24);
    });

    it('takes the immigrant mix from archiveShare and cloneShareEnd', () => {
        const { policy, world, records } = setup({ archiveShare: 0.1, cloneShareEnd: 0.9 });
        fill(policy, { spec: 0, count: 12 });
        const rng = createRng(11);
        const draws = 3000;
        for (let i = 0; i < draws; i++) {
            world.spec[0] = 0;
            policy.brain.initBrain(world, 0, rng);
        }
        const share = (/** @type {string} */ source) => records.filter((r) => r.source === source).length / draws;
        expect(share('archive')).toBeGreaterThan(0.07);
        expect(share('archive')).toBeLessThan(0.13);
        expect(share('clone')).toBeGreaterThan(0.76);
        expect(share('clone')).toBeLessThan(0.84);
        expect(share('random')).toBeGreaterThan(0.07);
        expect(share('random')).toBeLessThan(0.13);
    });

    it('can turn the archive child or the random genome off entirely', () => {
        const noRandom = setup({ archiveShare: 0.5, cloneShareEnd: 1 });
        fill(noRandom.policy, { spec: 0, count: 12 });
        const noArchive = setup({ archiveShare: 0, cloneShareEnd: 0.8 });
        fill(noArchive.policy, { spec: 0, count: 12 });
        for (let i = 0; i < 200; i++) {
            noRandom.world.spec[0] = 0;
            noRandom.policy.brain.initBrain(noRandom.world, 0, createRng(i));
            noArchive.world.spec[0] = 0;
            noArchive.policy.brain.initBrain(noArchive.world, 0, createRng(i));
        }
        expect(noRandom.records.some((r) => r.source === 'random')).toBe(false);
        expect(noArchive.records.some((r) => r.source === 'archive')).toBe(false);
    });

    it('rejects shares that are out of order or out of range, naming the option', () => {
        expect(() => setup({ archiveShare: 0.9, cloneShareEnd: 0.5 })).toThrow(/archiveShare 0\.9/);
        expect(() => setup({ archiveShare: -0.1 })).toThrow(/archiveShare -0\.1/);
        expect(() => setup({ cloneShareEnd: 1.1 })).toThrow(/cloneShareEnd 1\.1/);
        expect(() => setup({ archiveShare: Number.NaN })).toThrow(/archiveShare/);
    });

    it('falls back to random for a specialisation with no genome', () => {
        const { policy, world, records } = setup();
        fill(policy, { spec: 0, count: 12 });
        world.spec[0] = 3;
        for (let i = 0; i < 50; i++) {
            policy.brain.initBrain(world, 0, createRng(i));
        }
        expect(records.every((r) => r.source === 'random')).toBe(true);
        expect(policy.sigma[0]).toBeCloseTo(0.05, 6);
    });

    it('copies an archive parent: a clone unchanged, a child mutated', () => {
        const { policy, world, records } = setup();
        fill(policy, { spec: 0, count: 12 });
        const row = world.weights.subarray(0, world.layout.weightCount);
        const rng = createRng(3);
        let sawClone = false;
        let sawChild = false;
        for (let i = 0; i < 200 && !(sawClone && sawChild); i++) {
            world.spec[0] = 0;
            policy.brain.initBrain(world, 0, rng);
            const { source } = records[records.length - 1];
            if (source === 'clone') {
                sawClone = true;
                expect(Array.from(row).every((v) => v === 0.25)).toBe(true);
                expect(policy.sigma[0]).toBeCloseTo(0.07, 6);
            } else if (source === 'archive') {
                sawChild = true;
                expect(Array.from(row).some((v) => v !== 0.25)).toBe(true);
            }
        }
        expect(sawClone && sawChild).toBe(true);
    });
});

/**
 * Seeds slot 0 until an archive child appears (its parent has the smallest sigma, so brain weights barely move).
 * @returns {{brainMove: number, traitMove: number}} the largest change of a brain weight / of a trait or leak gene
 */
function mutatedParts() {
    const { policy, world, records } = setup({}, { hashCellSize: 256 });
    fill(policy, { spec: 0, count: 12, sigma: SIGMA_MIN });
    const row = world.weights.subarray(0, world.layout.weightCount);
    const rng = createRng(3);
    for (let i = 0; i < 200 && records.at(-1)?.source !== 'archive'; i++) {
        world.spec[0] = 0;
        policy.brain.initBrain(world, 0, rng);
    }
    expect(records.at(-1)?.source).toBe('archive');
    const { traitStart } = world.layout;
    const move = (/** @type {Float32Array} */ part) => Math.max(...Array.from(part, (v) => Math.abs(v - 0.25)));
    return { brainMove: move(row.subarray(0, traitStart)), traitMove: move(row.subarray(traitStart)) };
}

describe('initBrain mutation of an archive child', () => {
    it('steps the trait and leak genes by TRAIT_SIGMA and the brain by the row sigma', () => {
        const { brainMove, traitMove } = mutatedParts();
        expect(brainMove).toBeLessThan(0.03);
        expect(traitMove).toBeGreaterThan(0.03);
    });
});

describe('createSeeder without a fromArchive record', () => {
    it('seeds a random brain and leaves no archive marker when the clone state has none', () => {
        const { policy, world } = setup();
        const clones = {
            isClone: new Uint8Array(8),
            archiveRef: new Int32Array(8),
            refId: new Uint32Array(8),
        };
        const { initBrain } = createSeeder({
            archive: policy.archive,
            birth: { sigma: new Float32Array(8) },
            clones,
        });
        initBrain(world, 0, createRng(1));
        expect(clones.isClone[0]).toBe(0);
        expect(clones.archiveRef[0]).toBe(-1);
    });
});

describe('initSpec with a random elite', () => {
    /**
     * @param {Record<string, any>} options config overrides
     * @returns {ReturnType<typeof setup>} a heritable world with specialisations 0 and 4 only alive, and 10 elites each in 0 and 4
     */
    function both(options) {
        const s = setup({}, { specMutationRate: 0.002, ...options });
        [0, 4].forEach((spec, slot) => {
            s.world.alive[slot] = 1;
            s.world.spec[slot] = spec;
        });
        fill(s.policy, { spec: 0, count: 10 });
        fill(s.policy, { spec: 4, count: 10 });
        return s;
    }

    it('draws a random elite, never the least populated', () => {
        const { policy, world } = both({});
        const rng = createRng(6);
        const seen = new Set();
        for (let i = 0; i < 60; i++) {
            seen.add(policy.brain.initSpec(world, 7, rng));
        }
        expect([...seen].sort()).toEqual([0, 4]);
    });
});
