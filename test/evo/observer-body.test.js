import { describe, expect, it } from 'vitest';
import { noteBirthBody, noteBody } from '../../js/evo/observer-body.js';
import { observe } from '../../js/evo/observer.js';
import { addBorn, nextTick, observed, pushBorn, pushDied } from './helpers/observer-world.js';

describe('noteBody', () => {
    it('stores the traits of the slot', () => {
        const { observer } = observed({ hashCellSize: 256 });
        observer.spec[2] = 1;
        noteBody(observer, 2, 1.2, 0.8);
        expect([observer.sizeTrait[2], observer.visionTrait[2]]).toEqual([Math.fround(1.2), Math.fround(0.8)]);
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
    it('stores the traits of a newborn', () => {
        const { world, observer } = observed({ hashCellSize: 256 });
        nextTick(world, 0);
        const slot = addBorn(world);
        world.baseSize[slot] = world.config.baseSize * 1.2;
        world.vision[slot] = 1.3;
        observe(observer, world);
        expect(observer.sizeTrait[slot]).toBeCloseTo(1.2, 6);
        expect(observer.visionTrait[slot]).toBeCloseTo(1.3, 6);
        nextTick(world, 1);
        pushDied(world, { slot, genomeId: world.genomeId[slot] });
        world.alive[slot] = 0;
        world.baseSize[slot] = 0;
        observe(observer, world);
        expect(observer.sizeTrait[slot]).toBeCloseTo(1.2, 6);
    });

    it('logs the style the agent had before the scenes reset its slot', () => {
        const { world, observer } = observed({ hashCellSize: 256 });
        nextTick(world, 0);
        const slot = addBorn(world);
        observe(observer, world);
        observer.intent.hunterSpec[observer.spec[slot]] = 1;
        const { style } = observer.scenes;
        style.chains[slot] = 2;
        style.done[slot] = 60;
        nextTick(world, 1);
        pushDied(world, { slot, genomeId: world.genomeId[slot] });
        world.alive[slot] = 0;
        observe(observer, world);
        expect(observer.deaths.style[0]).toBeCloseTo(0.5, 12);
        expect(style.chains[slot]).toBe(0);
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
    });

    it('gives a born-and-died-in-one-tick agent the default traits', () => {
        const { world, observer } = observed({ hashCellSize: 256 });
        nextTick(world, 3);
        pushBorn(world, { slot: 4, genomeId: 77 });
        pushDied(world, { slot: 4, genomeId: 77 });
        observe(observer, world);
        expect(observer.deaths.genomeId[0]).toBe(77);
        expect(observer.deaths.style[0]).toBe(0);
    });
});
