// Packs the live effect instances of the ring into one bucket per particle shape (`FX_SHAPES`), plus a glow bucket for
// the brief event flashes. Each instance's age gives its eased time, its keyed scale and brightness and its motion in
// closed form (out, in, rise, fall, orbit), as the deleted GLSL did. Pure; nothing allocates after `createFxPack`.

import { easeAt, FLAG_CALL, FX_CURVES, FX_EASE, FX_MOTIONS, FX_SHAPES, keysAt } from './fx-curves.js';
import { FX_CAPACITY } from './fx-ring.js';
import { toDisplay } from './palette.js';

const ITEM = 4;
/** The curve drawn as a soft glow instead of a crisp shape: the event flash. */
export const GLOW_CURVE = 'flash';
const CURVE_SHAPE = FX_CURVES.map((c) => FX_SHAPES.indexOf(c.shape));
const CURVE_MOTION = FX_CURVES.map((c) => FX_MOTIONS.indexOf(c.motion));
const CURVE_EASE = FX_CURVES.map((c) => FX_EASE.indexOf(c.ease));
const CURVE_GLOW = FX_CURVES.map((c) => c.name === GLOW_CURVE);

/** @param {number} capacity rows @returns {{pose: Float32Array, neon: Float32Array, rig0: Float32Array, count: number}} a bucket */
function bucket(capacity) {
    return {
        pose: new Float32Array(capacity * ITEM),
        neon: new Float32Array(capacity * ITEM),
        rig0: new Float32Array(capacity * ITEM),
        count: 0,
    };
}

/**
 * @param {number} [capacity] rows per bucket
 * @returns {{buckets: ReturnType<typeof bucket>[], glow: ReturnType<typeof bucket>}} one bucket per shape and the glow
 */
export function createFxPack(capacity = FX_CAPACITY) {
    return { buckets: FX_SHAPES.map(() => bucket(capacity)), glow: bucket(capacity) };
}

const MOVE = { x: 0, y: 0 };

/**
 * @param {number} motion an `FX_MOTIONS` index
 * @param {{t: number, angle: number, reach: number, seed: number}} at the eased time, heading, reach and seed
 * @returns {{x: number, y: number}} the offset from the spawn point (a shared scratch)
 */
export function motionAt(motion, { t, angle, reach, seed }) {
    const wobble = seed * Math.PI * 2;
    if (motion === 3 || motion === 4) {
        const rise = motion === 3;
        MOVE.x = Math.sin(t * (rise ? 6 : 5) + wobble) * reach * (rise ? 0.12 : 0.1);
        MOVE.y = rise ? reach * t : -reach * t;
        return MOVE;
    }
    const along = motion === 1 ? t : motion === 2 || motion === 5 ? 1 - t : 0;
    const a = motion === 5 ? angle + t * Math.PI : angle;
    MOVE.x = Math.cos(a) * reach * along;
    MOVE.y = Math.sin(a) * reach * along;
    return MOVE;
}

const AT = { t: 0, angle: 0, reach: 0, seed: 0 };
const RGB = [0, 0, 0];
/** The least intensity a recipe's gain gives an effect, so a dim recipe still reads on black. */
export const MIN_GAIN = 0.75;

/**
 * Writes an instance's colour lifted to the neon lightness (`toDisplay`) and scaled by its intensity.
 * @param {Float32Array} neon a bucket's colour lane
 * @param {number} r the row offset
 * @param {import('./fx-ring.js').FxPool} pool the ring, `RING_ROW` naming the instance
 * @param {number} k the intensity, 0 to 1
 * @returns {void}
 */
function neonRow(neon, r, pool, k) {
    const o = RING_ROW.o;
    RGB[0] = pool.color[o];
    RGB[1] = pool.color[o + 1];
    RGB[2] = pool.color[o + 2];
    toDisplay(RGB, RGB);
    neon[r] = RGB[0] * k;
    neon[r + 1] = RGB[1] * k;
    neon[r + 2] = RGB[2] * k;
}

const RING_ROW = { o: 0 };

/**
 * @param {Float32Array} rig0 a bucket's first rig lane
 * @param {number} r the row offset
 * @param {number} stretch length over width along the heading
 * @returns {void}
 */
function stretchRow(rig0, r, stretch) {
    rig0[r] = 0;
    rig0[r + 1] = 0;
    rig0[r + 2] = 0;
    rig0[r + 3] = Math.max(stretch, 1);
}

/**
 * @param {import('./fx-ring.js').FxPool} pool the ring
 * @param {ReturnType<typeof createFxPack>} pack the buckets
 * @param {{tick: number, zoom: number, callBoost: number, contrast: number}} view the playhead tick, zoom, the calls lens
 *   boost and the high-contrast gain
 * @returns {number} the live instances packed
 */
export function packFx(pool, pack, { tick, zoom, callBoost, contrast }) {
    for (const b of pack.buckets) {
        b.count = 0;
    }
    pack.glow.count = 0;
    if (Number.isNaN(pool.base)) {
        return 0;
    }
    const now = tick + pool.clockOffset - pool.base;
    let live = 0;
    for (let i = 0; i < pool.limit; i++) {
        const o = i * ITEM;
        const age = (now - pool.time[o]) / pool.time[o + 1];
        if (!(age >= 0 && age < 1)) {
            continue;
        }
        RING_ROW.o = o;
        const c = pool.time[o + 2] | 0;
        const curve = FX_CURVES[c];
        if (curve === undefined) {
            continue;
        }
        const t = easeAt(age, CURVE_EASE[c]);
        const glow = (curve.flags & FLAG_CALL) !== 0 ? callBoost : 1;
        const bright = Math.min(keysAt(curve.alpha, t) * glow, 1);
        AT.t = t;
        AT.angle = pool.pose[o + 2];
        AT.reach = pool.move[o];
        AT.seed = pool.time[o + 3];
        const move = motionAt(CURVE_MOTION[c], AT);
        const b = CURVE_GLOW[c] ? pack.glow : pack.buckets[CURVE_SHAPE[c]];
        const r = b.count * ITEM;
        b.count += 1;
        live += 1;
        b.pose[r] = pool.pose[o] + move.x;
        b.pose[r + 1] = pool.pose[o + 1] + move.y;
        b.pose[r + 2] = AT.angle;
        b.pose[r + 3] = Math.max(
            pool.pose[o + 3] * keysAt(curve.scale, t),
            (0.5 * pool.move[o + 2]) / Math.max(zoom, 1e-6),
        );
        neonRow(b.neon, r, pool, bright * Math.min(1, Math.max(pool.color[o + 3] * contrast, MIN_GAIN)));
        b.neon[r + 3] = 0.28;
        stretchRow(b.rig0, r, pool.move[o + 1]);
    }
    return live;
}
