// The crisp agents' per-instance rig: after `packAgents` fills a bucket, `rigBucket` turns each row into the display
// rim colour and fill share, the state gates the shared parts read, the accent colours, and the twelve rig channels
// from the agent's loops (swim, stalk, flee, shiver, pant, rest, sated, sick), its jaw and its one-shot tween clip.
// Pure; nothing allocates after `createAgentRig`.

import { floraColor } from './flora-colors.js';
import { temperatureColor } from './colors.js';
import { applyClip, restRig } from './clip-sampler.js';
import { CH, CHANNELS, clipForTween } from './clips.js';
import { FILL_FLOOR, FILL_SHARE, NEON, toDisplay } from './palette.js';

const N = CHANNELS.length;
const ITEM = 4;
/** Eye scale of a juvenile. */
export const JUVENILE_EYE = 1.4;
/** How much a bitten flash lifts the body towards white. */
export const BITTEN_FLASH = 0.6;
/** Hunters stalk while the jaw is at least this open and they move slower than this share of top speed. */
export const STALK_JAW = 0.5;
export const STALK_SPEED = 0.35;

/**
 * @typedef {object} RigArrays the extra per-row arrays of one bucket
 * @property {Float32Array} neon display rim r, g, b and fill share
 * @property {Float32Array} rig0 tx, ty, rot, sx
 * @property {Float32Array} rig1 sy, open, eye, flash
 * @property {Float32Array} rig2 ring, ringAlpha, limb, head
 * @property {Float32Array} gate pregnant, sick, infected, pollen
 * @property {Float32Array} gate2 calling, in cover, gestation01, 0
 * @property {Float32Array} accent pollen colour r, g, b and the call kind (1 alarm, 2 pack call)
 * @property {Float32Array} call call colour r, g, b, 0
 */

/**
 * @param {number} capacity rows per bucket (`maxAgents`)
 * @param {number} buckets how many buckets
 * @returns {{arrays: RigArrays[], rig: Float32Array, rgb: number[]}} one set of arrays per bucket and scratch
 */
export function createAgentRig(capacity, buckets) {
    const arrays = [];
    for (let b = 0; b < buckets; b++) {
        const one = () => new Float32Array(capacity * ITEM);
        arrays.push({
            neon: one(),
            rig0: one(),
            rig1: one(),
            rig2: one(),
            gate: one(),
            gate2: one(),
            accent: one(),
            call: one(),
        });
    }
    return { arrays, rig: new Float32Array(N), rgb: [0, 0, 0] };
}

/**
 * @typedef {object} RigContext
 * @property {import('./clip-sampler.js').ClipTable} table the baked clips
 * @property {Record<string, number>} flags `ready.layout.flags`
 * @property {Record<string, number>} stateBits `ready.layout.stateBits`
 * @property {number} timeSec wall time in seconds (loops run on it)
 * @property {string} palette the family palette name
 * @property {boolean} hunter whether this bucket's spec hunts
 * @property {{cold01: number, heat01: number}} stress cold and heat stress as shares of `temperatureMax`
 * @property {import('./colors.js').TemperatureBands | null} temperatureLens the bands when the temperature lens is on
 */

const AMP = { amp: 1, rig: /** @type {Float32Array} */ (/** @type {unknown} */ (null)), at: 0 };

/**
 * @param {RigContext} ctx the context
 * @param {string} name a clip name
 * @param {number} t the phase or age
 * @param {number} amp the amplitude
 * @returns {void}
 */
function play(ctx, name, t, amp) {
    AMP.amp = amp;
    applyClip(ctx.table, ctx.table.ids[name], t, AMP);
}

/**
 * @param {RigContext} ctx the context
 * @param {string} name a loop clip
 * @param {{phase: number, rate: number, amp: number}} at the agent's phase, rate multiplier and amplitude
 * @returns {void}
 */
function loop(ctx, name, { phase, rate, amp }) {
    const id = ctx.table.ids[name];
    play(ctx, name, ctx.timeSec * ctx.table.rates[id] * rate + phase, amp);
}

const LOOP = { phase: 0, rate: 1, amp: 1 };

/**
 * @param {RigContext} ctx the context
 * @param {boolean} on whether the condition holds
 * @param {string} name its loop clip
 * @param {number} amp the amplitude
 * @returns {void}
 */
function maybe(ctx, on, name, amp) {
    if (on) {
        LOOP.amp = amp;
        loop(ctx, name, LOOP);
    }
}

/**
 * Layers the condition loops onto the rig.
 * @param {RigContext} ctx the context
 * @param {{bucket: import('./agents-pack.js').Bucket, o: number}} row the bucket and the row offset
 * @returns {void}
 */
function playLoops(ctx, { bucket, o }) {
    const speed01 = bucket.motion[o];
    LOOP.phase = bucket.motion[o + 2];
    LOOP.rate = 0.5 + speed01;
    LOOP.amp = 0.3 + 0.7 * speed01;
    loop(ctx, 'swim', LOOP);
    LOOP.rate = 1;
    LOOP.amp = 1;
    const temp = bucket.state[o];
    const bits = bucket.body[o];
    const hunting = ctx.hunter && bucket.state[o + 3] >= STALK_JAW && speed01 < STALK_SPEED;
    maybe(ctx, hunting, 'stalk', 1);
    maybe(ctx, bucket.tween[o + 3] > 0, 'flee', 1);
    const cold = ctx.stress.cold01;
    maybe(ctx, temp < cold, 'shiver', Math.min(((cold - temp) / Math.max(cold, 1e-6)) * 2, 1));
    maybe(ctx, temp > ctx.stress.heat01, 'pant', 1);
    maybe(ctx, (bits & ctx.stateBits.RESTING) !== 0, 'rest', 1);
    maybe(ctx, (bits & ctx.stateBits.SATED) !== 0, 'sated', 1);
    maybe(ctx, bucket.extra[o + 2] > 0, 'sick', 0.4 + 0.6 * bucket.body[o + 2]);
}

/**
 * @param {RigContext} ctx the context
 * @param {{bucket: import('./agents-pack.js').Bucket, o: number}} row the bucket and the row offset
 * @param {Float32Array} rig the scratch rig
 * @returns {void}
 */
function playRig(ctx, row, rig) {
    const { bucket, o } = row;
    restRig(rig, 0);
    AMP.rig = rig;
    AMP.at = 0;
    playLoops(ctx, row);
    rig[CH.open] += bucket.state[o + 3];
    rig[CH.flash] += bucket.state[o + 2] * BITTEN_FLASH;
    const clip = clipForTween(bucket.tween[o]);
    if (clip !== null) {
        play(ctx, clip, bucket.tween[o + 1], 1);
    }
    if ((bucket.body[o] & ctx.stateBits.JUVENILE) !== 0) {
        rig[CH.eye] *= JUVENILE_EYE;
    }
    rig[CH.open] = Math.min(Math.max(rig[CH.open], 0), 1);
}

/**
 * @param {Float32Array} target an array
 * @param {number} o the row offset
 * @param {Float32Array} rig the rig
 * @param {number} from its first channel
 * @returns {void}
 */
function copyRig(target, o, rig, from) {
    target[o] = rig[from];
    target[o + 1] = rig[from + 1];
    target[o + 2] = rig[from + 2];
    target[o + 3] = rig[from + 3];
}

/**
 * @param {Float32Array} target an array
 * @param {number} o the row offset
 * @param {ArrayLike<number>} rgb a colour
 * @param {number} w the fourth value
 * @returns {void}
 */
function putRgb(target, o, rgb, w) {
    target[o] = rgb[0];
    target[o + 1] = rgb[1];
    target[o + 2] = rgb[2];
    target[o + 3] = w;
}

/**
 * Writes the rim colour and fill share of one row, then its gates.
 * @param {RigContext} ctx the context
 * @param {{bucket: import('./agents-pack.js').Bucket, o: number, flags: number}} row the bucket, row offset and flags
 * @param {RigArrays} out the bucket's rig arrays
 * @param {number[]} rgb scratch
 * @returns {void}
 */
function colorRow(ctx, row, out, rgb) {
    const { bucket, o } = row;
    ROW_REF.row = row;
    const lens = ctx.temperatureLens;
    const source = lens === null ? bucket.color : temperatureColor(bucket.state[o], lens, rgb);
    rgb[0] = source[lens === null ? o : 0];
    rgb[1] = source[lens === null ? o + 1 : 1];
    rgb[2] = source[lens === null ? o + 2 : 2];
    toDisplay(rgb, rgb);
    const full = FILL_SHARE[/** @type {keyof typeof FILL_SHARE} */ (ctx.palette)] ?? FILL_SHARE.default;
    putRgb(out.neon, o, rgb, FILL_FLOOR + (full - FILL_FLOOR) * Math.min(Math.max(bucket.color[o + 3], 0), 1));
    gateRow(ctx, ROW_REF.row, out, rgb);
}

/**
 * Writes the state gates and accent colours of one row.
 * @param {RigContext} ctx the context
 * @param {{bucket: import('./agents-pack.js').Bucket, o: number, flags: number}} row the bucket, row offset and flags
 * @param {RigArrays} out the bucket's rig arrays
 * @param {number[]} rgb scratch
 * @returns {void}
 */
function gateRow(ctx, { bucket, o, flags }, out, rgb) {
    const pollen = (flags & ctx.flags.POLLEN) !== 0;
    const callKind = bucket.tween[o + 2];
    out.gate[o] = bucket.extra[o];
    out.gate[o + 1] = bucket.extra[o + 2];
    out.gate[o + 2] = bucket.extra[o + 3];
    out.gate[o + 3] = pollen ? 1 : 0;
    out.gate2[o] = callKind > 0 ? 1 : 0;
    out.gate2[o + 1] = (bucket.body[o] & ctx.stateBits.IN_COVER) !== 0 ? 1 : 0;
    out.gate2[o + 2] = bucket.body[o + 1];
    out.gate2[o + 3] = 0;
    const hue = ((flags >>> ctx.flags.POLLEN_HUE_SHIFT) & ctx.flags.POLLEN_HUE_MASK) / ctx.flags.POLLEN_HUE_MASK;
    toDisplay(floraColor(hue * 2 - 1, rgb), rgb);
    putRgb(out.accent, o, pollen ? rgb : NEON.pollen, callKind);
    putRgb(out.call, o, callKind === 2 ? NEON.huntCall : NEON.alarm, 0);
}

const ROW = { bucket: /** @type {any} */ (null), o: 0, flags: 0 };
const ROW_REF = { row: ROW };

/**
 * Fills the rig arrays of one bucket from its packed rows.
 * @param {import('./agents-pack.js').Bucket & {index: Int32Array}} bucket a bucket `packAgents` filled
 * @param {import('../interpolate.js').Interpolated} agents the blended agents (for the flags)
 * @param {{rig: ReturnType<typeof createAgentRig>, out: RigArrays, ctx: RigContext}} into the rig scratch, this
 *   bucket's arrays and the context
 * @returns {void}
 */
export function rigBucket(bucket, agents, { rig, out, ctx }) {
    const row = ROW;
    row.bucket = bucket;
    for (let r = 0; r < bucket.count; r++) {
        row.o = r * ITEM;
        row.flags = agents.flags[bucket.index[r]];
        colorRow(ctx, row, out, rig.rgb);
        playRig(ctx, row, rig.rig);
        copyRig(out.rig0, row.o, rig.rig, 0);
        copyRig(out.rig1, row.o, rig.rig, 4);
        copyRig(out.rig2, row.o, rig.rig, 8);
    }
}
