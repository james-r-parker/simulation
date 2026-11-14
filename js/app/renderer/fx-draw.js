// The effect particles: one additive instanced mesh per particle shape, drawn by its catalogue model from `packFx`'s
// buckets, and the event flash glow, a soft radial disc that is the only glow the renderer draws (it lasts at most the
// flash curve's life, 24 ticks or the 250 ms wall floor).

import { AdditiveBlending, MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute, float, length, max, positionGeometry, pow, varying, vec3 } from 'three/tsl';
import { createInstances, instancedMesh, uploadInstances } from './instances.js';
import { createModelMeshes } from './model-meshes.js';
import { PARTICLE_MODELS } from './models-particles.js';
import { HIGH_CONTRAST_GAIN } from './fx-ring.js';
import { createFxPack, packFx } from './fx-pack.js';

/** The calls lens raises call effects by this much. */
export const CALL_BOOST = 1 / 0.35;
/** The glow disc's radius over the flash's size. */
export const GLOW_REACH = 2.2;

/**
 * @returns {any} an additive material drawing a soft disc that falls to black at its rim
 */
function glowMaterial() {
    const pose = attribute('iPose', 'vec4');
    const neon = attribute('iNeon', 'vec4');
    const corner = positionGeometry.xy;
    const material = new MeshBasicNodeMaterial();
    material.transparent = true;
    material.depthTest = false;
    material.depthWrite = false;
    material.blending = AdditiveBlending;
    material.positionNode = vec3(corner.mul(pose.w.mul(GLOW_REACH)).add(pose.xy), 0);
    const fall = pow(max(float(1).sub(length(varying(corner))), 0), 2);
    material.colorNode = neon.xyz.mul(fall);
    return material;
}

/**
 * @param {{pool: import('./fx-ring.js').FxPool}} context the effect ring the recipes spawn into
 * @returns {import('./stage.js').Layer[]} the particle layer and the flash layer, to mount in that order
 */
export function createFxLayers({ pool }) {
    const pack = createFxPack();
    const particles = createModelMeshes(PARTICLE_MODELS, { buckets: pack.buckets, blending: AdditiveBlending });
    const glowInstances = createInstances(pack.glow.pose.length / 4, ['iPose', 'iNeon'], {
        iPose: pack.glow.pose,
        iNeon: pack.glow.neon,
    });
    const glowMat = glowMaterial();
    const view = { tick: 0, zoom: 1, callBoost: 1, contrast: 1 };
    return [
        {
            object: particles.object,
            update(frame) {
                view.tick = frame.tick;
                view.zoom = frame.camera.zoom;
                view.callBoost = frame.lenses.calls ? CALL_BOOST : 1;
                view.contrast = frame.family?.palette === 'high-contrast' ? HIGH_CONTRAST_GAIN : 1;
                particles.setPalette(frame.family?.palette);
                packFx(pool, pack, view);
                particles.upload();
                uploadInstances(glowInstances, pack.glow.count);
            },
            dispose: () => particles.dispose(),
        },
        {
            object: instancedMesh(glowInstances, glowMat),
            dispose() {
                glowInstances.geometry.dispose();
                glowMat.dispose();
            },
        },
    ];
}
