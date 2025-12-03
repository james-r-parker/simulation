// --- POST-PROCESSING PIPELINE ---
// Sets up post-processing effects (bloom, vignette, chromatic aberration, motion blur)

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { POST_PROCESSING } from './constants.js';
import {
    acquireVector2, releaseVector2
} from './three-object-pool.js';

/**
 * Setup post-processing pipeline
 * @param {THREE.WebGLRenderer} renderer - Three.js WebGL renderer
 * @param {THREE.Scene} scene - Three.js scene
 * @param {THREE.Camera} camera - Three.js camera
 * @param {HTMLElement} container - Container element
 * @param {Object} logger - Logger instance
 * @returns {Object} Post-processing state: { effectComposer, bloomPass, motionBlurPass, chromaticPass, vignettePass }
 */
export function setupPostProcessing(renderer, scene, camera, container, logger) {
    logger.log('[RENDER] setupPostProcessing called');
    
    try {
        logger.log('[RENDER] Attempting to create post-processing passes...');
        // Create render pass
        const renderPass = new RenderPass(scene, camera);

        // Get renderer size
        const sizeVec = acquireVector2();
        renderer.getSize(sizeVec);
        const width = sizeVec.x || container.clientWidth || window.innerWidth;
        const height = sizeVec.y || container.clientHeight || window.innerHeight;
        releaseVector2(sizeVec);

        // Create bloom pass
        const bloomSizeVec = acquireVector2();
        bloomSizeVec.set(width, height);
        const bloomPass = new UnrealBloomPass(
            bloomSizeVec,
            POST_PROCESSING.BLOOM.STRENGTH,
            POST_PROCESSING.BLOOM.RADIUS,
            POST_PROCESSING.BLOOM.THRESHOLD
        );
        releaseVector2(bloomSizeVec); // Release after use

        // Create vignette shader
        const vignetteShader = {
            uniforms: {
                tDiffuse: { value: null },
                offset: { value: POST_PROCESSING.VIGNETTE.OFFSET },
                darkness: { value: POST_PROCESSING.VIGNETTE.DARKNESS }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float offset;
                uniform float darkness;
                varying vec2 vUv;
                void main() {
                    vec4 texel = texture2D(tDiffuse, vUv);
                    vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
                    float dist = length(uv);
                    float vignette = smoothstep(0.8, offset, dist);
                    gl_FragColor = mix(texel, vec4(0.0, 0.0, 0.0, 1.0), vignette * darkness);
                }
            `
        };

        // Create chromatic aberration shader
        const chromaticAberrationShader = {
            uniforms: {
                tDiffuse: { value: null },
                offset: { value: POST_PROCESSING.CHROMATIC_ABERRATION.OFFSET }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float offset;
                varying vec2 vUv;
                void main() {
                    vec2 uv = vUv;
                    vec2 offsetVec = (uv - vec2(0.5)) * offset;
                    float r = texture2D(tDiffuse, uv + offsetVec).r;
                    float g = texture2D(tDiffuse, uv).g;
                    float b = texture2D(tDiffuse, uv - offsetVec).b;
                    gl_FragColor = vec4(r, g, b, 1.0);
                }
            `
        };

        // Create motion blur shader for fast-moving agents
        const motionBlurShader = {
            uniforms: {
                tDiffuse: { value: null },
                strength: { value: 0.5 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float strength;
                varying vec2 vUv;
                void main() {
                    vec4 color = texture2D(tDiffuse, vUv);
                    // Simple directional blur - creates motion effect
                    // This is a simplified motion blur that works without velocity data
                    vec2 blurDir = vec2(0.0, 0.0);
                    float blurAmount = 0.0;
                    
                    // Detect bright areas (likely fast-moving agents) and apply blur
                    float brightness = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                    if (brightness > 0.5) {
                        blurAmount = (brightness - 0.5) * strength;
                        blurDir = normalize(vUv - vec2(0.5)) * blurAmount;
                    }
                    
                    // Sample along blur direction with fixed loop count (8 samples)
                    vec4 blurred = color;
                    if (blurAmount > 0.01) {
                        const int samples = 8;
                        for (int i = 1; i <= samples; i++) {
                            float t = float(i) / float(samples);
                            vec2 offset = blurDir * t;
                            blurred += texture2D(tDiffuse, vUv + offset);
                        }
                        blurred /= float(samples + 1);
                    }
                    
                    gl_FragColor = blurred;
                }
            `
        };

        // Create effect composer
        const effectComposer = new EffectComposer(renderer);
        effectComposer.addPass(renderPass);
        effectComposer.addPass(bloomPass);

        let motionBlurPass = null;
        let chromaticPass = null;
        let vignettePass = null;

        // Add motion blur pass (before chromatic aberration for better effect)
        if (POST_PROCESSING.MOTION_BLUR.ENABLED) {
            motionBlurPass = new ShaderPass(motionBlurShader);
            motionBlurPass.uniforms.strength.value = POST_PROCESSING.MOTION_BLUR.STRENGTH;
            motionBlurPass.enabled = true;
            effectComposer.addPass(motionBlurPass);
        }

        // Add screen effects if enabled
        if (POST_PROCESSING.CHROMATIC_ABERRATION.ENABLED) {
            chromaticPass = new ShaderPass(chromaticAberrationShader);
            effectComposer.addPass(chromaticPass);
        }

        if (POST_PROCESSING.VIGNETTE.ENABLED) {
            vignettePass = new ShaderPass(vignetteShader);
            vignettePass.renderToScreen = true; // Last pass should render to screen
            effectComposer.addPass(vignettePass);
        } else {
            // If no vignette, determine last pass
            if (POST_PROCESSING.CHROMATIC_ABERRATION.ENABLED && chromaticPass) {
                chromaticPass.renderToScreen = true;
            } else if (POST_PROCESSING.MOTION_BLUR.ENABLED && motionBlurPass) {
                motionBlurPass.renderToScreen = true;
            } else {
                bloomPass.renderToScreen = true;
            }
        }

        // Update bloom pass properties to match constants
        bloomPass.strength = POST_PROCESSING.BLOOM.STRENGTH;
        bloomPass.radius = POST_PROCESSING.BLOOM.RADIUS;
        bloomPass.threshold = POST_PROCESSING.BLOOM.THRESHOLD;
        
        logger.log(`[RENDER] Bloom pass configured: strength=${bloomPass.strength}, radius=${bloomPass.radius}, threshold=${bloomPass.threshold}`);
        logger.log('[RENDER] Post-processing pipeline initialized successfully');
        logger.log(`[RENDER] Bloom: strength=${POST_PROCESSING.BLOOM.STRENGTH}, radius=${POST_PROCESSING.BLOOM.RADIUS}, threshold=${POST_PROCESSING.BLOOM.THRESHOLD}`);
        logger.log(`[RENDER] Vignette: ${POST_PROCESSING.VIGNETTE.ENABLED ? 'enabled' : 'disabled'}`);
        logger.log(`[RENDER] Chromatic Aberration: ${POST_PROCESSING.CHROMATIC_ABERRATION.ENABLED ? 'enabled' : 'disabled'}`);

        return {
            effectComposer,
            bloomPass,
            motionBlurPass,
            chromaticPass,
            vignettePass
        };
    } catch (error) {
        logger.warn('[RENDER] Failed to initialize post-processing, falling back to basic rendering:', error);
        logger.warn('[RENDER] Post-processing error details:', error.message, error.stack);
        return null;
    }
}





