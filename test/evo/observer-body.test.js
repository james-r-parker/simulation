import { describe, expect, it } from 'vitest';
import { NICHE_TALLY_TICKS, noteBirthBody, noteBody, noteNiches } from '../../js/evo/observer-body.js';
import { observe } from '../../js/evo/observer.js';
import { createFitnessV6 } from '../../js/evo/fitness-v6.js';
import { addBorn, nextTick, observed, pushBorn, pushDied } from './helpers/observer-world.js';

describe('noteBody', () => {
    it('stores the traits and the niche of the slot', () => {
        const { observer } = observed({ hashCellSize: 256 });
        observer.spec[2] = 1;
        noteBody(observer, 2, 1.2, 0.8);
        expect([observer.sizeTrait[2], observer.visionTrait[2]]).toEqual([Math.fround(1.2), Math.fround(0.8)]);
        expect(observer.niche[2]).toBe(1 * 3 + 2);
    });
});

describe('noteBirthBody', () => {
    it('reads the newborn traits from the world as multiples of the defaults', () => {
        const { world, observer } = observed({ hashCellSize: 256 });
        const slot = addBorn(world);
        world.baseSize[slot] = world.config.baseSize * 0.8;
        world.vision[slot] = 1.25;
        noteBirthBody(observer, world, slot, world.genomeId[slot]);
        expect(observer.sizeTrait[slot]).toBeCloseTo(0.8, 6);
        expect(observer.visionTrait[slot]).toBeCloseTo(1.25, 6);
        expect(observer.niche[slot] % 3).toBe(0);
    });

    it('gives the default traits when the slot holds another genome', () => {
        const { world, observer } = observed({ hashCellSize: 256 });
        const slot = addBorn(world);
        world.baseSize[slot] = world.config.baseSize * 0.8;
        noteBirthBody(observer, world, slot, world.genomeId[slot] + 1);
        expect([observer.sizeTrait[slot], observer.visionTrait[slot]]).toEqual([1, 1]);
    });
});

describe('the observer at birth and death', () => {
    it('stores the traits of a newborn and reads them after the slot is freed', () => {
        const { world, observer } = observed({ hashCellSize: 256 });
        nextTick(world, 0);
        const slot = addBorn(world);
        world.baseSize[slot] = world.config.baseSize * 1.2;
        world.vision[slot] = 1.3;
        observe(observer, world);
        expect(observer.sizeTrait[slot]).toBeCloseTo(1.2, 6);
        nextTick(world, 1);
        pushDied(world, { slot, genomeId: world.genomeId[slot] });
        world.alive[slot] = 0;
        world.baseSize[slot] = 0;
        observe(observer, world);
        expect(observer.deaths.bodyPlan[0]).toBeCloseTo((1.2 + 1.3 - 1.4) / 1.2, 6);
    });

    it('logs the deliberate share of intake as the role skill', () => {
        const { world, observer } = observed();
        nextTick(world, 0);
        const slot = addBorn(world);
        observe(observer, world);
        observer.intent.deliberateFood[slot] = 30;
        observer.intent.chanceBite[slot] = 10;
        nextTick(world, 1);
        pushDied(world, { slot, genomeId: world.genomeId[slot] });
        world.alive[slot] = 0;
        observe(observer, world);
        expect(observer.deaths.roleSkill[0]).toBe(0.75);
        expect(observer.deaths.bodyPlan[0]).toBeCloseTo(0.5, 12);
    });

    it('gives a born-and-died-in-one-tick agent the default traits', () => {
        const { world, observer } = observed({ hashCellSize: 256 });
        nextTick(world, 3);
        pushBorn(world, { slot: 4, genomeId: 77 });
        pushDied(world, { slot: 4, genomeId: 77 });
        observe(observer, world);
        expect(observer.deaths.genomeId[0]).toBe(77);
        expect(observer.deaths.bodyPlan[0]).toBeCloseTo((1 + 1 - 1.4) / 1.2, 6);
    });
});

describe('the niche tally', () => {
    it('is absent until the first interval, then rebuilt at every one', () => {
        const { world, observer } = observed({ hashCellSize: 256 });
        nextTick(world, NICHE_TALLY_TICKS - 1);
        addBorn(world);
        addBorn(world);
        observe(observer, world);
        expect(observer.nicheTally).toBeUndefined();
        nextTick(world, NICHE_TALLY_TICKS);
        observe(observer, world);
        const tally = observer.nicheTally;
        expect(tally.count).toBe(15);
        expect(tally.shares.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0)).toBeCloseTo(1, 12);
        nextTick(world, NICHE_TALLY_TICKS + 1);
        const third = addBorn(world, { spec: 2 });
        world.spec[third] = 2;
        observe(observer, world);
        expect(Math.max(...tally.shares)).toBeCloseTo(1, 12);
        nextTick(world, 2 * NICHE_TALLY_TICKS);
        observe(observer, world);
        expect(observer.nicheTally).toBe(tally);
        expect(Math.max(...tally.shares)).toBeCloseTo(2 / 3, 12);
    });

    it('lets fitnessV6 pay a rare niche more than a common one', () => {
        const { world, observer } = observed({ maxAgents: 64 });
        const common = Array.from({ length: 30 }, () => addBorn(world));
        const rare = addBorn(world, { spec: 2 });
        for (const slot of [...common, rare]) {
            observer.spec[slot] = world.spec[slot];
            observer.niche[slot] = world.spec[slot] * 3 + 1;
            observer.intent.deliberateFood[slot] = 1000;
        }
        const fitness = createFitnessV6({});
        const config = world.config;
        const before = [fitness(observer, common[0], config), fitness(observer, rare, config)];
        world.tick = NICHE_TALLY_TICKS;
        noteNiches(observer, world);
        expect(fitness(observer, common[0], config) / before[0]).toBeCloseTo(0.75, 6);
        // 15 niches: the common niche holds 30 of 31 and clamps to the floor; the rare one holds 1 of 31
        expect(fitness(observer, rare, config) / before[1]).toBeCloseTo(1 + 0.5 * (1 - 15 / 31), 6);
    });
});
