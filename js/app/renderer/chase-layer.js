// Chase tethers: while a hunter runs at a smaller blob that is running away, a dashed warm line joins the hunter's nose to
// its prey, brighter the closer the gap. It reads the pursuits of the blended frame (`js/app/pursuit.js`), so a viewer can
// see who is hunting whom without opening the inspector.

import { clearLines, createLineBuffer, pushVertex, setLineColor } from './line-buffer.js';
import { createLineMesh } from './line-draw.js';
import { NEON } from './palette.js';
import { MAX_WAKES, pushWakes } from './wake.js';
import { createPursuits, findPursuits, MAX_PURSUITS, pursuitRules } from '../pursuit.js';

/** Dashes per tether at level 0 and at level 1. */
export const CHASE_DASHES = 8;
/** The tether's display colour and its alpha at touching range: a faint thread, fainter than the cells it joins. */
export const CHASE_COLOR = NEON.huntCall;
export const CHASE_ALPHA = 0.3;

const SCRATCH = [0, 0, 0];
/** Segments the layer's buffer holds: the tethers' dashes and two wake lines a body. */
const CAPACITY = MAX_PURSUITS * CHASE_DASHES + MAX_WAKES * 2;

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
 * @param {{pursuits: import('../pursuit.js').Pursuits, rules: ReturnType<typeof pursuitRules>, find?: boolean,
 *   fleeing?: Uint8Array | null}} state the pairs and rules; `find` false when another module (the effects player) has
 *   filled the pairs this frame; `fleeing` marks the prey by agent index, for their wakes
 * @param {{lines: import('./line-buffer.js').LineBuffer, dashes: number}} target buffer and dashes per tether
 * @returns {number} tethers drawn
 */
export function stepChase(agents, { pursuits, rules, find = true, fleeing = null }, { lines, dashes }) {
    clearLines(lines);
    if (find) {
        findPursuits(agents, rules, pursuits);
    }
    for (let k = 0; k < pursuits.count; k++) {
        const h = pursuits.hunter[k];
        const p = pursuits.prey[k];
        const dx = agents.x[p] - agents.x[h];
        const dy = agents.y[p] - agents.y[h];
        const len = Math.hypot(dx, dy);
        const nose = agents.size[h];
        const edge = len - agents.size[p];
        if (edge <= nose) {
            continue;
        }
        ENDS.ax = agents.x[h] + (dx / len) * nose;
        ENDS.ay = agents.y[h] + (dy / len) * nose;
        ENDS.bx = agents.x[h] + (dx / len) * edge;
        ENDS.by = agents.y[h] + (dy / len) * edge;
        pushTether(lines, ENDS, { closeness: pursuits.closeness[k], dashes });
    }
    pushWakes(agents, rules, { lines, fleeing });
    return pursuits.count;
}

/**
 * @param {{info: Record<string, any>, pursuits?: import('../pursuit.js').Pursuits, fleeing?: Uint8Array}} options
 *   `ready.info`, the pairs the effects player finds each frame (then the layer does not search again) and the prey it
 *   marks
 * @returns {import('./stage.js').Layer} the chase layer
 */
export function createChaseLayer({ info, pursuits, fleeing }) {
    const lines = createLineBuffer(CAPACITY);
    const mesh = createLineMesh(lines);
    const state = {
        pursuits: pursuits ?? createPursuits(),
        rules: pursuitRules(info),
        find: pursuits === undefined,
        fleeing: fleeing ?? null,
    };
    const dashes = CHASE_DASHES;
    return {
        object: mesh.object,
        update(frame) {
            stepChase(frame.agents, state, { lines, dashes });
            mesh.upload();
        },
        dispose() {
            mesh.dispose();
        },
    };
}
