// The vision lens: every agent's ray fan at a faint alpha, from the ray part the worker adds to its snapshots while the
// lens is on. One preallocated line buffer sized for every agent's rays.

import { createSections, readSections } from '../snapshot-view.js';
import { clearLines, createLineBuffer } from './line-buffer.js';
import { createLineMesh } from './line-mesh.js';
import { pushRays } from './overlays.js';

/** The alpha of every ray in every fan. */
export const FAN_ALPHA = 0.06;

const SECTIONS = createSections();
const ME = { x: 0, y: 0, angle: 0, vision: 0 };
const RAYS = { f32: /** @type {Float32Array} */ (new Float32Array(0)), start: 0, count: 0, alpha: FAN_ALPHA };

/**
 * Adds every agent's fan to the buffer.
 * @param {import('./line-buffer.js').LineBuffer} lines the buffer
 * @param {{agents: import('../interpolate.js').Interpolated, snapshot: {u32: Uint32Array, f32: Float32Array}}} source
 *   the blended agents and the snapshot whose ray part to read
 * @param {Record<string, any>} info `ready.info`
 * @returns {void}
 */
export function pushFans(lines, { agents, snapshot }, info) {
    const s = readSections(snapshot.u32, SECTIONS);
    RAYS.f32 = snapshot.f32;
    RAYS.count = s.rayCount;
    for (let i = 0; i < agents.count && s.rayCount > 0; i++) {
        ME.x = agents.x[i];
        ME.y = agents.y[i];
        ME.angle = agents.angle[i];
        ME.vision = info.specs[agents.spec[i]]?.visionRange ?? 0;
        RAYS.start = s.rayStart + i * s.rayCount;
        pushRays(lines, ME, RAYS);
    }
}

/**
 * @param {{info: Record<string, any>}} context `ready.info`
 * @returns {import('./scene.js').Layer} the vision layer, hidden unless the lens is on
 */
export function createVisionLayer({ info }) {
    const lines = createLineBuffer(info.maxAgents * info.rayCount);
    const mesh = createLineMesh(lines);
    const { object } = mesh;
    object.visible = false;
    return {
        object,
        update(frame) {
            object.visible = frame.lenses.vision && frame.snapshot !== null;
            if (!object.visible || frame.snapshot === null) {
                return;
            }
            clearLines(lines);
            pushFans(lines, { agents: frame.agents, snapshot: frame.snapshot }, info);
            mesh.upload();
        },
        dispose: mesh.dispose,
    };
}
