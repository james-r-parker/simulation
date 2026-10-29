// Leave a dying patch: hand-built patches and agents with a known share staying and leaving, read through the real
// `samplePatches` and `computeMetrics`.

import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../../js/evo/metrics.js';
import { PATCH_DIRECTIONS, PATCH_STAY_TICKS, patchAt, samplePatches } from '../../js/evo/scene-patch.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

const BURN_IN = 10000;
const WORLD = { foodPatchCount: 2, foodPatchRadius: 100, foodPatchCapacity: 1000 };

/** Two patches: a depleted one (stock 300) at x 200 and a full one at x 800, both at y 500. */
function patchWorld() {
    const r = observed(WORLD);
    r.world.patchX.set([200, 800]);
    r.world.patchY.set([500, 500]);
    r.world.patchStock.set([300, 1000]);
    return r;
}

const read = (/** @type {any} */ r, /** @type {string} */ name) => computeMetrics(r.observer, r.world)[`eval.${name}`];

describe('patchAt', () => {
    it('finds the patch whose disc strictly contains the agent, the nearest centre first', () => {
        const { world } = patchWorld();
        const a = addBlob(world, { x: 250 });
        const b = addBlob(world, { x: 300 });
        const c = addBlob(world, { x: 500 });
        expect([patchAt(world, a), patchAt(world, b), patchAt(world, c)]).toEqual([0, -1, -1]);
    });
});

describe('eval.patch_stay_depleted and eval.patch_leave_depleted', () => {
    it('are the shares of depleted-patch samples still in the patch and out of it 300 ticks later', () => {
        const r = patchWorld();
        const { world, observer } = r;
        const stayer = addBlob(world, { x: 200 });
        const leaver = addBlob(world, { x: 220 });
        const grazer = addBlob(world, { x: 800 });
        const dying = addBlob(world, { x: 210 });
        const scene = observer.scenes.patch;
        world.tick = BURN_IN;
        samplePatches(scene, world);
        expect(scene.patch[grazer]).toBe(-1);
        world.tick += 100;
        world.alive[dying] = 0;
        samplePatches(scene, world);
        world.tick += 100;
        world.x[leaver] = 600;
        samplePatches(scene, world);
        expect(scene.stay + scene.leave).toBe(0);
        world.tick += 100;
        samplePatches(scene, world);
        expect([scene.stay, scene.leave]).toEqual([1, 1]);
        expect(read(r, 'patch_stay_depleted').value).toBe(0.5);
        expect(read(r, 'patch_leave_depleted').value).toBe(0.5);
        expect(stayer).toBe(0);
    });

    it('reads 300 ticks and no fewer', () => {
        expect(PATCH_STAY_TICKS).toBe(300);
        const r = patchWorld();
        addBlob(r.world, { x: 200 });
        r.world.tick = BURN_IN;
        samplePatches(r.observer.scenes.patch, r.world);
        for (let i = 0; i < 2; i++) {
            r.world.tick += 100;
            samplePatches(r.observer.scenes.patch, r.world);
        }
        expect(r.observer.scenes.patch.stay).toBe(0);
    });

    it('opens no sample before burn-in, in a full patch, or for an agent outside every patch', () => {
        const r = patchWorld();
        addBlob(r.world, { x: 200 });
        addBlob(r.world, { x: 800 });
        addBlob(r.world, { x: 500 });
        r.world.tick = BURN_IN - 100;
        samplePatches(r.observer.scenes.patch, r.world);
        expect(Array.from(r.observer.scenes.patch.patch.slice(0, 3))).toEqual([-1, -1, -1]);
        r.world.tick = BURN_IN;
        samplePatches(r.observer.scenes.patch, r.world);
        expect(Array.from(r.observer.scenes.patch.patch.slice(0, 3))).toEqual([0, -1, -1]);
    });

    it('drops a sample when another genome has taken the slot', () => {
        const r = patchWorld();
        const slot = addBlob(r.world, { x: 200 });
        r.world.tick = BURN_IN;
        samplePatches(r.observer.scenes.patch, r.world);
        r.world.genomeId[slot] = 999;
        for (let i = 0; i < 3; i++) {
            r.world.tick += 100;
            samplePatches(r.observer.scenes.patch, r.world);
        }
        expect(r.observer.scenes.patch.stay + r.observer.scenes.patch.leave).toBe(0);
    });

    it('are null with a reason before any sample resolves, and have the table directions', () => {
        const r = patchWorld();
        expect(read(r, 'patch_stay_depleted').value).toBeNull();
        expect(read(r, 'patch_leave_depleted').reason).toContain('no depleted-patch sample');
        expect(PATCH_DIRECTIONS).toEqual({
            'eval.patch_stay_depleted': 'lower',
            'eval.patch_leave_depleted': 'higher',
        });
    });

    it('does nothing in a world with no patches', () => {
        const r = observed();
        addBlob(r.world);
        r.world.tick = BURN_IN;
        samplePatches(r.observer.scenes.patch, r.world);
        expect(r.observer.scenes.patch.stay).toBe(0);
    });
});
