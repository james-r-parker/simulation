// The megafauna, drawn by the herd model: animals blended between the two held snapshots by slot (`trackHerds`), so they
// move at the frame rate like the agents, with legs, head and gait from their clips.

import { attribute, uniform } from 'three/tsl';
import { bakeClips } from './clip-sampler.js';
import { CLIPS } from './clips.js';
import { createHerdPack, packHerds } from './herd-pack.js';
import { createHerdTrack, trackHerds } from './herd-track.js';
import { createInstances, instancedMesh, uploadInstances } from './instances.js';
import { modelMaterial } from './model-material.js';
import { HERD_MODEL } from './models-world.js';
import { RIM_PX } from './palette.js';

/**
 * @param {{info: Record<string, any>}} context `ready.info` (`herdMax`, `herdRadius`, `herdRunSpeed`)
 * @returns {import('./stage.js').Layer} the herd layer
 */
export function createHerdDraw({ info }) {
    const capacity = Math.max(info.herdMax, 1);
    const track = createHerdTrack(capacity);
    const pack = createHerdPack(capacity);
    const instances = createInstances(capacity, ['iPose', 'iNeon', 'iRig0', 'iRig1', 'iRig2'], {
        iPose: pack.pose,
        iNeon: pack.neon,
        iRig0: pack.rig0,
        iRig1: pack.rig1,
        iRig2: pack.rig2,
    });
    const pose = attribute('iPose', 'vec4');
    const neon = attribute('iNeon', 'vec4');
    const rimPx = uniform(RIM_PX.default);
    const material = modelMaterial(HERD_MODEL, {
        inputs: {
            center: pose.xy,
            angle: pose.z,
            radius: pose.w,
            color: neon.xyz,
            fill: neon.w,
            rig: [attribute('iRig0', 'vec4'), attribute('iRig1', 'vec4'), attribute('iRig2', 'vec4')],
        },
        look: { rimPx, fillShare: 0.28 },
    });
    const table = bakeClips(CLIPS);
    const rules = { track, runSpeed: info.herdRunSpeed ?? 0, radius: info.herdRadius ?? 0 };
    const ctx = { table, radius: info.herdRadius ?? 1, timeSec: 0 };
    return {
        object: instancedMesh(instances, material),
        update(frame) {
            if (frame.snapshot === null) {
                uploadInstances(instances, 0);
                return;
            }
            trackHerds(frame.prevSnapshot ?? null, frame.snapshot, frame.alpha, rules);
            ctx.timeSec = frame.nowMs / 1000;
            rimPx.value = RIM_PX[/** @type {keyof typeof RIM_PX} */ (frame.family?.palette)] ?? RIM_PX.default;
            uploadInstances(instances, packHerds(track, pack, ctx));
        },
        dispose() {
            instances.geometry.dispose();
            material.dispose();
        },
    };
}
