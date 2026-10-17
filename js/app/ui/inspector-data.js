// The inspector's data: the selected agent's inspect part turned into grouped labelled input bars, a radar of ray
// spokes, the hidden layer as a grid, labelled output bars and counters. Pure over the snapshot and the `ready`
// tables; the DOM and canvas drawing are in `inspector.js`.

import { AGENT_FIELD, AGENT_STRIDE, HEADER_WORDS } from '../interpolate.js';
import { familyName } from '../renderer/colors.js';

/** Values per ray in the inputs row: proximity, then the eight class channels. */
export const RAY_CHANNELS = 9;
/** The hidden grid's width in cells. */
export const HEATMAP_COLUMNS = 8;
/** The class channels a spoke is coloured by, after the proximity channel. */
export const CLASS_CHANNELS = Object.freeze([
    'food',
    'bigger',
    'smaller',
    'similar',
    'kin',
    'wall',
    'obstacle',
    'smoke',
]);

/** Output names as shown, where the worker's name is short. */
const OUTPUT_TITLES = Object.freeze({ hunt: 'hunt call' });

const COUNTER_AT = Object.freeze({
    ageTicks: 0,
    energy: 1,
    temperature: 2,
    generation: 3,
    foodEnergyEaten: 4,
    biteEnergyTaken: 5,
    kills: 6,
    children: 7,
    fitnessSoFar: 8,
});

/**
 * @typedef {object} InspectorView
 * @property {boolean} valid whether the selected agent was alive when the snapshot was written
 * @property {{spec: string, specIndex: number, lineageId: number, familyName: string, genomeId: number}} header who it is
 * @property {{lengths: Float32Array, channels: Int8Array}} radar each spoke's length (0 to 1) and strongest class
 *   channel (an index into `CLASS_CHANNELS`, -1 when the ray saw nothing)
 * @property {{name: string, bars: {label: string, value: number}[]}[]} groups the body inputs by group, each value
 *   clamped to -1..1
 * @property {Float32Array} hidden the hidden activations
 * @property {{label: string, value: number, firing: boolean}[]} outputs the outputs, values clamped to -1..1
 * @property {{label: string, text: string}[]} counters the counters as text
 */

/** The view of nothing selected. @type {InspectorView} */
export const NO_INSPECTION = Object.freeze({
    valid: false,
    header: { spec: '', specIndex: -1, lineageId: 0, familyName: '', genomeId: 0 },
    radar: { lengths: new Float32Array(0), channels: new Int8Array(0) },
    groups: [],
    hidden: new Float32Array(0),
    outputs: [],
    counters: [],
});

/**
 * @param {number} x a value
 * @returns {number} the value clamped to -1..1
 */
const clamp1 = (x) => Math.max(-1, Math.min(1, x));

/**
 * @param {number} n a number
 * @returns {string} the number with thousands separators
 */
function grouped(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * @param {number} temperature the agent's temperature
 * @param {Record<string, number>} info `ready.info`
 * @returns {string} the band it is in: `cold stress`, `cool`, `optimal`, `warm` or `heat stress`
 */
export function temperatureBand(temperature, info) {
    if (temperature < info.temperatureColdStress) {
        return 'cold stress';
    }
    if (temperature < info.temperatureOptimalMin) {
        return 'cool';
    }
    if (temperature <= info.temperatureOptimalMax) {
        return 'optimal';
    }
    return temperature < info.temperatureHeatStress ? 'warm' : 'heat stress';
}

/**
 * @param {{u32: Uint32Array}} snapshot the snapshot
 * @param {number} genomeId the agent to find
 * @returns {{specIndex: number, lineageId: number}} its specialisation and lineage, -1 and 0 when it is not in the
 *   snapshot
 */
function findInSnapshot({ u32 }, genomeId) {
    for (let i = 0; i < u32[1]; i++) {
        const at = HEADER_WORDS + i * AGENT_STRIDE;
        if (u32[at + AGENT_FIELD.GENOME] === genomeId) {
            return { specIndex: u32[at + AGENT_FIELD.SPEC], lineageId: u32[at + AGENT_FIELD.LINEAGE] };
        }
    }
    return { specIndex: -1, lineageId: 0 };
}

/**
 * @param {Float32Array} row the inputs row
 * @param {number} rayCount rays
 * @returns {{lengths: Float32Array, channels: Int8Array}} the radar spokes
 */
function radarOf(row, rayCount) {
    const lengths = new Float32Array(rayCount);
    const channels = new Int8Array(rayCount).fill(-1);
    for (let k = 0; k < rayCount; k++) {
        const at = k * RAY_CHANNELS;
        lengths[k] = Math.min(Math.max(row[at], 0), 1);
        let best = 0;
        for (let c = 0; c < CLASS_CHANNELS.length; c++) {
            if (row[at + 1 + c] > best) {
                best = row[at + 1 + c];
                channels[k] = c;
            }
        }
    }
    return { lengths, channels };
}

/**
 * @param {Float32Array} row the inputs row
 * @param {{rayCount: number, labels: {name: string, group: string}[]}} body the ray count and the body input labels
 * @returns {InspectorView['groups']} the body inputs by group, in the order the groups first appear
 */
function groupsOf(row, { rayCount, labels }) {
    /** @type {Map<string, {label: string, value: number}[]>} */
    const groups = new Map();
    labels.forEach((label, i) => {
        const bars = groups.get(label.group) ?? [];
        bars.push({ label: label.name, value: clamp1(row[rayCount * RAY_CHANNELS + i]) });
        groups.set(label.group, bars);
    });
    return [...groups].map(([name, bars]) => ({ name, bars }));
}

/**
 * @param {Float32Array} c the counters
 * @param {{specName: string, lineageId: number, info: Record<string, number>}} who the agent's type and lineage and
 *   the world's constants
 * @returns {InspectorView['counters']} the counters as labelled text
 */
function countersOf(c, { specName, lineageId, info }) {
    const seasons = c[COUNTER_AT.ageTicks] / info.seasonLength;
    return [
        { label: 'type', text: specName },
        { label: 'family', text: familyName(lineageId) },
        { label: 'generation', text: grouped(c[COUNTER_AT.generation]) },
        { label: 'age', text: `${grouped(c[COUNTER_AT.ageTicks])} ticks (${seasons.toFixed(1)} seasons)` },
        { label: 'energy', text: `${Math.round(c[COUNTER_AT.energy] * 100)}%` },
        {
            label: 'temperature',
            text: `${c[COUNTER_AT.temperature].toFixed(1)} (${temperatureBand(c[COUNTER_AT.temperature], info)})`,
        },
        { label: 'food eaten', text: c[COUNTER_AT.foodEnergyEaten].toFixed(1) },
        { label: 'bite energy taken', text: c[COUNTER_AT.biteEnergyTaken].toFixed(1) },
        { label: 'kills', text: grouped(c[COUNTER_AT.kills]) },
        { label: 'children', text: grouped(c[COUNTER_AT.children]) },
        { label: 'fitness so far', text: c[COUNTER_AT.fitnessSoFar].toFixed(2) },
    ];
}

/**
 * @param {{snapshot: {u32: Uint32Array, f32: Float32Array}, ready: Record<string, any>}} source the newest snapshot and
 *   the `ready` message (layout, info and labels)
 * @returns {InspectorView} the inspector's content; `valid` is false when nothing is selected, the agent has died or
 *   the snapshot has no inspect part
 */
export function inspectorView({ snapshot, ready }) {
    const { layout, info, labels } = ready;
    const at = layout.inspectOffset;
    if (snapshot.u32.length <= at + 2 || snapshot.u32[at + 2] !== 1) {
        return NO_INSPECTION;
    }
    const genomeId = snapshot.u32[at];
    const inputsAt = at + 3;
    const hiddenAt = inputsAt + layout.inputCount;
    const outputsAt = hiddenAt + layout.hidden;
    const countersAt = outputsAt + layout.outputCount;
    const inputs = snapshot.f32.subarray(inputsAt, hiddenAt);
    const found = findInSnapshot(snapshot, genomeId);
    const spec = found.specIndex < 0 ? '' : String(info.specs[found.specIndex]?.name ?? '');
    const counters = snapshot.f32.subarray(countersAt, countersAt + layout.counterCount);
    return {
        valid: true,
        header: {
            spec,
            specIndex: found.specIndex,
            lineageId: found.lineageId,
            familyName: familyName(found.lineageId),
            genomeId,
        },
        radar: radarOf(inputs, info.rayCount),
        groups: groupsOf(inputs, { rayCount: info.rayCount, labels: labels.bodyInputs }),
        hidden: Float32Array.from(snapshot.f32.subarray(hiddenAt, outputsAt)),
        outputs: labels.outputs.map((/** @type {string} */ label, /** @type {number} */ i) => {
            const value = snapshot.f32[outputsAt + i];
            return {
                label: /** @type {Record<string, string>} */ (OUTPUT_TITLES)[label] ?? label,
                value: clamp1(value),
                firing: label === 'smoke' ? value > info.smokeThreshold : value > 0,
            };
        }),
        counters: countersOf(counters, { specName: spec, lineageId: found.lineageId, info }),
    };
}
