// The per-slot arrays `allocateWorld` allocates for every agent (`agentSpecs`), each with how `worldHash` covers it and
// which WASM kernels take its pointer (docs/designs/registries.md, Per-slot state). `world-hash.js` and the arena's
// field lists read this one list, so a new array decides in its own entry whether it is hashed, and a contract test
// (test/sim/world-state.contract.test.js) fails one that decides nothing.

import { LANES, laneRowName } from './body-lanes.js';
import { EFFECTS } from './effect-list.js';

/** Numbers per slot in `world.heardFrom`: for the alarm and then the hunt half, the caller's slot, its genome id and the tick its call began. */
export const HEARD_FROM_STRIDE = 6;

/** Floats per slot in `world.heard`: alarm loudness, `ux`, `uy`, hunt loudness, `ux`, `uy`. */
export const HEARD_STRIDE = 6;

/** The kernels that take an array's pointer, in the order the arena takes the world's fields over; the first owns it. */
export const KERNEL_ORDER = Object.freeze(['brain', 'sense', 'hash', 'physics']);

/**
 * @typedef {object} AgentArrayInfo
 * @property {number | 'optional' | 'effects' | false} hashed the place among the arrays `hashWorld` hashes first, in order
 *   (1 is first); `'optional'` when it is hashed later, after the merit arrays, by `hashOptionalArrays`; `'effects'` when
 *   it is hashed there only with a social effect on (`socialEffectsOn`); `false` when it is not
 * @property {string} [excuse] why a `hashed: false` array is outside the hash (required then)
 * @property {readonly string[]} [kernels] the kernels whose parameter block holds its pointer (`KERNEL_ORDER` names)
 */

/** @typedef {[any, string, number, AgentArrayInfo]} AgentSpec constructor, name, elements per slot and what it is */

const BRAIN = ['brain'];
const DERIVED = 'derived from `weights` by `applyGenes` (traits.js), which is hashed';
const REWRITTEN = 'rewritten every tick before it is read';
const CALL_HEARD =
    'whether a call the slot made this tick was heard (alarm, then hunt): cleared and rewritten in every signal phase, read in the same one (`settleCalls`)';
const STAMP = 'a stamp compared with `tick + 1` in the tick it is written, so a stale value is never read as current';

/**
 * @param {number} place the array's place among the arrays hashed first
 * @param {string[]} [kernels] the kernels that take its pointer
 * @returns {AgentArrayInfo} the entry of an array `hashWorld` hashes in its first block
 */
function hashedAt(place, kernels = []) {
    return { hashed: place, kernels };
}

/** The arrays whose size does not follow the brain layout, in allocation order, up to `heard`. */
/** @type {AgentSpec[]} */
const FIXED_ROWS = [
    [Uint8Array, 'alive', 1, hashedAt(1, ['brain', 'hash', 'physics'])],
    [Uint8Array, 'spec', 1, hashedAt(2, ['physics'])],
    [Uint8Array, 'sex', 1, { hashed: 'optional' }],
    [Uint8Array, 'ateTimer', 1, hashedAt(16)],
    [Uint8Array, 'bittenTimer', 1, hashedAt(17)],
    [Uint8Array, 'lastLoss', 1, hashedAt(18)],
    [
        Uint8Array,
        'alarmSeen',
        1,
        {
            hashed: false,
            excuse: 'set by the alarm call beside `alarmTimer` (hashed) and read while that timer runs',
        },
    ],
    [Float32Array, 'x', 1, hashedAt(3, ['sense', 'hash', 'physics'])],
    [Float32Array, 'y', 1, hashedAt(4, ['sense', 'hash', 'physics'])],
    [Float32Array, 'vx', 1, hashedAt(5, ['physics'])],
    [Float32Array, 'vy', 1, hashedAt(6, ['physics'])],
    [Float32Array, 'angle', 1, hashedAt(7)],
    [Float32Array, 'turnRate', 1, hashedAt(8)],
    [Float32Array, 'size', 1, hashedAt(9, ['sense', 'hash', 'physics'])],
    [Float32Array, 'temperature', 1, hashedAt(19)],
    [Float32Array, 'dose', 1, hashedAt(20)],
    [Float64Array, 'energy', 1, hashedAt(10)],
    [Float64Array, 'foodEnergy', 1, hashedAt(11)],
    [Float64Array, 'biteEnergy', 1, hashedAt(12)],
    [Float64Array, 'pollenRefusalTick', 1, { hashed: false, excuse: STAMP }],
    [Uint32Array, 'pollenSerial', 1, hashedAt(22)],
    [Int32Array, 'pollenTicks', 1, hashedAt(23)],
    [Uint32Array, 'ageTicks', 1, hashedAt(13)],
    [Uint32Array, 'cooldown', 1, hashedAt(14)],
    [Uint32Array, 'pregnancy', 1, hashedAt(15)],
    [Uint32Array, 'genomeId', 1, hashedAt(24)],
    [Uint32Array, 'lineageId', 1, hashedAt(25)],
    [Uint32Array, 'parentA', 1, hashedAt(26)],
    [Uint32Array, 'parentB', 1, hashedAt(27)],
    [Uint32Array, 'lastBiter', 1, hashedAt(28)],
    [Uint32Array, 'lastHerdId', 1, hashedAt(29)],
    [Uint32Array, 'fatherId', 1, hashedAt(32)],
    [Uint32Array, 'fatherLineage', 1, hashedAt(33)],
    [Uint32Array, 'lastBiteTick', 1, hashedAt(34)],
    [Uint32Array, 'prevBiter', 1, hashedAt(35)],
    [Uint32Array, 'prevBiteTick', 1, hashedAt(36)],
    [Uint32Array, 'recoilStamp', 1, { hashed: false, excuse: STAMP }],
    [Uint32Array, 'jawsStamp', 1, { hashed: false, excuse: STAMP }],
    [Uint16Array, 'pollenPatch', 1, hashedAt(21)],
    [Uint16Array, 'alarmTimer', 1, hashedAt(37)],
    [Uint16Array, 'huntTimer', 1, hashedAt(38)],
    [Uint16Array, 'smokeTimer', 1, hashedAt(39)],
    [Float32Array, 'heard', HEARD_STRIDE, hashedAt(40)],
    [Uint32Array, 'heardFrom', HEARD_FROM_STRIDE, { hashed: 'effects' }],
    [Uint8Array, 'callHeard', 2, { hashed: false, excuse: CALL_HEARD }],
];

/**
 * The stored rows of the effects that keep stacks (docs/designs/status-effects.md, "The registry"): for each, its stack count
 * and its timer, `Float64Array` rows. No kernel takes them. They are hashed by `hashWorld` only once a social effect has a
 * strength above 0 (`socialEffectsOn`, effect-numbers.js), so a world whose numbers are all 0 hashes as it did before them.
 * @param {readonly {name: string, level: string}[]} [list] the effects (a parameter for tests)
 * @returns {AgentSpec[]} the rows, named `effect.<name>.stacks` and `effect.<name>.ticks`
 */
export function effectSpecs(list = EFFECTS) {
    const names = list
        .filter((effect) => effect.level === 'stacks')
        .flatMap((effect) => [`effect.${effect.name}.stacks`, `effect.${effect.name}.ticks`]);
    return names.map((name) => [Float64Array, name, 1, { hashed: 'effects' }]);
}

/**
 * @param {Pick<import('./brain-layout.js').BrainLayout, 'rawInputCount' | 'inputCount' | 'outputCount' | 'hidden' | 'geneOutputs' | 'weightCount'>} layout
 *   the brain layout, for the strides
 * @returns {AgentSpec[]} the arrays after `heard`, whose size follows the layout
 */
function layoutRows(layout) {
    return [
        [Float32Array, 'inputs', layout.rawInputCount, { hashed: false, excuse: REWRITTEN, kernels: BRAIN }],
        [Float32Array, 'pooled', layout.inputCount, { hashed: false, excuse: REWRITTEN, kernels: BRAIN }],
        [
            Float32Array,
            'outputs',
            layout.outputCount,
            { hashed: false, excuse: REWRITTEN, kernels: ['brain', 'physics'] },
        ],
        [Float32Array, 'leakRate', layout.hidden, { hashed: false, excuse: DERIVED, kernels: BRAIN }],
        [Float32Array, 'fastOut', layout.hidden * layout.geneOutputs, { hashed: 'optional', kernels: BRAIN }],
        [Float32Array, 'weights', layout.weightCount, { ...hashedAt(30), kernels: BRAIN }],
        [Float32Array, 'fatherWeights', layout.weightCount, hashedAt(31)],
    ];
}

/**
 * @param {Pick<import('./brain-layout.js').BrainLayout, 'rawInputCount' | 'inputCount' | 'outputCount' | 'hidden' | 'geneOutputs' | 'weightCount'>} layout
 *   the brain layout, for the strides
 * @returns {AgentSpec[]} the per-agent arrays other than `hidden`, with how each is hashed and which kernels take it
 */
export function agentSpecs(layout) {
    return [...FIXED_ROWS, ...effectSpecs(), ...layoutRows(layout)];
}

const NO_LAYOUT = { rawInputCount: 0, inputCount: 0, outputCount: 0, hidden: 0, geneOutputs: 0, weightCount: 0 };

/** The entries with no stride to size, for the lists below. */
const ENTRIES = agentSpecs(NO_LAYOUT).map(([, name, , info]) => ({ name, ...info }));

/**
 * @param {string} name an array of `agentSpecs`
 * @returns {AgentArrayInfo | undefined} its entry, undefined for a name that is not one
 */
export function agentArrayInfo(name) {
    return ENTRIES.find((entry) => entry.name === name);
}

/**
 * @param {readonly {name: string, hashed?: number | string | false}[]} entries array entries
 * @returns {string[]} the names of the entries that have a place, by place
 * @throws {Error} unless the places run 1 to N with none missing or repeated
 */
export function hashedNames(entries) {
    const placed = entries
        .filter((entry) => typeof entry.hashed === 'number')
        .sort((a, b) => Number(a.hashed) - Number(b.hashed));
    placed.forEach((entry, index) => {
        if (entry.hashed !== index + 1) {
            throw new Error(`agent-arrays: places must run 1 to ${placed.length}, ${entry.name} is at ${entry.hashed}`);
        }
    });
    return placed.map((entry) => entry.name);
}

/** The names `hashWorld` hashes first, in its order: the arrays that have a place, by place. */
export const HASHED_AGENT_ARRAYS = Object.freeze(hashedNames(ENTRIES));

/** The names `hashOptionalArrays` hashes, after the merit arrays. */
export const OPTIONAL_AGENT_ARRAYS = Object.freeze(
    ENTRIES.filter((entry) => entry.hashed === 'optional').map((e) => e.name),
);

/** The names `hashEffectRows` hashes, after the optional arrays and only with a social effect on: the stored stacks and `heardFrom`. */
export const EFFECT_AGENT_ARRAYS = Object.freeze(
    ENTRIES.filter((entry) => entry.hashed === 'effects').map((e) => e.name),
);

/**
 * @param {string} name an array name
 * @returns {string | undefined} the kernel that takes the array into the arena (the first of `KERNEL_ORDER` that holds
 *   its pointer), undefined for an array no kernel takes
 */
export function ownerOf(name) {
    const kernels = agentArrayInfo(name)?.kernels ?? [];
    return KERNEL_ORDER.find((kernel) => kernels.includes(kernel));
}

/**
 * @param {string} kernel a `KERNEL_ORDER` name
 * @param {readonly string[]} table the kernel's parameter table, in its struct order
 * @returns {string[]} the names in `table` that are agent arrays the kernel takes into the arena, in table order
 */
export function ownedFields(kernel, table) {
    return table.filter((name) => ownerOf(name) === kernel);
}

const HEADER_SAYS = 'its module says it is derived state outside `worldHash`';

/**
 * The per-slot rows of the other groups in `allocAgentArrays` (kills, the hunter ledger, the proof rule, the split gate,
 * mate rank, the carcass) that `worldHash` does not cover, with why. The merit, disease and reward rows, `birthRing`,
 * `hidden`, the sprint store and the rest timer are hashed by their own lists in `world-hash.js`.
 * @type {Readonly<Record<string, string>>}
 */
export const UNHASHED_ROWS = Object.freeze({
    ...Object.fromEntries(
        [
            'deliberateKills',
            'lastBiteDeliberate',
            'birthSource',
            'ledgerKills',
            'ledgerCarcass',
            'ledgerStanding',
            'ledgerMove',
            'ledgerSprint',
            'ledgerKillEnergy',
            'ledgerBiteGain',
            'ledgerBiteCost',
            'proven',
            'established',
            'unprovenKids',
            'mealsTotal',
            'mealsDeliberate',
            'splitsDone',
            'mateSeenAt',
            'mateRank',
            'maturedKids',
            'carcassHeld',
        ].map((name) => [name, HEADER_SAYS]),
    ),
    ...Object.fromEntries(
        LANES.map((lane) => [
            laneRowName(lane.name),
            'derived from `weights` and the spec by `applyGenes` (traits.js)',
        ]),
    ),
});
