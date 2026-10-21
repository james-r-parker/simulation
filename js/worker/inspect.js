// The selected agent's inspector data: the label tables the app reads once in `ready`, the buffer layout that adds the
// effects and inspect parts to the snapshot, and the writer for the inspect part. Reads; never changes the world.

import { OUTPUT_INDEX, RAY_CHANNELS } from '../sim/brain-layout.js';
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
]);

const RAY_CHANNEL_NAMES = Object.freeze([
    'proximity',
    'food',
    'can bite me',
    'I can bite it',
    'other',
    'kin',
    'wall',
    'obstacle',
    'smoke',
]);

/** @type {readonly [string, string][]} body input names with their group, in input order */
const BODY_INPUTS = Object.freeze([
    ['energy', 'Body'],
    ['forward speed', 'Body'],
    ['lateral speed', 'Body'],
    ['turn rate', 'Body'],
    ['size', 'Body'],
    ['pregnant', 'Body'],
    ['ready to mate', 'Body'],
    ['danger here', 'Senses'],
    ['attack here', 'Senses'],
    ['season sine', 'Senses'],
    ['season cosine', 'Senses'],
    ['ate recently', 'Senses'],
    ['bitten recently', 'Senses'],
    ['type', 'Senses'],
    ['age', 'Body'],
    ['temperature', 'Temperature'],
    ['distance from optimal', 'Temperature'],
    ['cold stress', 'Temperature'],
    ['heat stress', 'Temperature'],
    ['danger left', 'Scent antennae'],
    ['danger right', 'Scent antennae'],
    ['attack left', 'Scent antennae'],
    ['attack right', 'Scent antennae'],
    ['hunt here', 'Scent antennae'],
    ['hunt left', 'Scent antennae'],
    ['hunt right', 'Scent antennae'],
    ['alarm loudness', 'Heard calls'],
    ['alarm ahead', 'Heard calls'],
    ['alarm side', 'Heard calls'],
    ['hunt loudness', 'Heard calls'],
    ['hunt ahead', 'Heard calls'],
    ['hunt side', 'Heard calls'],
]);

/**
 * The names the inspector labels its bars with.
 * @returns {{rayChannels: string[], bodyInputs: {name: string, group: string}[], outputs: string[]}} the nine ray
 *   channel names, the 32 body inputs with their group, and the eight output names in `OUTPUT_INDEX` order
 */
export function inspectLabels() {
    const outputs = Object.entries(OUTPUT_INDEX)
        .sort((a, b) => a[1] - b[1])
        .map(([name]) => name.toLowerCase());
    return {
        rayChannels: [...RAY_CHANNEL_NAMES],
        bodyInputs: BODY_INPUTS.map(([name, group]) => ({ name, group })),
        outputs,
    };
}

/**
 * The snapshot buffer with the worker's parts after the sim parts. Offsets are in 32-bit words.
 * @param {Readonly<Record<string, any>>} config the validated config
 * @returns {Record<string, number>} `snapshotLayout`'s fields (with `simBytes` for its `bytes`), `bytes` for the
 *   whole buffer, `effectsOffset`, `effectsWords`, `inspectOffset`, `inspectWords`, `inputCount`, `hidden`,
 *   `outputCount` and `counterCount`
 */
export function workerLayout(config) {
    const sim = snapshotLayout(config);
    const inputCount = config.rayCount * RAY_CHANNELS + BODY_INPUTS.length;
    const outputCount = Object.keys(OUTPUT_INDEX).length;
    const effectsOffset = sim.bytes / 4;
    const effectsWords = EFFECT_HEADER_WORDS + EFFECT_CAPACITY * EFFECT_WORDS;
    const inspectOffset = effectsOffset + effectsWords;
    const inspectWords = INSPECT_HEADER_WORDS + inputCount + config.brainHidden + outputCount + INSPECT_COUNTERS.length;
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
    f32[start + 1] = world.energy[slot] / world.config.maxEnergy;
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
}

/**
 * Writes the inspect part for the selected agent: the header, then its inputs, hidden and output rows and the
 * counters. A selection that is not alive writes only the header, with `valid` 0.
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
    return true;
}
