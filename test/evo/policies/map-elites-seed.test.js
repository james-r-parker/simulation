import { describe, expect, it } from 'vitest';
import { createRng } from '../../../js/sim/rng.js';
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
