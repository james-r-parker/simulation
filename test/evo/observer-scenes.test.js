// The scene feed inside `observe`: events reset slots and reach the scenes, the samples run on their cadence, and the
// world is only read.

import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE } from '../../js/sim/events.js';
import { observe } from '../../js/evo/observer.js';
import { createScenes, resetSceneSlot } from '../../js/evo/observer-scenes.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { nextTick, observed, pushBorn, pushDied } from './helpers/observer-world.js';

const T0 = 10000;
const BASINS = {
    worldWidth: 4000,
    worldHeight: 2000,
    refugeCount: 2,
    wallGaps: 1,
    maxAgents: 64,
};

describe('observeScenes', () => {
    it('resets a slot on a birth, and the scenes of a died hunter with it', () => {
        const r = observed();
        const slot = addBlob(r.world);
        r.observer.scenes.approach.phase[slot] = 2;
        r.observer.scenes.patch.patch[slot] = 1;
        nextTick(r.world, 5);
        pushBorn(r.world, { slot, genomeId: r.world.genomeId[slot] });
        observe(r.observer, r.world);
        expect(r.observer.scenes.approach.phase[slot]).toBe(0);
        expect(r.observer.scenes.patch.patch[slot]).toBe(-1);
    });

    it('credits an eaten death to the killer hunter approach before the slot is reset', () => {
        const r = observed();
        const { predator } = r.world.config.specialisations;
        const hunter = addBlob(r.world, { spec: predator.index });
        const prey = addBlob(r.world);
        r.observer.slotOf.set(r.world.genomeId[hunter], hunter);
        r.observer.scenes.approach.phase[hunter] = 1;
        nextTick(r.world, T0 + 1);
        pushDied(r.world, {
            slot: prey,
            genomeId: r.world.genomeId[prey],
            cause: DEATH_CAUSE.EATEN,
            by: r.world.genomeId[hunter],
        });
        r.world.alive[prey] = 0;
        observe(r.observer, r.world);
        expect(r.observer.scenes.approach.caught).toBe(1);
        expect(r.observer.scenes.approach.phase[hunter]).toBe(0);
    });

    it('runs the terrain and basin samples every 10 ticks and the patch sample every 100', () => {
        const r = observed({ ...BASINS, foodPatchCount: 1, foodPatchRadius: 100, foodPatchCapacity: 1000 });
        r.world.patchX.set([200]);
        r.world.patchY.set([500]);
        r.world.patchStock.set([100]);
        addBlob(r.world, { x: 200 });
        nextTick(r.world, T0 + 5);
        observe(r.observer, r.world);
        expect(r.observer.scenes.terrain.calm).toBe(0);
        expect(r.observer.scenes.patch.patch[0]).toBe(-1);
        nextTick(r.world, T0 + 10);
        observe(r.observer, r.world);
        expect(r.observer.scenes.terrain.calm).toBe(1);
        expect(r.observer.scenes.patch.patch[0]).toBe(-1);
        nextTick(r.world, T0 + 100);
        observe(r.observer, r.world);
        expect(r.observer.scenes.patch.patch[0]).toBe(0);
    });

    it('only reads the world: the hash is the same after forty observed ticks', () => {
        const r = observed(BASINS);
        addBlob(r.world, { x: 300 });
        r.world.foodAlive[0] = 1;
        r.world.tick = T0;
        const before = hashWorld(r.world);
        for (let tick = T0; tick < T0 + 40; tick++) {
            nextTick(r.world, tick);
            observe(r.observer, r.world);
        }
        r.world.tick = T0;
        expect(hashWorld(r.world)).toBe(before);
    });

    it('creates every scene empty, and resetSceneSlot is safe on a fresh one', () => {
        const scenes = createScenes(observed().world.config);
        expect(Object.keys(scenes).sort()).toEqual([
            'approach',
            'basin',
            'carcass',
            'condition',
            'heritage',
            'mate',
            'niche',
            'patch',
            'season',
            'spend',
            'style',
            'terrain',
        ]);
        expect(() => resetSceneSlot(scenes, 0)).not.toThrow();
    });
});
