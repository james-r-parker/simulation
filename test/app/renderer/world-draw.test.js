import { describe, expect, it, vi } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import { createWorldLayers } from '../../../js/app/renderer/world-draw.js';
import { createFamilySlots } from '../../../js/app/family-slots.js';
import { smallReady } from '../helpers/ready.js';

describe('createWorldLayers', () => {
    it('builds the seven layers in order and draws the rocks of a real world', () => {
        const ready = smallReady();
        const layers = createWorldLayers({ info: ready.info, layout: ready.layout, seed: 3 });
        expect(Object.keys(layers)).toEqual(['depth', 'ground', 'zones', 'patches', 'rocks', 'clouds', 'motes']);
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

describe('createWorldLayers without terrain', () => {
    it('warns once and still draws', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const ready = smallReady();
        const info = { ...ready.info, terrain: undefined };
        const layers = createWorldLayers({ info, layout: { flags: {} }, seed: 1 });
        expect(warn.mock.calls.some(([r]) => r.event === 'WorldTerrainMissing')).toBe(true);
        layers.depth.update?.(
            /** @type {any} */ ({
                snapshot: ready.snapshot,
                agents: { count: 0 },
                nowMs: 0,
                season: 0,
                seasonProgress: 0,
                family: { palette: 'default' },
                camera: { zoom: 1 },
            }),
        );
        Object.values(layers).forEach((l) => l.dispose());
        warn.mockRestore();
    });
});
