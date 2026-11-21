// Stages one subject and one object in a small empty world and reads the subject's brain row, for the interface checks
// (docs/designs/senses-and-motor.md, Phase 1). Distances are along the subject's heading (`forward`) and to its
// positive-sine side (`side`), so a scene is written in the frame the brain sees.

import { POOLED_CHANNELS, POOLED_STRIDE, POOLED_VALUES } from '../../../js/sim/brain-layout.js';
import { poolRays } from '../../../js/sim/ray-pool.js';
import { senseAll } from '../../../js/sim/sensors.js';
import { visionOf } from '../../../js/sim/traits.js';
import { addAgent, addCloud, addFood, rebuild, senseWorld } from './sense-world.js';
import { setSpec } from './body.js';

export const FORAGER = 0;
export const PREDATOR = 1;
/** Where the subject stands: the middle of an arena wide enough that no wall is inside any view. */
export const CENTRE = 1500;
const ARENA = 3000;
const BODY_SIZE = 25;
const ITEM_SIZE = 10;

/**
 * One channel's staging: the subject's spec, and a function that puts one item at a world point.
 * @type {Readonly<Record<string, {subject: number, put: (w: any, x: number, y: number) => unknown}>>}
 */
export const KINDS = Object.freeze({
    food: { subject: FORAGER, put: (w, x, y) => addFood(w, x, y, ITEM_SIZE) },
    threat: { subject: FORAGER, put: (w, x, y) => putAgent(w, x, y, { spec: PREDATOR }) },
    prey: { subject: PREDATOR, put: (w, x, y) => putAgent(w, x, y, { spec: FORAGER }) },
    other: { subject: FORAGER, put: (w, x, y) => putAgent(w, x, y, { spec: FORAGER }) },
    kin: { subject: FORAGER, put: (w, x, y) => putAgent(w, x, y, { spec: FORAGER, kin: true }) },
    obstacle: { subject: FORAGER, put: (w, x, y) => putRock(w, x, y) },
    smoke: { subject: FORAGER, put: (w, x, y) => addCloud(w, x, y) },
});

/**
 * @param {any} w the world
 * @param {number} x centre x
 * @param {number} y centre y
 * @param {{spec: number, kin?: boolean}} body its specialisation, and whether it is the subject's child
 * @returns {number} the slot
 */
function putAgent(w, x, y, { spec, kin = false }) {
    const slot = addAgent(w, x, y, BODY_SIZE);
    setSpec(w, slot, spec);
    if (kin) {
        w.parentA[slot] = w.genomeId[0];
    }
    return slot;
}

/**
 * @param {any} w the world
 * @param {number} x centre x
 * @param {number} y centre y
 * @returns {void}
 */
function putRock(w, x, y) {
    w.obsX[0] = x;
    w.obsY[0] = y;
    w.obsRadius[0] = ITEM_SIZE;
}

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {any} an empty `ARENA` square world with 16 rays and the subject (slot 0) at `CENTRE`
 */
export function stageSubject(over = {}) {
    const w = senseWorld({ rayCount: 16, worldWidth: ARENA, worldHeight: ARENA, ...over });
    return w;
}

/**
 * Adds the subject: slot 0, so `putAgent` can name it a parent.
 * @param {any} w the world from `stageSubject`
 * @param {{spec?: number, angle?: number, at?: {x: number, y: number}}} [opts] its spec, heading and place
 * @returns {number} the subject's slot (0)
 */
export function addSubject(w, { spec = FORAGER, angle = 0, at = { x: CENTRE, y: CENTRE } } = {}) {
    const slot = addAgent(w, at.x, at.y, BODY_SIZE);
    setSpec(w, slot, spec);
    w.angle[slot] = angle;
    w.energy[slot] = w.maxEnergyBySpec[spec] / 2;
    return slot;
}

/**
 * @param {any} w the world
 * @param {number} slot the subject
 * @param {{forward: number, side: number}} offset the item's place in the subject's frame
 * @returns {{x: number, y: number}} the world point
 */
export function worldPoint(w, slot, { forward, side }) {
    const c = Math.cos(w.angle[slot]);
    const s = Math.sin(w.angle[slot]);
    return { x: w.x[slot] + forward * c - side * s, y: w.y[slot] + forward * s + side * c };
}

/**
 * Senses every agent and pools the subject's row.
 * @param {any} w the world
 * @param {number} [slot] the subject
 * @returns {Float32Array} a copy of the subject's pooled row (`layout.inputCount` values)
 */
export function brainRow(w, slot = 0) {
    senseAll(w, rebuild(w));
    poolRays(w, slot);
    const n = w.layout.inputCount;
    return w.pooled.slice(slot * n, (slot + 1) * n);
}

/**
 * @param {ArrayLike<number>} row a pooled row
 * @param {string} channel a name of `POOLED_CHANNELS`
 * @param {number} [hit] 0 for the strongest hit, 1 for the second
 * @returns {{strength: number, cos: number, sin: number}} the hit's three values
 */
export function hitOf(row, channel, hit = 0) {
    const at = POOLED_CHANNELS.indexOf(channel) * POOLED_STRIDE + hit * 3;
    return { strength: row[at], cos: row[at + 1], sin: row[at + 2] };
}

/**
 * @param {ArrayLike<number>} row a pooled row
 * @param {number} k a body input index (0 is energy)
 * @returns {number} the value
 */
export const bodyInput = (row, k) => row[POOLED_VALUES + k];

/**
 * @param {any} w the world
 * @param {number} slot the subject
 * @returns {number} its view range
 */
export const viewOf = (w, slot) => visionOf(w, slot);
