// The world layers, back to front: the ground (frost ticks and drought cracks), the zones, the flora patches, the rocks
// and refuges, the smoke clouds and the season motes. One shared pack is written per frame by the ground layer, which
// draws first; the others read it.

import { appLog } from '../app-log.js';
import { createGroundPack, MOTE_ROLES, packGround } from './ground-pack.js';
import { createModelMeshes } from './model-meshes.js';
import { MARK_MODELS, MOTE_MODELS, PATCH_MODEL, REFUGE_MODEL, ROCK_MODEL, ZONE_MODELS } from './models-world.js';
import { FILL_SHARE, NEON } from './palette.js';
import { createRefugeOccupancy, stepRefugeOccupancy } from './refuge-occupancy.js';
import { createWorldPack, packWorld } from './world-pack.js';

const [FROST, CRACK, CLOUD] = MARK_MODELS;

/**
 * @param {{pose: Float32Array, neon: Float32Array, count: number}} b a bucket
 * @param {readonly number[]} rgb a role colour
 * @returns {void}
 */
function paint(b, rgb) {
    for (let o = 0; o < b.neon.length; o += 4) {
        b.neon[o] = rgb[0];
        b.neon[o + 1] = rgb[1];
        b.neon[o + 2] = rgb[2];
        b.neon[o + 3] = FILL_SHARE.default;
    }
}

/**
 * @param {{world: Record<string, any>, ground: Record<string, any>}} packs the packs
 * @returns {Record<string, ReturnType<typeof createModelMeshes>>} the mesh groups
 */
function meshGroups({ world, ground }) {
    const one = (/** @type {any} */ b) => Math.max(b.pose.length / 4, 1);
    return {
        ground: createModelMeshes([FROST, CRACK], {
            capacity: one(ground.frost),
            buckets: [ground.frost, ground.crack],
        }),
        zones: createModelMeshes(ZONE_MODELS, { capacity: one(world.fertile), buckets: [world.fertile, world.dung] }),
        patches: createModelMeshes([PATCH_MODEL], {
            capacity: one(world.patch),
            buckets: [world.patch],
            more: ({ gate }) => ({ values: { fill: gate.x, ripe: gate.y } }),
        }),
        rocks: createModelMeshes([ROCK_MODEL, REFUGE_MODEL], {
            capacity: Math.max(one(world.rock), one(world.refuge)),
            buckets: [world.rock, world.refuge],
            more: ({ gate, extra }) => ({ blob: { amp: gate.xyz, phase: extra.xyz }, values: { level: gate.x } }),
        }),
        clouds: createModelMeshes([CLOUD], { capacity: one(world.cloud), buckets: [world.cloud] }),
        motes: createModelMeshes(MOTE_MODELS, { capacity: one(ground.moteBuckets[0]), buckets: ground.moteBuckets }),
    };
}

/**
 * @param {{info: Record<string, any>, layout: Record<string, any>, seed: number}} context `ready.info`,
 *   `ready.layout` and the world seed
 * @returns {Record<string, import('./stage.js').Layer>} the six layers by name, to be mounted in that order
 */
export function createWorldLayers({ info, layout, seed }) {
    const world = createWorldPack(info, seed);
    const ground = createGroundPack(info, seed);
    paint(ground.frost, NEON.frost);
    paint(ground.crack, NEON.dust);
    ground.moteBuckets.forEach((/** @type {any} */ b, /** @type {number} */ s) =>
        paint(b, NEON[/** @type {keyof typeof NEON} */ (MOTE_ROLES[s])]),
    );
    const groups = meshGroups({ world, ground });
    const occupancy = createRefugeOccupancy(info);
    const dung = layout.zoneOrigins?.DUNG ?? 1;
    const view = { info, dung, levels: occupancy.level, timeSec: 0 };
    const groundView = { timeSec: 0, season: 0, seasonProgress: 0, droughtBasin: -1 };
    if (!info.terrain) {
        appLog('warn', 'WorldTerrainMissing', {});
    }
    /** @type {Record<string, import('./stage.js').Layer>} */
    const layers = {};
    for (const [name, group] of Object.entries(groups)) {
        layers[name] = {
            object: group.object,
            update(frame) {
                group.setPalette(frame.family?.palette);
                if (name === 'ground' && frame.snapshot !== null) {
                    stepRefugeOccupancy(occupancy, frame.agents, frame.nowMs);
                    view.timeSec = frame.nowMs / 1000;
                    const s = packWorld(frame.snapshot, world, view);
                    groundView.timeSec = view.timeSec;
                    groundView.season = frame.season;
                    groundView.seasonProgress = frame.seasonProgress;
                    groundView.droughtBasin = s.droughtBasin;
                    packGround(ground, groundView);
                }
                if (frame.snapshot === null) {
                    group.clear();
                    return;
                }
                group.upload();
            },
            dispose: () => group.dispose(),
        };
    }
    return layers;
}
