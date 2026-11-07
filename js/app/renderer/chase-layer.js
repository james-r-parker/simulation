// Chase tethers: while a hunter runs at a smaller blob that is running away, a dashed warm line joins the hunter's nose to
// its prey, brighter the closer the gap. It reads the pursuits of the blended frame (`js/app/pursuit.js`), so a viewer can
// see who is hunting whom without opening the inspector.

import { clearLines, createLineBuffer, pushVertex, setLineColor } from './line-buffer.js';
import { createLineMesh } from './line-mesh.js';
import { createPursuits, findPursuits, MAX_PURSUITS, pursuitRules } from '../pursuit.js';

/** Dashes per tether at level 0 and at level 1. */
export const CHASE_DASHES = 8;
export const CHASE_DASHES_LOW = 4;
/** The tether's colour (linear, above 1 so the bloom lifts it) and its alpha at touching range. */
export const CHASE_COLOR = Object.freeze([1.4, 0.55, 0.3]);
export const CHASE_ALPHA = 0.7;

const SCRATCH = [0, 0, 0];

/**
 * Pushes one dashed tether: the dashes run from the hunter's nose to the prey's near edge, each brighter than the one
 * before so the line points at the prey.
 * @param {import('./line-buffer.js').LineBuffer} lines the buffer
 * @param {{ax: number, ay: number, bx: number, by: number}} ends hunter nose and prey near edge
 * @param {{closeness: number, dashes: number}} look how close the pair is and how many dashes to draw
 * @returns {void}
 */
export function pushTether(lines, ends, { closeness, dashes }) {
    const { ax, ay, bx, by } = ends;
    for (let k = 0; k < dashes; k++) {
        const ramp = (k + 1) / dashes;
        const alpha = CHASE_ALPHA * (0.25 + 0.75 * closeness) * ramp;
        SCRATCH[0] = CHASE_COLOR[0];
        SCRATCH[1] = CHASE_COLOR[1];
        SCRATCH[2] = CHASE_COLOR[2];
        setLineColor(lines, SCRATCH, alpha);
        const t0 = (k + 0.1) / dashes;
        const t1 = (k + 0.6) / dashes;
        pushVertex(lines, ax + (bx - ax) * t0, ay + (by - ay) * t0);
        pushVertex(lines, ax + (bx - ax) * t1, ay + (by - ay) * t1);
    }
}

const ENDS = { ax: 0, ay: 0, bx: 0, by: 0 };

/**
 * Fills `lines` with a tether for every pursuit in `agents`.
 * @param {import('../interpolate.js').Interpolated} agents the frame's agents
 * @param {{pursuits: import('../pursuit.js').Pursuits, rules: ReturnType<typeof pursuitRules>}} state scratch and rules
 * @param {{lines: import('./line-buffer.js').LineBuffer, dashes: number}} target buffer and dashes per tether
 * @returns {number} tethers drawn
 */
export function stepChase(agents, { pursuits, rules }, { lines, dashes }) {
    clearLines(lines);
    findPursuits(agents, rules, pursuits);
    for (let k = 0; k < pursuits.count; k++) {
        const h = pursuits.hunter[k];
        const p = pursuits.prey[k];
        const dx = agents.x[p] - agents.x[h];
        const dy = agents.y[p] - agents.y[h];
        const len = Math.hypot(dx, dy);
        const nose = agents.size[h];
        const edge = Math.max(len - agents.size[p], nose);
        ENDS.ax = agents.x[h] + (dx / len) * nose;
        ENDS.ay = agents.y[h] + (dy / len) * nose;
        ENDS.bx = agents.x[h] + (dx / len) * edge;
        ENDS.by = agents.y[h] + (dy / len) * edge;
        pushTether(lines, ENDS, { closeness: pursuits.closeness[k], dashes });
    }
    return pursuits.count;
}

/**
 * @param {{info: Record<string, any>}} options `ready.info`
 * @returns {import('./scene.js').Layer} the chase layer
 */
export function createChaseLayer({ info }) {
    const lines = createLineBuffer(MAX_PURSUITS * CHASE_DASHES);
    const mesh = createLineMesh(lines);
    const state = { pursuits: createPursuits(), rules: pursuitRules(info) };
    let dashes = CHASE_DASHES;
    mesh.object.visible = true;
    return {
        object: mesh.object,
        setLook(look) {
            const tier = /** @type {number} */ (look.chase);
            dashes = tier === 0 ? CHASE_DASHES : CHASE_DASHES_LOW;
            mesh.object.visible = tier >= 0 && tier < 2;
        },
        update(frame) {
            if (!mesh.object.visible) {
                return;
            }
            stepChase(frame.agents, state, { lines, dashes });
            mesh.upload();
        },
        dispose() {
            mesh.dispose();
        },
    };
}
