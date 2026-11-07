// The skip cells a predator's reflex sits on (training.md T34): the weights from the strongest hit of a pooled channel
// straight into an output, where `applyHunterReflex` (`js/evo/instinct.js`) wrote the innate bite, approach and turn. A
// trained predator that never bites has usually driven the prey-strength-to-`BITE` cell down; this reads the cells of
// a set of genome rows, so a diagnosis can say it. Pure: no files.

import { GENE_OUTPUTS, HIT_STRIDE, OUTPUT_INDEX, POOLED_CHANNELS, POOLED_STRIDE } from '../sim/brain-layout.js';

/** Parts of a hit: strength is the first value, the sine of its angle (the turn side) the last. */
const STRENGTH = 0;
const SINE = HIT_STRIDE - 1;

/**
 * The cells, in report order: `name`, the channel, the part of the hit and the output it feeds.
 * @type {readonly {name: string, channel: string, part: number, output: number}[]}
 */
export const SKIP_CELLS = Object.freeze([
    { name: 'prey>BITE', channel: 'prey', part: STRENGTH, output: OUTPUT_INDEX.BITE },
    { name: 'prey>THRUST', channel: 'prey', part: STRENGTH, output: OUTPUT_INDEX.THRUST },
    { name: 'prey.sin>TURN', channel: 'prey', part: SINE, output: OUTPUT_INDEX.TURN },
    { name: 'kin>BITE', channel: 'kin', part: STRENGTH, output: OUTPUT_INDEX.BITE },
    { name: 'other>BITE', channel: 'other', part: STRENGTH, output: OUTPUT_INDEX.BITE },
]);

/** The prey-strength-to-`BITE` weight below which a row counts as not biting on sight (the innate prior is +1 or more). */
export const BITE_FLOOR = 1;

/**
 * @typedef {object} SkipCells
 * @property {number} count genome rows read
 * @property {Record<string, {median: number | null, min: number | null}>} cells the median and minimum of each cell of
 *   `SKIP_CELLS`, by name (null for no rows)
 * @property {number | null} preyBiteBelowOne the share of rows whose `prey>BITE` is below `BITE_FLOOR` (null for no rows)
 */

/**
 * @param {Readonly<Record<string, any>>} layout a `brainLayout(config)` result
 * @param {{channel: string, part: number, output: number}} cell a cell
 * @returns {number} its index in a weight row
 */
function indexOf(layout, { channel, part, output }) {
    const input = POOLED_CHANNELS.indexOf(channel) * POOLED_STRIDE + part;
    return layout.wSkip + input * layout.geneOutputs + GENE_OUTPUTS.indexOf(output);
}

/**
 * @param {readonly number[]} sorted values in ascending order
 * @returns {number} their median (the mean of the middle two for an even count)
 */
function medianOf(sorted) {
    const mid = sorted.length >> 1;
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Reads the skip cells of genome rows.
 * @param {readonly Float32Array[]} rows the weight rows (predators)
 * @param {Readonly<Record<string, any>>} layout the `brainLayout(config)` the rows fit
 * @returns {SkipCells} the median and minimum of each cell, and the share of rows whose prey-to-bite is below +1
 */
export function skipCells(rows, layout) {
    /** @type {SkipCells['cells']} */
    const cells = {};
    for (const cell of SKIP_CELLS) {
        const at = indexOf(layout, cell);
        const values = rows.map((row) => row[at]).sort((a, b) => a - b);
        cells[cell.name] =
            values.length === 0 ? { median: null, min: null } : { median: medianOf(values), min: values[0] };
    }
    const bite = indexOf(layout, SKIP_CELLS[0]);
    const below = rows.filter((row) => row[bite] < BITE_FLOOR).length;
    return { count: rows.length, cells, preyBiteBelowOne: rows.length === 0 ? null : below / rows.length };
}

/**
 * @param {number | null} value a number
 * @returns {string} two decimals with a sign, or `-`
 */
function signed(value) {
    return value === null ? '-' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

/**
 * @param {readonly {label: string, skip: SkipCells}[]} sets the labelled sets of rows
 * @returns {string[]} a header, then a line per set: the rows read, each cell as `median / min`, and the share of rows
 *   with prey-to-bite below +1
 */
export function formatSkipCells(sets) {
    const table = [
        ['skip cells (median / min)', 'rows', ...SKIP_CELLS.map((c) => c.name), 'prey>BITE < +1'],
        ...sets.map(({ label, skip }) => [
            label,
            String(skip.count),
            ...SKIP_CELLS.map((c) => `${signed(skip.cells[c.name].median)} / ${signed(skip.cells[c.name].min)}`),
            skip.preyBiteBelowOne === null ? '-' : skip.preyBiteBelowOne.toFixed(2),
        ]),
    ];
    const widths = table[0].map((_, col) => Math.max(...table.map((line) => line[col].length)));
    return table.map((line) =>
        line
            .map((text, col) => text.padEnd(widths[col]))
            .join('  ')
            .trimEnd(),
    );
}
