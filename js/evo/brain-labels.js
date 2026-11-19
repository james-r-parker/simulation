// Labels the pooled brain inputs, gene outputs and hidden units for inspection reports.

import {
    GENE_OUTPUTS,
    OUTPUT_INDEX,
    POOLED_CHANNELS,
    POOLED_HITS,
    brainLayout,
    inputOffsets,
} from '../sim/brain-layout.js';

const HIT_VALUES = Object.freeze(['strength', 'cos', 'sin']);
const GENE_OUTPUT_NAMES = Object.freeze([
    'thrust',
    'turn',
    'sprint',
    'mate',
    'bite',
    'alarm',
    'smoke',
    'hunt',
    'memory_a',
    'memory_b',
]);
const BODY_LABELS = Object.freeze([
    'energy',
    'vel.forward',
    'vel.side',
    'turn_rate',
    'size',
    'pregnant',
    'ready_to_mate',
    'danger.here',
    'attack.here',
    'ate',
    'bitten',
    'spec',
    'age',
    'temp.0',
    'temp.1',
    'temp.2',
    'temp.3',
    'danger.left',
    'danger.right',
    'attack.left',
    'attack.right',
    'hunt_scent.here',
    'hunt_scent.left',
    'hunt_scent.right',
    'heard_alarm.loudness',
    'heard_alarm.ahead',
    'heard_alarm.side',
    'heard_hunt.loudness',
    'heard_hunt.ahead',
    'heard_hunt.side',
    'sex',
    'memory_a',
    'memory_b',
    'refuge.bearing_sin',
    'refuge.bearing_cos',
    'refuge.near',
]);

/**
 * Labels every pooled-row input in the same order as `world.pooled`.
 * @param {Readonly<Record<string, any>>} config the simulation config
 * @returns {string[]} one label per brain input
 */
export function inputLabels(config) {
    const labels = pooledLabels();
    labels.push('food.hue0', 'food.hue1');
    labels.push(...BODY_LABELS);
    const offsets = inputOffsets(config);
    const layout = brainLayout(config);
    if (labels.length !== layout.inputCount || offsets.foodHueStart !== labels.length - BODY_LABELS.length - 2) {
        throw new Error(`inputLabels: expected ${layout.inputCount} labels, got ${labels.length}`);
    }
    return labels;
}

/**
 * Labels the outputs that have weight genes in `GENE_OUTPUTS` order.
 * @returns {string[]} one label per gene output column
 */
export function outputLabels() {
    return GENE_OUTPUTS.map((output) => {
        const label = GENE_OUTPUT_NAMES.find((_, i) => GENE_OUTPUTS[i] === output);
        if (label === undefined || OUTPUT_INDEX[label.toUpperCase()] !== output) {
            throw new Error(`outputLabels: no label for output ${output}`);
        }
        return label;
    });
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
