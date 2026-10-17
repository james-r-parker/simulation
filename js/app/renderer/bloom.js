// Bloom: the frame renders into a half-float target, `UnrealBloomPass` lifts what is above its threshold and
// `OutputPass` encodes the result for the screen. A browser shell (the browser spec covers it): it needs a GL context.

import { HalfFloatType, Vector2, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/** The bloom settings; the tuning lives here. Colours above 1 (energetic cores) are what glows. */
export const BLOOM = Object.freeze({
    /** How much of the blurred light is added back. */
    strength: 0.32,
    /** 0 keeps `factors` as written; towards 1 the wide mips gain weight. */
    radius: 0,
    /** The weight of each of the five blur levels, finest first. The widest are kept small so the glow stays near its source and the black stays black. */
    factors: Object.freeze([1.0, 0.7, 0.38, 0.12, 0.03]),
    /** The luminance the bright pass starts at. */
    threshold: 0.85,
});

/**
 * @typedef {object} Bloom
 * @property {(width: number, height: number) => void} setSize resizes the frame, in device pixels
 * @property {(scale: number) => void} setScale sets the bloom resolution as a share of the frame (1 or 0.5)
 * @property {() => void} render draws the scene through the passes to the screen
 * @property {() => void} dispose frees the targets and passes
 */

/**
 * @param {{renderer: any, scene: any, camera: any, width: number, height: number}} options the renderer, the scene
 *   and camera to draw, and the frame size in device pixels
 * @returns {Bloom} the bloom pipeline
 */
export function createBloom({ renderer, scene, camera, width, height }) {
    const target = new WebGLRenderTarget(width, height, { type: HalfFloatType, depthBuffer: false });
    const composer = new EffectComposer(renderer, target);
    const pass = new UnrealBloomPass(new Vector2(width, height), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
    pass.compositeMaterial.uniforms.bloomFactors.value = [...BLOOM.factors];
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(pass);
    composer.addPass(new OutputPass());
    let scale = 1;
    const size = { width, height };
    const apply = () => pass.setSize(Math.max(2, size.width * scale), Math.max(2, size.height * scale));
    return {
        setSize(w, h) {
            size.width = w;
            size.height = h;
            composer.setSize(w, h);
            apply();
        },
        setScale(s) {
            scale = s;
            apply();
        },
        render: () => composer.render(),
        dispose() {
            composer.dispose();
            pass.dispose();
        },
    };
}
