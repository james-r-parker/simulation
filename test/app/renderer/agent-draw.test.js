import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import { createAgentDraw, meshTable, SCENT_DIM } from '../../../js/app/renderer/agent-draw.js';
import { createFamilySlots } from '../../../js/app/family-slots.js';
import { smallReady } from '../helpers/ready.js';

/** @param {any} ready the ready fields @param {Record<string, any>} [over] frame overrides @returns {any} a frame */
function frameOf(ready, over = {}) {
    const agents = createInterpolated(ready.info.maxAgents);
    interpolateInto(null, ready.snapshot, 1, agents);
    return {
        agents,
        camera: createCameraController({
            canvas: { width: 1600, height: 1000 },
            world: { width: ready.info.worldWidth, height: ready.info.worldHeight },
        }),
        family: createFamilySlots(),
        lenses: { temperature: false, scent: false },
        nowMs: 1000,
        dtMs: 16,
        tick: ready.snapshot.tick,
        ...over,
    };
}

describe('createAgentDraw', () => {
    it('draws one mesh per spec and puts every agent in exactly one', () => {
        const ready = smallReady(20);
        const layer = createAgentDraw({
            info: ready.info,
            flagBits: ready.layout.flags,
            stateBits: ready.layout.stateBits,
        });
        expect(layer.object.children).toHaveLength(ready.info.specs.length);
        const frame = frameOf(ready);
        layer.update?.(frame);
        const drawn = layer.object.children.reduce(
            (/** @type {number} */ n, /** @type {any} */ m) => n + m.geometry.instanceCount,
            0,
        );
        expect(drawn).toBe(frame.agents.count);
        layer.dispose();
    });

    it('dims the agents under the scent lens', () => {
        const ready = smallReady();
        const layer = createAgentDraw({
            info: ready.info,
            flagBits: ready.layout.flags,
            stateBits: ready.layout.stateBits,
        });
        layer.update?.(frameOf(ready, { lenses: { temperature: false, scent: true } }));
        const material = layer.object.children[0].material;
        expect(material.colorNode.isNode).toBe(true);
        expect(SCENT_DIM).toBeLessThan(1);
    });

    it('maps spec indices to meshes', () => {
        expect(meshTable({ specs: [{ index: 2 }, { index: 0 }] })).toEqual([1, -1, 0]);
    });
});
