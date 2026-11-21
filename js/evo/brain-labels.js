// Labels the pooled brain inputs, gene outputs and hidden units for inspection reports.

import { BRAIN_IO, GENE_OUTPUTS, POOLED_CHANNELS, POOLED_HITS } from '../sim/brain-layout.js';

const HIT_VALUES = Object.freeze(['strength', 'cos', 'sin']);
/**
 * Labels every pooled-row input in the same order as `world.pooled`, from `BRAIN_IO`.
 * @returns {string[]} one label per brain input
 */
export function inputLabels() {
    return [
        ...pooledLabels(),
        ...BRAIN_IO.sense.flatMap((group) => group.labels),
        ...BRAIN_IO.body.map((input) => input.label),
    ];
}

/**
 * Labels the outputs that have weight genes in `GENE_OUTPUTS` order.
 * @returns {string[]} one label per gene output column
 */
export function outputLabels() {
    return GENE_OUTPUTS.map((output) => BRAIN_IO.outputs[output].name);
}

/**
 * Labels one hidden unit.
 * @param {number} unit the hidden unit index
 * @returns {string} its display label
 */
export function unitLabel(unit) {
    return `h${unit}`;
}

/**
 * Builds labels for the pooled ray and food-hue inputs.
 * @returns {string[]} pooled input labels
 */
function pooledLabels() {
    const labels = [];
    for (const channel of POOLED_CHANNELS) {
        for (let hit = 0; hit < POOLED_HITS; hit++) {
            for (const value of HIT_VALUES) {
                labels.push(`${channel}.hit${hit}.${value}`);
            }
        }
    }
    return labels;
}
