// Packs the snapshot's terrain and world items for the world layer: rocks (the wall and refuge rings, with their
// `rockShape` harmonics), refuge occupancy, flora patches with fill and fruit glints, fertile and dung zones and smoke
// clouds. Pure; nothing allocates after `createWorldPack`.

import {
    CLOUD_STRIDE,
    createSections,
    OBSTACLE_STRIDE,
    PATCH_STRIDE,
    readSections,
    ZONE_STRIDE,
} from '../snapshot-view.js';
import { floraColor } from './flora-colors.js';
import { NEON, toDisplay } from './palette.js';
import { rockShape, SHAPE_FLOATS } from './rock-shape.js';
import { cloudShape } from './cloud-shape.js';

const ITEM = 4;
/** Fruit glints show above this fill. */
export const RIPE_FILL = 0.7;
/** A zone's drawn radius at full fertility, world units. */
export const ZONE_RADIUS = 46;
const BOB_HZ = 0.7;

/** @param {number} capacity rows @param {string[]} lanes extra lanes @returns {Record<string, any>} a bucket */
function bucket(capacity, lanes = []) {
    /** @type {Record<string, any>} */
    const b = { pose: new Float32Array(capacity * ITEM), neon: new Float32Array(capacity * ITEM), count: 0 };
    for (const lane of lanes) {
        b[lane] = new Float32Array(capacity * ITEM);
    }
    return b;
}

/**
 * @param {Record<string, any>} info `ready.info`
 * @param {number} seed the world seed
 * @returns {Record<string, any>} the buckets (rock, refuge, patch, fertile, dung, cloud) and the rock shapes
 */
export function createWorldPack(info, seed) {
    const rocks = Math.max(info.obstacleCount ?? 0, 1);
    const shapes = new Float32Array(rocks * SHAPE_FLOATS);
    const one = new Float32Array(SHAPE_FLOATS);
    for (let i = 0; i < rocks; i++) {
        shapes.set(rockShape(seed, i, one), i * SHAPE_FLOATS);
    }
    const zones = Math.max(info.fertileZoneMax ?? 0, 1);
    return {
        rock: bucket(rocks, ['gate', 'extra']),
        refuge: bucket(Math.max(info.terrain?.refuges?.length ?? 0, 1), ['gate']),
        patch: bucket(Math.max(info.floraPatchMax ?? 0, 1), ['gate', 'rig2']),
        fertile: bucket(zones),
        dung: bucket(zones),
        cloud: bucket(Math.max(info.maxClouds ?? 0, 1)),
        shapes,
        sections: createSections(),
        rgb: [0, 0, 0],
        shape: { radiusScale: 0, alpha: 0 },
    };
}

/**
 * @param {Record<string, any>} b a bucket
 * @param {number} o the row offset
 * @param {ArrayLike<number>} rgb a display colour
 * @param {number} fill the fill share
 * @returns {void}
 */
function color(b, o, rgb, fill) {
    b.neon[o] = rgb[0];
    b.neon[o + 1] = rgb[1];
    b.neon[o + 2] = rgb[2];
    b.neon[o + 3] = fill;
}

/**
 * @param {Float32Array} lane a vec4 lane
 * @param {number} o the row offset
 * @param {number} x
 * @param {number} y
 * @returns {void}
 */
function put2(lane, o, x, y) {
    lane[o] = x;
    lane[o + 1] = y;
}

/** @param {Record<string, any>} pack the pack @param {{f32: Float32Array}} snap the snapshot @param {import('../snapshot-view.js').Sections} s its sections @returns {void} */
function packRocks(pack, snap, s) {
    const b = pack.rock;
    b.count = Math.min(s.obstacleCount, b.pose.length / ITEM);
    for (let i = 0; i < b.count; i++) {
        const w = s.obstacleStart + i * OBSTACLE_STRIDE;
        const o = i * ITEM;
        const k = (i % (pack.shapes.length / SHAPE_FLOATS)) * SHAPE_FLOATS;
        put2(b.pose, o, snap.f32[w], snap.f32[w + 1]);
        put2(b.pose, o + 2, 0, snap.f32[w + 2]);
        color(b, o, NEON.rock, 0.28);
        put2(b.gate, o, pack.shapes[k], pack.shapes[k + 1]);
        put2(b.gate, o + 2, pack.shapes[k + 2], 0);
        put2(b.extra, o, pack.shapes[k + 3], pack.shapes[k + 4]);
        put2(b.extra, o + 2, pack.shapes[k + 5], 0);
    }
}

/** @param {Record<string, any>} pack the pack @param {Record<string, any>} info `ready.info` @param {Float32Array | null} levels refuge occupancy @returns {void} */
function packRefuges(pack, info, levels) {
    const refuges = info.terrain?.refuges ?? [];
    const b = pack.refuge;
    b.count = Math.min(refuges.length, b.pose.length / ITEM);
    for (let r = 0; r < b.count; r++) {
        const o = r * ITEM;
        b.pose[o] = refuges[r].x;
        b.pose[o + 1] = refuges[r].y;
        b.pose[o + 2] = 0;
        b.pose[o + 3] = refuges[r].radius;
        color(b, o, NEON.rock, 0);
        b.gate[o] = levels === null ? 0 : levels[r];
    }
}

/** @param {Record<string, any>} pack the pack @param {{f32: Float32Array}} snap the snapshot @param {{s: import('../snapshot-view.js').Sections, radius: number, timeSec: number}} at the sections, patch radius and time @returns {void} */
function packPatches(pack, snap, { s, radius, timeSec }) {
    const b = pack.patch;
    b.count = Math.min(s.patchCount, b.pose.length / ITEM);
    for (let i = 0; i < b.count; i++) {
        const w = s.patchStart + i * PATCH_STRIDE;
        const o = i * ITEM;
        const fill = snap.f32[w + 4];
        b.pose[o] = snap.f32[w];
        b.pose[o + 1] = snap.f32[w + 1];
        b.pose[o + 2] = 0;
        b.pose[o + 3] = radius;
        color(b, o, toDisplay(floraColor(snap.f32[w + 3], pack.rgb), pack.rgb), 0);
        b.gate[o] = fill;
        b.gate[o + 1] = fill > RIPE_FILL ? 1 : 0;
        b.rig2[o] = 1;
        b.rig2[o + 1] = 1;
        b.rig2[o + 2] = 0;
        b.rig2[o + 3] = 0.05 * Math.sin((timeSec * BOB_HZ + i * 0.37) * Math.PI * 2);
    }
}

/** @param {Record<string, any>} pack the pack @param {{f32: Float32Array, u32: Uint32Array}} snap the snapshot @param {{s: import('../snapshot-view.js').Sections, dung: number}} at the sections and the dung origin code @returns {void} */
function packZones(pack, snap, { s, dung }) {
    pack.fertile.count = 0;
    pack.dung.count = 0;
    for (let i = 0; i < s.zoneCount; i++) {
        const w = s.zoneStart + i * ZONE_STRIDE;
        const b = snap.u32[w + 3] === dung ? pack.dung : pack.fertile;
        if (b.count * ITEM >= b.pose.length) {
            continue;
        }
        const o = b.count * ITEM;
        b.count += 1;
        put2(b.pose, o, snap.f32[w], snap.f32[w + 1]);
        put2(b.pose, o + 2, 0, ZONE_RADIUS * (0.6 + 0.4 * snap.f32[w + 2]));
        color(b, o, NEON.forager, 0);
    }
}

/** @param {Record<string, any>} pack the pack @param {{f32: Float32Array}} snap the snapshot @param {{s: import('../snapshot-view.js').Sections, smokeRadius: number}} at the sections and cloud radius @returns {void} */
function packClouds(pack, snap, { s, smokeRadius }) {
    const b = pack.cloud;
    b.count = Math.min(s.cloudCount, b.pose.length / ITEM);
    for (let i = 0; i < b.count; i++) {
        const w = s.cloudStart + i * CLOUD_STRIDE;
        const o = i * ITEM;
        const shape = cloudShape(snap.f32[w + 2], pack.shape);
        put2(b.pose, o, snap.f32[w], snap.f32[w + 1]);
        put2(b.pose, o + 2, i * 0.7, smokeRadius * shape.radiusScale);
        const k = Math.max(shape.alpha, 0);
        put2(b.neon, o, NEON.select[0] * k, NEON.select[1] * k);
        put2(b.neon, o + 2, NEON.select[2] * k, 0);
    }
}

/**
 * @param {{f32: Float32Array, u32: Uint32Array}} snapshot the newest snapshot
 * @param {Record<string, any>} pack the world pack
 * @param {{info: Record<string, any>, dung: number, levels: Float32Array | null, timeSec: number}} view `ready.info`,
 *   the dung zone origin code, the refuge occupancy levels and the wall time
 * @returns {import('../snapshot-view.js').Sections} the snapshot's sections
 */
export function packWorld(snapshot, pack, { info, dung, levels, timeSec }) {
    const s = readSections(snapshot.u32, pack.sections);
    packRocks(pack, snapshot, s);
    packRefuges(pack, info, levels);
    packPatches(pack, snapshot, { s, radius: info.foodPatchRadius, timeSec });
    packZones(pack, snapshot, { s, dung });
    packClouds(pack, snapshot, { s, smokeRadius: info.smokeRadius });
    return s;
}
