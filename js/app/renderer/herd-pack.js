// Packs the blended herd animals into the herd mesh's instance arrays: pose, the neon group colour and the rig from the
// graze, gallop and stampede loops by speed. Pure; nothing allocates after `createHerdPack`.

import { applyClip, restRig } from './clip-sampler.js';
import { CHANNELS } from './clips.js';
import { herdColor } from './herd-colors.js';
import { FILL_SHARE, toDisplay } from './palette.js';

const ITEM = 4;
/** Speed shares that switch the loops: grazing below the first, stampeding above the second. */
export const GRAZE_BELOW = 0.15;
export const STAMPEDE_ABOVE = 0.8;
const PHASE_STEP = 0.6180339;

/**
 * @param {number} capacity the most animals
 * @returns {{pose: Float32Array, neon: Float32Array, rig0: Float32Array, rig1: Float32Array, rig2: Float32Array,
 *   rig: Float32Array, rgb: number[], count: number}} the instance arrays and scratch
 */
export function createHerdPack(capacity) {
    const one = () => new Float32Array(capacity * ITEM);
    return {
        pose: one(),
        neon: one(),
        rig0: one(),
        rig1: one(),
        rig2: one(),
        rig: new Float32Array(CHANNELS.length),
        rgb: [0, 0, 0],
        count: 0,
    };
}

const AT = { amp: 1, rig: /** @type {Float32Array} */ (/** @type {unknown} */ (null)), at: 0 };

/**
 * @param {import('./clip-sampler.js').ClipTable} table the baked clips
 * @param {string} name a loop
 * @param {number} phase the loop's phase
 * @param {number} amp the amplitude
 * @returns {void}
 */
function loop(table, name, phase, amp) {
    AT.amp = amp;
    applyClip(table, table.ids[name], phase, AT);
}

/**
 * @param {import('./herd-track.js').HerdTrack} track the blended animals
 * @param {ReturnType<typeof createHerdPack>} pack the arrays to fill
 * @param {{table: import('./clip-sampler.js').ClipTable, radius: number, timeSec: number}} ctx the clips, the animal
 *   radius and the wall time
 * @returns {number} the animals packed
 */
export function packHerds(track, pack, { table, radius, timeSec }) {
    const { rig } = pack;
    AT.rig = rig;
    for (let i = 0; i < track.count; i++) {
        const o = i * ITEM;
        pack.pose[o] = track.x[i];
        pack.pose[o + 1] = track.y[i];
        pack.pose[o + 2] = track.heading[i];
        pack.pose[o + 3] = radius;
        toDisplay(herdColor(track.group[i], pack.rgb), pack.rgb);
        pack.neon[o] = pack.rgb[0];
        pack.neon[o + 1] = pack.rgb[1];
        pack.neon[o + 2] = pack.rgb[2];
        pack.neon[o + 3] = FILL_SHARE.default;
        restRig(rig, 0);
        const speed = track.speed[i];
        const phase = track.slot[i] * PHASE_STEP;
        const t = timeSec + phase;
        if (speed < GRAZE_BELOW) {
            loop(table, 'graze', t * table.rates[table.ids.graze], 1);
        } else if (speed > STAMPEDE_ABOVE) {
            loop(table, 'stampede', t * table.rates[table.ids.stampede], 1);
        } else {
            loop(table, 'gallop', t * table.rates[table.ids.gallop] * (0.5 + speed), speed);
        }
        for (let c = 0; c < ITEM; c++) {
            pack.rig0[o + c] = rig[c];
            pack.rig1[o + c] = rig[4 + c];
            pack.rig2[o + c] = rig[8 + c];
        }
    }
    pack.count = track.count;
    return track.count;
}
