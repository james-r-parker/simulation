// Assembles the renderer's layers for a world: the ones the scene draws before the bloom, the motes after it, the
// pools the effects player spawns into and the references the frame loop writes through. Called by the scene on first
// build, after a context restore and for each new world.

import { createAgentsLayer } from './renderer/agents-layer.js';
import { createEffectsPlayer } from './renderer/effects-player.js';
import { createHazeLayer } from './renderer/haze-layer.js';
import { createOverlays } from './renderer/overlays.js';
import { createParticles } from './renderer/particles.js';
import { createRingLayer, createRingPool } from './renderer/rings.js';
import { createSmokeLayer } from './renderer/smoke-layer.js';
import { createSparkLayer, createSparkPool } from './renderer/sparks.js';
import { createBorderLayer, createFoodLayer, createObstacleLayer } from './renderer/world-layers.js';

/**
 * What the frame loop reaches the current layers through; rewritten each time the layers are built.
 * @typedef {object} LayerRefs
 * @property {ReturnType<typeof createHazeLayer> | null} haze the scent haze, which takes each new field
 * @property {ReturnType<typeof createEffectsPlayer> | null} player the effects player
 */

/**
 * @returns {LayerRefs} empty references, filled by the first build
 */
export function createLayerRefs() {
    return { haze: null, player: null };
}

/**
 * @param {Record<string, any>} ready the `ready` message of the world to draw
 * @returns {{info: Record<string, any>, layout: Record<string, any>, seed: number}} the parts the layers read
 */
function worldOf(ready) {
    return { info: ready.info, layout: ready.layout, seed: ready.seed };
}

/**
 * @param {LayerRefs} refs the references to fill
 * @param {{info: Record<string, any>, layout: Record<string, any>, seed: number}} world the world
 * @returns {import('./renderer/scene.js').LayerSet} the layers
 */
function buildFor(refs, { info, layout, seed }) {
    const agents = createAgentsLayer({ info, flagBits: layout.flags });
    const haze = createHazeLayer({ info });
    const smoke = createSmokeLayer({ info });
    agents.setSmokeTexture(smoke.texture);
    const rings = createRingPool();
    const sparks = createSparkPool(seed);
    refs.haze = haze;
    refs.player = createEffectsPlayer({ rings, sparks, layout, info });
    return {
        layers: [
            haze,
            createFoodLayer({ info }),
            createObstacleLayer({ info }),
            agents,
            smoke,
            createRingLayer({ pool: rings }),
            createSparkLayer({ pool: sparks }),
            createOverlays({ info }),
            createBorderLayer({ info }),
        ],
        afterBloom: [createParticles({ seed })],
    };
}

/**
 * @param {{refs: LayerRefs, getReady: () => Record<string, any> | null}} options the references to fill and the newest
 *   `ready` message (the layers are built from the world it describes)
 * @returns {() => import('./renderer/scene.js').LayerSet} the `buildLayers` function the scene calls
 * @throws {Error} when called before a `ready` message arrived
 */
export function createLayerBuilder({ refs, getReady }) {
    return () => {
        const ready = getReady();
        if (ready === null) {
            throw new Error('buildLayers: no ready message yet, so there is no world to draw');
        }
        return buildFor(refs, worldOf(ready));
    };
}
