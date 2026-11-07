// The brain phase in the WASM kernels (docs/designs/wasm-kernels.md): one `brain_forward` call runs the pooling,
// the hidden step, the outputs and Hebbian learning for every alive slot, bit-identical to the JS kernel it replaced. The
// parameter block is written once when the world is attached; nothing crosses the boundary per agent.

import {
    EXTRA_INPUTS,
    GENE_OUTPUTS,
    HIT_STRIDE,
    OUTPUT_INDEX,
    POOLED_CHANNELS,
    POOLED_STRIDE,
    POOLED_VALUES,
    RAY_CHANNELS,
    TRAIT_INDEX,
} from './brain-layout.js';
import { rewardScale } from './reward.js';

/** The arena arrays whose byte offsets head the parameter block, in `Params` order (wasm/src/brain.rs). */
export const PARAM_ARRAYS = Object.freeze([
    'alive',
    'weights',
    'hidden',
    'inputs',
    'pooled',
    'outputs',
    'leakRate',
    'fastOut',
    'rayHue',
    'rayCos',
    'raySin',
    'rewardScale',
    'scratch',
    'geneOutputIndex',
    'terms',
]);

/** Index of the fault slot and place the kernel writes in the parameter block (`status_slot`, `status_where`). */
export const STATUS_SLOT = 38;
export const STATUS_WHERE = 39;

/** `flags` bit: Hebbian learning on. */
const FLAG_LEARN = 1;

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {import('./brain-layout.js').BrainLayout} layout the brain layout
 * @returns {number[]} the sizes and layout offsets that follow the array offsets, in `Params` order
 */
function paramValues(config, layout) {
    const learn = config.hebbianRate > 0;
    const flags = learn ? FLAG_LEARN : 0;
    return [
        config.maxAgents,
        layout.hidden,
        layout.inputCount,
        layout.rawInputCount,
        layout.weightCount,
        config.rayCount,
        layout.wIn,
        layout.wRec,
        layout.bHidden,
        layout.wOut,
        layout.bOut,
        layout.wSkip,
        layout.traitStart + TRAIT_INDEX.LEARN,
        layout.outputCount,
        layout.geneOutputs,
        POOLED_VALUES,
        EXTRA_INPUTS,
        OUTPUT_INDEX.SPLIT,
        RAY_CHANNELS,
        POOLED_CHANNELS.length,
        HIT_STRIDE,
        POOLED_STRIDE,
        flags,
    ];
}

/**
 * Writes the brain kernel's parameter block: the arrays' byte offsets, the sizes and layout offsets, the flags, the
 * gene-output map and `hebbianRate`.
 * @param {import('./wasm-arena.js').Arena} arena the arena
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {import('./brain-layout.js').BrainLayout} layout the brain layout
 * @returns {void}
 */
export function writeBrainParams(arena, config, layout) {
    if (layout.geneOutputs + 1 !== layout.outputCount) {
        throw new Error(
            `writeBrainParams: the kernel expects one gene-less output (SPLIT), the layout has ${layout.geneOutputs} genes for ${layout.outputCount} outputs`,
        );
    }
    const { params, geneOutputIndex, paramDoubles } = arena.views;
    params.set(PARAM_ARRAYS.map((name) => arena.offsets[name]));
    params.set(paramValues(config, layout), PARAM_ARRAYS.length);
    params[STATUS_SLOT] = -1;
    params[STATUS_WHERE] = 0;
    geneOutputIndex.set(GENE_OUTPUTS);
    paramDoubles[0] = config.hebbianRate;
}

/**
 * Runs the brain of every alive agent in the kernel, slots ascending: updates `hidden` and `fastOut` and writes
 * `outputs`, as `forwardAll` does. With learning on the reward factors are taken first, in slot order, because
 * `rewardScale` decays the trace and nothing in the brain phase reads it.
 * @param {Record<string, any>} world a world `attachWasm` moved into an arena
 * @returns {void}
 * @throws {Error} the error `detTanh` throws, when a sum or a learn gene is not finite
 */
export function wasmForwardAll(world) {
    const arena = world.wasm;
    if (arena === undefined) {
        throw new Error('forwardAll: the world has no WASM arena (worlds are attached by allocateWorld)');
    }
    const { config, alive } = world;
    if (config.hebbianRate > 0) {
        const scale = arena.views.rewardScale;
        for (let slot = 0; slot < alive.length; slot++) {
            if (alive[slot] === 1) {
                scale[slot] = rewardScale(world, slot);
            }
        }
    }
    if (arena.exports.brain_forward(arena.offsets.params, arena.offsets.paramDoubles) !== 0) {
        const value = arena.views.paramDoubles[1];
        const error = new Error(`detTanh: expected a finite x, got ${value}`);
        Object.assign(error, { slot: arena.views.params[STATUS_SLOT], where: arena.views.params[STATUS_WHERE] });
        throw error;
    }
}
