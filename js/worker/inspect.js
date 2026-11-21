// The selected agent's inspector data: the label tables the app reads once in `ready`, the buffer layout that adds the
// effects and inspect parts to the snapshot, and the writer for the inspect part. Reads; never changes the world.

import { TRAITS, traitRatio } from '../sim/body-traits.js';
import {
    BODY_SENSE_VALUES,
    BRAIN_IO,
    inputOffsets,
    OUTPUT_INDEX,
    RAY_CHANNELS,
    TRAIT_SLOTS,
} from '../sim/brain-layout.js';
import { EFFECTS } from '../sim/effect-list.js';
import { levelOf } from '../sim/effects.js';
import { snapshotLayout } from '../sim/snapshot.js';
import { EFFECT_CAPACITY, EFFECT_HEADER_WORDS, EFFECT_WORDS } from './effects.js';

/** Words of the inspect header: `genomeId`, `slot` and `valid`. */
export const INSPECT_HEADER_WORDS = 3;

/** The counters at the end of the inspect part, in order. */
export const INSPECT_COUNTERS = Object.freeze([
    'ageTicks',
    'energy',
    'temperature',
    'generation',
    'foodEnergyEaten',
    'biteEnergyTaken',
    'kills',
    'children',
    'fitnessSoFar',
    'lastLoss',
    'bittenTimer',
    'ateTimer',
    'dose',
    'infection',
    'immuneStrains',
]);

/** The labels of the thirteen body sense values, in pooled order (the food hues that follow them are not shown). */
const BODY_SENSE_LABELS = BRAIN_IO.sense.flatMap((group) => group.labels).slice(0, BODY_SENSE_VALUES);

/**
 * The names the inspector labels its bars with.
 * @returns {{rayChannels: string[], bodyInputs: {name: string, group: string}[], outputs: string[],
 *   traits: {name: string, kind: string, describe: string}[], bodySense: string[], effects: {name: string, visible: boolean}[]}}
 *   the ten ray channel names, the 37 body inputs with their group, the eleven output names in `OUTPUT_INDEX` order,
 *   each trait of the registry, the thirteen body sense names and each effect of the registry
 */
export function inspectLabels() {
    return {
        rayChannels: BRAIN_IO.channels.map((channel) => channel.display),
        bodyInputs: BRAIN_IO.body.map((input) => ({ name: input.display, group: input.group })),
        outputs: BRAIN_IO.outputs.map((output) => output.name),
        traits: TRAITS.map((trait) => ({ name: trait.name, kind: trait.kind, describe: trait.describe })),
        bodySense: [...BODY_SENSE_LABELS],
        effects: EFFECTS.map((effect) => ({ name: effect.name, visible: effect.visible })),
    };
}

/**
 * The snapshot buffer with the worker's parts after the sim parts. Offsets are in 32-bit words.
 * @param {Readonly<Record<string, any>>} config the validated config
 * @returns {Record<string, number>} `snapshotLayout`'s fields (with `simBytes` for its `bytes`), `bytes` for the
 *   whole buffer, `effectsOffset`, `effectsWords`, `inspectOffset`, `inspectWords`, `inputCount`, `hidden`,
 *   `outputCount`, `counterCount`, `traitCount` and `senseCount`
 */
export function workerLayout(config) {
    const sim = snapshotLayout(config);
    const inputCount = config.rayCount * RAY_CHANNELS + BRAIN_IO.body.length;
    const outputCount = Object.keys(OUTPUT_INDEX).length;
    const effectsOffset = sim.bytes / 4;
    const effectsWords = EFFECT_HEADER_WORDS + EFFECT_CAPACITY * EFFECT_WORDS;
    const inspectOffset = effectsOffset + effectsWords;
    const inspectWords =
        INSPECT_HEADER_WORDS +
        inputCount +
        config.brainHidden +
        outputCount +
        INSPECT_COUNTERS.length +
        TRAITS.length +
        BODY_SENSE_VALUES +
        EFFECTS.length;
    return {
        ...sim,
        simBytes: sim.bytes,
        bytes: (inspectOffset + inspectWords) * 4,
        effectsOffset,
        effectsWords,
        inspectOffset,
        inspectWords,
        inputCount,
        hidden: config.brainHidden,
        outputCount,
        counterCount: INSPECT_COUNTERS.length,
        traitCount: TRAITS.length,
        senseCount: BODY_SENSE_VALUES,
        effectCount: EFFECTS.length,
    };
}

/**
 * @param {Float32Array} f32 the float view
 * @param {number} start the first word to write
 * @param {ArrayLike<number>} source the array holding the row
 * @param {{from: number, count: number}} row where the row starts in `source` and its length
 * @returns {number} the next free word
 */
function copyRow(f32, start, source, { from, count }) {
    for (let i = 0; i < count; i++) {
        f32[start + i] = source[from + i];
    }
    return start + count;
}

/**
 * Writes the counters, in `INSPECT_COUNTERS` order.
 * @param {Float32Array} f32 the float view
 * @param {number} start the first word to write
 * @param {{source: Record<string, any>, slot: number}} agent `source` is `{ world, observer, policy, generations }`
 * @returns {void}
 */
function writeCounters(f32, start, { source, slot }) {
    const { world, observer, policy, generations } = source;
    f32[start] = world.ageTicks[slot];
    f32[start + 1] = world.energy[slot] / world.lanes.maxEnergy[slot];
    f32[start + 2] = world.temperature[slot];
    f32[start + 3] = generations.depth[slot];
    f32[start + 4] = observer.foodEnergy[slot];
    f32[start + 5] = observer.biteEnergy[slot];
    f32[start + 6] = observer.kills[slot];
    f32[start + 7] = observer.children[slot];
    f32[start + 8] = policy.fitness === undefined ? 0 : policy.fitness(observer, slot, world.config);
    f32[start + 9] = world.lastLoss[slot];
    f32[start + 10] = world.bittenTimer[slot];
    f32[start + 11] = world.ateTimer[slot];
    f32[start + 12] = world.dose[slot];
    f32[start + 13] = world.infection[slot];
    f32[start + 14] = bitCount(world.immuneMask[slot]);
}

/**
 * Writes each trait's ratio in `TRAITS` order (its shift for an `offset` trait, the gene itself for a `raw` one), then the
 * agent's thirteen body sense values as the brain read them this tick (0 in a world with no pooled brain row).
 * @param {Float32Array} f32 the float view
 * @param {number} start the first word to write
 * @param {{world: Record<string, any>, slot: number}} agent the world and the agent's slot
 * @returns {void}
 */
function writeBody(f32, start, { world, slot }) {
    const genes = slot * world.layout.weightCount + world.layout.traitStart;
    TRAITS.forEach((trait, t) => {
        const gene = world.weights[genes + trait.index];
        const span = world.traitSpans[world.spec[slot] * TRAIT_SLOTS + trait.index];
        f32[start + t] = trait.kind === 'raw' ? gene : traitRatio(trait, gene, span);
    });
    const from = slot * world.layout.inputCount + inputOffsets(world.config).senseStart;
    for (let i = 0; i < BODY_SENSE_VALUES; i++) {
        f32[start + TRAITS.length + i] = world.pooled === undefined ? 0 : world.pooled[from + i];
    }
}

/**
 * Writes each effect's level for the slot in `EFFECTS` order (0 for off, 1 for on, a share or a stack count above that).
 * @param {Float32Array} f32 the float view
 * @param {number} start the first word to write
 * @param {{world: Record<string, any>, slot: number}} agent the world and the agent's slot
 * @returns {void}
 */
function writeEffects(f32, start, { world, slot }) {
    for (let e = 0; e < EFFECTS.length; e++) {
        f32[start + e] = levelOf(world, slot, e);
    }
}

/**
 * @param {number} mask an 8-bit mask
 * @returns {number} the bits set
 */
function bitCount(mask) {
    let count = 0;
    for (let bits = mask; bits > 0; bits >>= 1) {
        count += bits & 1;
    }
    return count;
}

/**
 * Writes the inspect part for the selected agent: the header, then its inputs, hidden and output rows, the counters,
 * the trait ratios and the body sense values. A selection that is not alive writes only the header, with `valid` 0.
 * @param {{u32: Uint32Array, f32: Float32Array}} views the snapshot buffer's views
 * @param {Record<string, number>} layout from `workerLayout`
 * @param {Record<string, any>} source `{ world, observer, policy, generations }`
 * @param {{genomeId: number, slot: number} | null} selected the selection, or null for none
 * @returns {boolean} whether the selected agent was alive and its rows were written
 */
export function writeInspect({ u32, f32 }, layout, source, selected) {
    const at = layout.inspectOffset;
    const { world } = source;
    const valid =
        selected !== null && world.alive[selected.slot] === 1 && world.genomeId[selected.slot] === selected.genomeId;
    u32[at] = selected === null ? 0 : selected.genomeId;
    u32[at + 1] = selected === null ? 0 : selected.slot;
    u32[at + 2] = valid ? 1 : 0;
    if (!valid || selected === null) {
        return false;
    }
    const { slot } = selected;
    let w = at + INSPECT_HEADER_WORDS;
    w = copyRow(f32, w, world.inputs, { from: slot * layout.inputCount, count: layout.inputCount });
    w = copyRow(f32, w, world.hidden, { from: slot * layout.hidden, count: layout.hidden });
    w = copyRow(f32, w, world.outputs, { from: slot * layout.outputCount, count: layout.outputCount });
    writeCounters(f32, w, { source, slot });
    writeBody(f32, w + INSPECT_COUNTERS.length, { world, slot });
    writeEffects(f32, w + INSPECT_COUNTERS.length + TRAITS.length + BODY_SENSE_VALUES, { world, slot });
    return true;
}
