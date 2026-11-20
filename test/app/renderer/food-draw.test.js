import { describe, expect, it } from 'vitest';
import { createFoodDraw } from '../../../js/app/renderer/food-draw.js';
import { createInterpolated } from '../../../js/app/interpolate.js';
import { FAIL_MS } from '../../../js/app/renderer/death-anim.js';
import { beginDeath, createDying, trackBodies } from '../../../js/app/renderer/dying.js';
import { makeSnapshot } from '../helpers/snapshots.js';

describe('createFoodDraw', () => {
    it('draws one mesh per food model and clears without a snapshot', () => {
        const layer = createFoodDraw({ info: { maxFood: 8 } });
        expect(layer.object.children).toHaveLength(7);
        const snapshot = makeSnapshot(1, [], { foods: [[0, 0, 5, 0, 2, 0]] });
        const frame = /** @type {any} */ ({ snapshot, camera: { zoom: 1 }, nowMs: 0, family: { palette: 'default' } });
        layer.update?.(frame);
        expect(layer.object.children[2].geometry.instanceCount).toBe(1);
        layer.update?.(/** @type {any} */ ({ snapshot: null }));
        expect(layer.object.children[2].geometry.instanceCount).toBe(0);
        layer.dispose();
    });

    it('sways between snapshots without repacking, and repacks for a new snapshot or zoom', () => {
        const layer = createFoodDraw({ info: { maxFood: 8 } });
        const plant = layer.object.children[2];
        const snapshot = makeSnapshot(1, [], { foods: [[0, 0, 0.5, 0, 2, 0]] });
        const frame = /** @type {any} */ ({ snapshot, camera: { zoom: 1 }, nowMs: 0, family: { palette: 'default' } });
        const rot = () => plant.geometry.attributes.iRig0.getZ(0);
        const radius = () => plant.geometry.attributes.iPose.getW(0);
        layer.update?.(frame);
        const [rot0, radius0] = [rot(), radius()];
        layer.update?.({ ...frame, nowMs: 900 });
        expect(rot()).not.toBeCloseTo(rot0, 5);
        expect(radius()).toBe(radius0);
        layer.update?.({ ...frame, nowMs: 900, camera: { zoom: 0.25 } });
        expect(radius()).toBeGreaterThan(radius0);
        layer.update?.({ ...frame, snapshot: makeSnapshot(2, [], { foods: [] }), nowMs: 900 });
        expect(plant.geometry.instanceCount).toBe(0);
        layer.dispose();
    });

    it('repacks when a reused snapshot object carries a new seq, and sways when the seq is unchanged', () => {
        const layer = createFoodDraw({ info: { maxFood: 8 } });
        const plant = layer.object.children[2];
        // One object, as a ring slot's view is: its contents and seq change under the same identity.
        const reused = makeSnapshot(1, [], { foods: [[0, 0, 0.5, 0, 2, 0]] });
        const frame = /** @type {any} */ ({
            snapshot: reused,
            camera: { zoom: 1 },
            nowMs: 0,
            family: { palette: 'default' },
        });
        const radius = () => plant.geometry.attributes.iPose.getW(0);
        layer.update?.(frame);
        expect(plant.geometry.instanceCount).toBe(1);
        const radius0 = radius();
        // The slot is published again with no food, same object and seq: nothing repacks.
        reused.u32[2] = 0;
        layer.update?.({ ...frame, nowMs: 900 });
        expect(plant.geometry.instanceCount).toBe(1);
        expect(radius()).toBe(radius0);
        reused.seq = 2;
        layer.update?.({ ...frame, nowMs: 900 });
        expect(plant.geometry.instanceCount).toBe(0);
        layer.dispose();
    });

    it('fades the carcass of an eaten body in over the leaving beat when it is given the dying bodies', () => {
        const dying = createDying(8);
        const body = createInterpolated(8);
        body.count = 1;
        body.slot[0] = 0;
        body.genomeId[0] = 30;
        body.size[0] = 10;
        trackBodies(dying, body, 0);
        trackBodies(dying, createInterpolated(8), 0);
        beginDeath(dying, { genome: 30, cause: 0, nowMs: 0 });
        const layer = createFoodDraw({ info: { maxFood: 8 }, dying, causeNames: ['EATEN'] });
        const carcass = layer.object.children[6];
        const snapshot = makeSnapshot(1, [], { foods: [[0, 0, -7, 0, 0, 0]] });
        const frame = /** @type {any} */ ({
            snapshot,
            camera: { zoom: 1 },
            nowMs: FAIL_MS,
            family: { palette: 'default' },
        });
        layer.update?.(frame);
        expect(carcass.geometry.attributes.iNeon.getX(0)).toBe(0);
        layer.update?.({ ...frame, nowMs: 5000 });
        expect(carcass.geometry.attributes.iNeon.getX(0)).toBeGreaterThan(0);
        layer.dispose();
    });
});
