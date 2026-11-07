// The scripted reference of the reflex cases that the memoryless controller cannot pass (brain-reflex-tests.md,
// Baselines and a valid case): `pick-safe-food` needs the food's hue, which the raw rays do not carry and pooling does.

import { inputOffsets, OUTPUT_COUNT, OUTPUT_INDEX, POOLED_STRIDE } from '../sim/brain-layout.js';
import { FLORA_DEFAULTS } from '../sim/config-flora.js';
import { poolRays } from '../sim/ray-pool.js';
import { SEEK_THRUST, eachAlive, write } from './scripted-parts.js';

/** Hues are compared with the safe plant's: the nearer of the two strongest food hits wins. */
const SAFE_HUE = FLORA_DEFAULTS.grass.hue;

/**
 * Pools the slot's rays and heads for the food hit whose hue is nearer the safe plant's.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {void}
 */
function seekSafe(world, slot) {
    poolRays(world, slot);
    const offsets = inputOffsets(world.config);
    const row = slot * world.layout.inputCount + offsets.pooled.food;
    const hueAt = slot * world.layout.inputCount + offsets.foodHueStart;
    const near = (/** @type {number} */ hit) => Math.abs(world.pooled[hueAt + hit] - SAFE_HUE);
    const hit = world.pooled[row + POOLED_STRIDE / 2] > 0 && near(1) < near(0) ? 1 : 0;
    const base = row + hit * (POOLED_STRIDE / 2);
    const seen = world.pooled[base] > 0;
    const sine = world.pooled[base + 2];
    write(world, slot, seen ? SEEK_THRUST : 0, seen ? Math.sign(sine) : 0);
    world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.SPLIT] = 0;
}

/**
 * @returns {import('./reflex-eval.js').ReflexSubject} a controller that seeks the safe food of two by hue
 */
export function hueAwareSubject() {
    return { name: 'hue-aware', id: 0, weights: null, act: eachAlive(seekSafe) };
}
