// The wake: two thin lines trailing from the rear flanks of a body that is running flat out, fading to nothing along their
// length. Only running hunters and the prey they are pursued by wear one, and at most `MAX_WAKES` bodies a frame, so a
// crowd of 500 stays quiet. Pure over the line buffer.

import { pushVertex, setLineColor } from './line-buffer.js';
import { NEON } from './palette.js';
import { sprintAmp } from './hunt-cues.js';

/** The share of top speed at which a body starts to leave a wake. */
export const WAKE_FROM = 0.55;
/** The most bodies that leave a wake in one frame. */
export const MAX_WAKES = 64;
/** The wake's alpha at the body at top speed. */
export const WAKE_ALPHA = 0.4;
/** The wake's length in body radii at `WAKE_FROM` and at top speed. */
export const WAKE_LENGTH = Object.freeze({ min: 1.5, max: 4.5 });
/** How far from the heading axis each line starts, in body radii, and how far behind the centre. */
const FLANK = 0.32;
const REAR = 0.85;

/**
 * @param {number} speed01 the body's speed share of the top speed
 * @returns {number} its wake strength: 0 below `WAKE_FROM`, rising to 1 at top speed
 */
export function wakeStrength(speed01) {
    return Math.min(Math.max((speed01 - WAKE_FROM) / (1 - WAKE_FROM), 0), 1);
}

/**
 * Pushes one body's two wake lines.
 * @param {import('./line-buffer.js').LineBuffer} lines the buffer
 * @param {{x: number, y: number, angle: number, size: number, speed01: number}} body the body
 * @param {ArrayLike<number>} rgb the wake's display colour
 * @returns {boolean} whether it left a wake (false below `WAKE_FROM`)
 */
export function pushWake(lines, { x, y, angle, size, speed01 }, rgb) {
    const strength = wakeStrength(speed01);
    if (strength === 0) {
        return false;
    }
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const length = size * (WAKE_LENGTH.min + (WAKE_LENGTH.max - WAKE_LENGTH.min) * sprintAmp(speed01));
    const alpha = WAKE_ALPHA * (0.4 + 0.6 * strength);
    for (let k = 0; k < 2; k++) {
        const side = 1 - 2 * k;
        const startX = x - c * size * REAR - s * size * FLANK * side;
        const startY = y - s * size * REAR + c * size * FLANK * side;
        setLineColor(lines, rgb, alpha);
        pushVertex(lines, startX, startY);
        setLineColor(lines, rgb, 0);
        pushVertex(lines, startX - c * length, startY - s * length);
    }
    return true;
}

const BODY = { x: 0, y: 0, angle: 0, size: 0, speed01: 0 };

/**
 * Pushes a wake for each running hunter and each fleeing prey, up to `MAX_WAKES`.
 * @param {import('../interpolate.js').Interpolated} agents the frame's agents
 * @param {{canHunt: Uint8Array, maxVelocity: number}} rules who hunts and the speed scale
 * @param {{lines: import('./line-buffer.js').LineBuffer, fleeing: Uint8Array | null}} into the buffer and the prey marks
 *   (1 for an agent index under pursuit)
 * @returns {number} bodies that left a wake
 */
export function pushWakes(agents, rules, { lines, fleeing }) {
    let drawn = 0;
    for (let i = 0; i < agents.count && drawn < MAX_WAKES; i++) {
        const hunter = rules.canHunt[agents.spec[i]] === 1;
        if (!hunter && (fleeing === null || fleeing[i] !== 1)) {
            continue;
        }
        BODY.x = agents.x[i];
        BODY.y = agents.y[i];
        BODY.angle = agents.angle[i];
        BODY.size = agents.size[i];
        BODY.speed01 = agents.speed[i] / rules.maxVelocity;
        if (pushWake(lines, BODY, hunter ? NEON.hunter : NEON.frost)) {
            drawn += 1;
        }
    }
    return drawn;
}
