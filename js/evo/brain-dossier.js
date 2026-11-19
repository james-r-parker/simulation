// Builds labelled, read-only views of a genome's brain weight row.

import { GENE_OUTPUTS, POOLED_VALUES, TRAIT_INDEX } from '../sim/brain-layout.js';

/**
 * Returns each hidden unit's strongest incoming and all outgoing weights.
 * @param {Float32Array} weights one genome weight row
 * @param {Readonly<Record<string, any>>} layout the `brainLayout` result
 * @param {{inputs: string[], outputs: string[], units: string[]}} labels the input, gene-output and hidden-unit labels
 * @param {{top?: number}} [options] the number of largest-magnitude incoming weights to show (default 8)
 * @returns {Array<Record<string, any>>} one labelled row per hidden unit
 */
export function unitTable(weights, layout, labels, { top = 8 } = {}) {
    return Array.from({ length: layout.hidden }, (_, unit) => ({
        unit: labels.units[unit],
        leak: weights[layout.leakStart + unit],
        bias: weights[layout.bHidden + unit],
        incoming: {
            input: topWeights(incomingInputs(weights, layout, labels.inputs, unit), top),
            recurrent: topWeights(incomingRecurrent(weights, layout, labels.units, unit), top),
        },
        outgoing: GENE_OUTPUTS.map((output, gene) => ({
            label: labels.outputs[gene],
            output,
            value: weights[layout.wOut + unit * layout.geneOutputs + gene],
        })),
    }));
}

/**
 * Returns each gene output's bias and strongest pooled-input skip weights.
 * @param {Float32Array} weights one genome weight row
 * @param {Readonly<Record<string, any>>} layout the `brainLayout` result
 * @param {{inputs: string[], outputs: string[]}} labels the input and gene-output labels
 * @param {{top?: number}} [options] the number of largest-magnitude skip weights to show (default 8)
 * @returns {Array<Record<string, any>>} one labelled row per gene output
 */
export function skipTable(weights, layout, labels, { top = 8 } = {}) {
    return GENE_OUTPUTS.map((output, gene) => ({
        label: labels.outputs[gene],
        output,
        bias: weights[layout.bOut + gene],
        weights: topWeights(skipInputs(weights, layout, labels.inputs, gene), top),
    }));
}

/**
 * Returns the four named trait genes.
 * @param {Float32Array} weights one genome weight row
 * @param {Readonly<Record<string, any>>} layout the `brainLayout` result
 * @returns {Record<string, number>} the raw trait gene values
 */
export function traitRow(weights, layout) {
    return Object.fromEntries(
        Object.entries(TRAIT_INDEX).map(([name, index]) => [name.toLowerCase(), weights[layout.traitStart + index]]),
    );
}

/**
 * Returns labelled input weights into one hidden unit.
 * @param {Float32Array} weights one genome weight row
 * @param {Readonly<Record<string, any>>} layout the `brainLayout` result
 * @param {string[]} labels input names
 * @param {number} unit target hidden unit
 * @returns {Array<{label: string, row: number, value: number}>} incoming weights
 */
function incomingInputs(weights, layout, labels, unit) {
    return labels.map((label, input) => ({
        label,
        row: input,
        value: weights[layout.wIn + input * layout.hidden + unit],
    }));
}

/**
 * Returns labelled recurrent weights into one hidden unit.
 * @param {Float32Array} weights one genome weight row
 * @param {Readonly<Record<string, any>>} layout the `brainLayout` result
 * @param {string[]} labels hidden unit names
 * @param {number} unit target hidden unit
 * @returns {Array<{label: string, row: number, value: number}>} incoming weights
 */
function incomingRecurrent(weights, layout, labels, unit) {
    return labels.map((label, from) => ({
        label,
        row: from,
        value: weights[layout.wRec + from * layout.hidden + unit],
    }));
}

/**
 * Returns the strongest absolute values, preserving source order for ties.
 * @param {Array<{label: string, row: number, value: number}>} values candidate weights
 * @param {number} top maximum number to return
 * @returns {Array<{label: string, row: number, value: number}>} sorted weights
 */
function topWeights(values, top) {
    return values.sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || a.row - b.row).slice(0, top);
}

/**
 * Returns labelled skip weights from pooled inputs to one output.
 * @param {Float32Array} weights one genome weight row
 * @param {Readonly<Record<string, any>>} layout the `brainLayout` result
 * @param {string[]} labels input names
 * @param {number} gene output gene column
 * @returns {Array<{label: string, row: number, value: number}>} skip weights
 */
function skipInputs(weights, layout, labels, gene) {
    return labels.slice(0, POOLED_VALUES).map((label, input) => ({
        label,
        row: input,
        value: weights[layout.wSkip + input * layout.geneOutputs + gene],
    }));
}
