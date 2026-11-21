// The inspector's body rows (docs/designs/body-genes.md, T9a): each trait's ratio as a labelled counter and the thirteen
// body sense values as one bar group. Pure over the worker's rows and the `ready` labels; the drawing is `inspector.js`.

/** The name of the bar group of the body sense values. */
export const SENSE_GROUP = 'Body sense';

/**
 * @param {number} x a value
 * @returns {number} the value clamped to -1..1
 */
const clamp1 = (x) => Math.max(-1, Math.min(1, x));

/**
 * @param {number} value a trait's row value
 * @param {string} kind the trait's kind
 * @returns {string} `x1.12` for a ratio, `+3.2` or `-3.2` degrees for an offset, `gene 0.42` for a raw gene
 */
export function traitText(value, kind) {
    if (kind === 'offset') {
        return `${value < 0 ? '-' : '+'}${Math.abs(value).toFixed(1)}`;
    }
    return kind === 'raw' ? `gene ${value.toFixed(2)}` : `x${value.toFixed(2)}`;
}

/**
 * @param {ArrayLike<number>} values the trait values, in registry order
 * @param {{name: string, kind: string}[]} traits `ready.labels.traits`
 * @returns {{label: string, text: string}[]} a row for each trait, labelled `trait <name>`
 */
export function geneRows(values, traits) {
    return traits.map((trait, i) => ({ label: `trait ${trait.name}`, text: traitText(values[i], trait.kind) }));
}

/**
 * @param {ArrayLike<number>} values the thirteen sense values
 * @param {string[]} names `ready.labels.bodySense`
 * @returns {{name: string, bars: {label: string, value: number}[]}} the group, each value clamped to -1..1
 */
export function senseGroup(values, names) {
    return { name: SENSE_GROUP, bars: names.map((label, i) => ({ label, value: clamp1(values[i]) })) };
}
