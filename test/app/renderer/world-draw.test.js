import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import { createWorldLayers } from '../../../js/app/renderer/world-draw.js';
import { createFamilySlots } from '../../../js/app/family-slots.js';
import { smallReady } from '../helpers/ready.js';

describe('createWorldLayers', () => {
    it('builds the six layers in order and draws the rocks of a real world', () => {
        const ready = smallReady();
        const layers = createWorldLayers({ info: ready.info, layout: ready.layout, seed: 3 });
        expect(Object.keys(layers)).toEqual(['ground', 'zones', 'patches', 'rocks', 'clouds', 'motes']);
        const agents = createInterpolated(ready.info.maxAgents);
        interpolateInto(null, ready.snapshot, 1, agents);
        const frame = /** @type {any} */ ({
            snapshot: ready.snapshot,
            agents,
            nowMs: 500,
            season: 0,
            seasonProgress: 0.5,
            family: createFamilySlots(),
            camera: createCameraController({
                canvas: { width: 800, height: 600 },
                world: { width: ready.info.worldWidth, height: ready.info.worldHeight },
            }),
        });
        for (const layer of Object.values(layers)) {
            layer.update?.(frame);
        }
        expect(layers.rocks.object.children[0].geometry.instanceCount).toBeGreaterThan(0);
        expect(layers.motes.object.children[0].geometry.instanceCount).toBeGreaterThan(0);
        for (const layer of Object.values(layers)) {
            layer.update?.({ ...frame, snapshot: null });
            layer.dispose();
        }
    });
});
