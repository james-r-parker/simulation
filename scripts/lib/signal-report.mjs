// Formats the signal census for `npm run audit:signals`: one row per input and per output, merged over seeds.
import { FOOD_HUE_VALUES, HIT_STRIDE, POOLED_CHANNELS, POOLED_HITS } from '../../js/sim/brain-layout.js';
import { inspectLabels } from '../../js/worker/inspect.js';
import { padTable } from './drill-report.mjs';

const VERDICT_RANK = { dead: 0, unused: 1, alive: 2 };
const HIT_PARTS = ['strength', 'cos', 'sin'];

/**
 * @returns {string[]} the name of every input of the brain's row, in order
 */
export function inputNames() {
    /** @type {string[]} */
    const names = [];
    for (const channel of POOLED_CHANNELS) {
        for (let hit = 1; hit <= POOLED_HITS; hit++) {
            for (const part of HIT_PARTS.slice(0, HIT_STRIDE)) {
                names.push(`${channel} hit${hit} ${part}`);
            }
        }
    }
    for (let h = 0; h < FOOD_HUE_VALUES; h++) {
        names.push(`food hue ${h + 1}`);
    }
    return [...names, ...inspectLabels().bodyInputs.map((b) => b.name)];
}

/**
 * @param {readonly number[]} values numbers
 * @returns {number} their mean (0 for none)
 */
function mean(values) {
    return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * @param {readonly (number | null)[]} values numbers or nulls
 * @returns {number | null} their mean, null when they are null
 */
function meanOrNull(values) {
    return values[0] === null ? null : mean(/** @type {number[]} */ (values));
}

/**
 * @param {number | null} value a rate
 * @returns {string} the rate to three places, or `-`
 */
const rate = (value) => (value === null ? '-' : value.toFixed(3));

/**
 * @typedef {object} MergedInput
 * @property {number} index the input's index
 * @property {number} nonzeroShare mean over seeds
 * @property {number} mean mean over seeds
 * @property {number} sd mean over seeds
 * @property {number} min smallest over seeds
 * @property {number} max largest over seeds
 * @property {boolean} narrow whether it was narrow on every seed
 * @property {number} use mean over seeds
 * @property {string} verdict the best verdict any seed reached (dead only when dead on every seed)
 * @property {number | null} swapRate mean over seeds, null for an input with none
 * @property {number | null} flashRate mean over seeds, null for an input with none
 */

/**
 * @param {readonly import('../../js/evo/signal-census.js').InputRow[][]} perSeed each seed's input rows
 * @returns {MergedInput[]} one row per input
 */
export function mergeInputs(perSeed) {
    return perSeed[0].map((first, i) => {
        const rows = perSeed.map((seed) => seed[i]);
        const verdict = rows.map((r) => r.verdict).reduce((a, b) => (VERDICT_RANK[a] >= VERDICT_RANK[b] ? a : b));
        return {
            index: first.index,
            nonzeroShare: mean(rows.map((r) => r.nonzeroShare)),
            mean: mean(rows.map((r) => r.mean)),
            sd: mean(rows.map((r) => r.sd)),
            min: Math.min(...rows.map((r) => r.min)),
            max: Math.max(...rows.map((r) => r.max)),
            narrow: rows.every((r) => r.narrow),
            use: mean(rows.map((r) => r.use)),
            verdict,
            swapRate: meanOrNull(rows.map((r) => r.swapRate)),
            flashRate: meanOrNull(rows.map((r) => r.flashRate)),
        };
    });
}

/**
 * @param {MergedInput[]} rows the merged input rows
 * @returns {string} the input table
 */
export function formatInputs(rows) {
    const names = inputNames();
    const head = ['#', 'input', 'nonzero', 'mean', 'sd', 'min', 'max', 'use', 'swap', 'flash', 'verdict'];
    const body = rows.map((r) => [
        String(r.index),
        names[r.index] ?? '?',
        r.nonzeroShare.toFixed(3),
        r.mean.toFixed(3),
        r.sd.toFixed(3),
        r.min.toFixed(2),
        r.max.toFixed(2),
        r.use.toFixed(2),
        rate(r.swapRate),
        rate(r.flashRate),
        r.narrow ? `${r.verdict} narrow` : r.verdict,
    ]);
    return padTable([head, ...body]).join('\n');
}

/**
 * @param {readonly import('../../js/evo/signal-census.js').OutputRow[][]} perSeed each seed's output rows
 * @returns {string} the output table, averaged over seeds
 */
export function formatOutputs(perSeed) {
    const head = ['output', 'nonzero', 'mean', 'sd', 'fire share', 'chatter/100'];
    const body = perSeed[0].map((first, o) => {
        const rows = perSeed.map((seed) => seed[o]);
        const fire = first.fireShare === null ? '-' : mean(rows.map((r) => r.fireShare ?? 0)).toFixed(3);
        return [
            first.name,
            mean(rows.map((r) => r.nonzeroShare)).toFixed(3),
            mean(rows.map((r) => r.mean)).toFixed(3),
            mean(rows.map((r) => r.sd)).toFixed(3),
            fire,
            first.chatter === null ? '-' : mean(rows.map((r) => r.chatter ?? 0)).toFixed(2),
        ];
    });
    return padTable([head, ...body]).join('\n');
}
