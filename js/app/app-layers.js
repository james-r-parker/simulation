// Assembles the renderer's layers for a world, back to front, with the pools the effects player spawns into and the
// references the frame loop writes through. Called by the stage on first build, after a device loss and for each new
// world.

import { createAgentDraw } from './renderer/agent-draw.js';
import { createChaseLayer } from './renderer/chase-layer.js';
import { createScentContours, createTerritoryContours } from './renderer/contour-draw.js';
import { createEffectsPlayer } from './renderer/effects-player.js';
import { createFoodDraw } from './renderer/food-draw.js';
import { createFxBudget } from './renderer/fx-budget.js';
import { createFxLayers } from './renderer/fx-draw.js';
import { createFxPointersLayer } from './renderer/fx-pointers.js';
import { createFxPlayer } from './renderer/fx-recipes.js';
import { createFxPool } from './renderer/fx-ring.js';
import { createHerdDraw } from './renderer/herd-draw.js';
import { createBorderLines } from './renderer/line-draw.js';
import { createMateThreadLayer, createMateThreadPool } from './renderer/mate-threads.js';
import { createOverlays } from './renderer/overlays.js';
import { createVisionLayer } from './renderer/vision-layer.js';
import { createWorldLayers } from './renderer/world-draw.js';

/**
 * What the frame loop reaches the current layers through; rewritten each time the layers are built.
 * @typedef {object} LayerRefs
 * @property {ReturnType<typeof createScentContours> | null} haze the scent lens, which takes each new field
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
 * @param {import('./family-slots.js').FamilySlots} slots the family colour slots
 * @param {((effect: import('./renderer/effects-player.js').Effect) => void) | undefined} sink optional effect sink
 * @returns {{info: Record<string, any>, layout: Record<string, any>, seed: number,
 *   slots: import('./family-slots.js').FamilySlots,
 *   sink: ((effect: import('./renderer/effects-player.js').Effect) => void) | undefined}} the parts the layers read
 */
function worldOf(ready, slots, sink) {
    return { info: ready.info, layout: ready.layout, seed: ready.seed, slots, sink };
}

/**
 * @param {LayerRefs} refs the references to fill
 * @param {{info: Record<string, any>, layout: Record<string, any>, seed: number,
 *   slots: import('./family-slots.js').FamilySlots,
 *   sink: ((effect: import('./renderer/effects-player.js').Effect) => void) | undefined}} world the world and slots
 * @returns {import('./renderer/stage.js').Layer[]} the layers, back to front
 */
function buildFor(refs, { info, layout, seed, slots, sink }) {
    const agents = createAgentDraw({ info, flagBits: layout.flags, stateBits: layout.stateBits });
    const scent = createScentContours({ info });
    const threads = createMateThreadPool();
    const fx = createFxPlayer(createFxPool(), createFxBudget(), seed);
    refs.haze = scent;
    const player = createEffectsPlayer({ threads, layout, info, slots, sink, fx, tweens: agents.store.tweens });
    agents.store.fleeing = player.flee.fleeing;
    refs.player = player;
    const world = createWorldLayers({ info, layout, seed });
    const [particles, flashes] = createFxLayers({ pool: fx.pool });
    return [
        world.depth,
        world.ground,
        world.zones,
        world.patches,
        scent,
        createTerritoryContours({ info }),
        createFoodDraw({ info }),
        world.rocks,
        world.clouds,
        createHerdDraw({ info }),
        agents,
        createVisionLayer({ info }),
        world.motes,
        createChaseLayer({ info, pursuits: player.flee.pursuits }),
        createMateThreadLayer({ pool: threads }),
        createOverlays({ info }),
        particles,
        flashes,
        createFxPointersLayer({ moments: player.moments }),
        createBorderLines({ info }),
    ];
}

/**
 * @param {{refs: LayerRefs, getReady: () => Record<string, any> | null, slots: import('./family-slots.js').FamilySlots,
 *   sink?: (effect: import('./renderer/effects-player.js').Effect) => void}} options the references to fill, the newest
 *   `ready` message, the family colour slots and an optional effect sink
 * @returns {() => import('./renderer/stage.js').Layer[]} the `buildLayers` function the stage calls
 * @throws {Error} when called before a `ready` message arrived
 */
export function createLayerBuilder({ refs, getReady, slots, sink }) {
    return () => {
        const ready = getReady();
        if (ready === null) {
            throw new Error('buildLayers: no ready message yet, so there is no world to draw');
        }
        return buildFor(refs, worldOf(ready, slots, sink));
    };
}
