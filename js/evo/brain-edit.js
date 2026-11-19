// Applies bounded, in-memory weight edits and enforces hidden-unit silence during plastic trials.

import { POOLED_VALUES, TRAIT_GENES } from '../sim/brain-layout.js';

const TWO_DIMENSIONAL = Object.freeze(['wIn', 'wRec', 'wOut', 'wSkip']);

/**
 * Applies weight edits to a copy of the genome row.
 * @param {Float32Array} weights the original genome row
 * @param {Readonly<Record<string, any>>} layout the `brainLayout` result
 * @param {Array<Record<string, any>>} edits edit operations
 * @returns {Float32Array} the edited copy
 * @throws {RangeError} when an edit names an unknown block or invalid index
 */
export function applyEdits(weights, layout, edits) {
    const result = weights.slice();
    for (const edit of edits) {
        if (edit.op === 'silence') {
            silenceUnit(result, layout, edit);
        } else if (edit.op === 'set' || edit.op === 'scale') {
            changeBlock(result, layout, edit);
        } else {
            throw new RangeError(`brain edit ${JSON.stringify(edit)}: expected op silence, set or scale`);
        }
    }
    return result;
}

/**
 * Creates an on-tick hook that clears plastic output rows for selected hidden units.
 * @param {number[]} units hidden unit indices
 * @returns {(world: Record<string, any>, slots: Record<string, number[]>) => void} a hook for `playTrial`
 */
export function silenceHook(units) {
    const selected = units.slice();
    return (world, slots) => {
        const slot = slots.subject[0];
        if (slot === undefined) {
            return;
        }
        for (const unit of selected) {
            const start = slot * world.layout.hidden * world.layout.geneOutputs + unit * world.layout.geneOutputs;
            world.fastOut.fill(0, start, start + world.layout.geneOutputs);
        }
    };
}

/**
 * Zeroes one hidden unit's outgoing recurrent and gene-output weights.
 * @param {Float32Array} weights the editable row
 * @param {Readonly<Record<string, any>>} layout the brain layout
 * @param {Record<string, any>} edit the silence operation
 * @returns {void}
 */
function silenceUnit(weights, layout, edit) {
    const unit = edit.unit;
    checkIndex(unit, layout.hidden, edit, 'unit');
    const recurrent = layout.wRec + unit * layout.hidden;
    weights.fill(0, recurrent, recurrent + layout.hidden);
    const outgoing = layout.wOut + unit * layout.geneOutputs;
    weights.fill(0, outgoing, outgoing + layout.geneOutputs);
}

/**
 * Applies one set or scale operation to its storage range.
 * @param {Float32Array} weights the editable row
 * @param {Readonly<Record<string, any>>} layout the brain layout
 * @param {Record<string, any>} edit the edit operation
 * @returns {void}
 */
function changeBlock(weights, layout, edit) {
    const block = blockSpec(layout, edit.block, edit);
    const { start, length } = editRange(block, edit);
    if (edit.op === 'set') {
        weights[start] = edit.value;
        return;
    }
    if (edit.col === undefined) {
        for (let i = 0; i < length; i++) {
            weights[start + i] *= edit.factor;
        }
        return;
    }
    weights[start] *= edit.factor;
}

/**
 * Describes a block's offset and row/column bounds.
 * @param {Readonly<Record<string, any>>} layout the brain layout
 * @param {string} name the block name
 * @param {Record<string, any>} edit the edit for error messages
 * @returns {{offset: number, rows: number, cols: number, twoDimensional: boolean}} block geometry
 */
function blockSpec(layout, name, edit) {
    const spec = {
        wIn: { offset: layout.wIn, rows: layout.inputCount, cols: layout.hidden },
        wRec: { offset: layout.wRec, rows: layout.hidden, cols: layout.hidden },
        wOut: { offset: layout.wOut, rows: layout.hidden, cols: layout.geneOutputs },
        wSkip: { offset: layout.wSkip, rows: POOLED_VALUES, cols: layout.geneOutputs },
        bHidden: { offset: layout.bHidden, cols: layout.hidden },
        bOut: { offset: layout.bOut, cols: layout.geneOutputs },
        leak: { offset: layout.leakStart, cols: layout.hidden },
        trait: { offset: layout.traitStart, cols: TRAIT_GENES },
    }[name];
    if (spec === undefined) {
        throw new RangeError(`brain edit ${JSON.stringify(edit)}: unknown block ${name}`);
    }
    return { ...spec, rows: spec.rows ?? 1, twoDimensional: TWO_DIMENSIONAL.includes(name) };
}

/**
 * Resolves and validates the requested block range.
 * @param {{offset: number, rows: number, cols: number, twoDimensional: boolean}} block block geometry
 * @param {Record<string, any>} edit the edit operation
 * @returns {{start: number, length: number}} the start index and number of values to change
 */
function editRange(block, edit) {
    if (!block.twoDimensional) {
        if (edit.row !== undefined) {
            throw new RangeError(`brain edit ${JSON.stringify(edit)}: block ${edit.block} has no row`);
        }
        checkIndex(edit.col, block.cols, edit, 'col');
        return { start: block.offset + edit.col, length: 1 };
    }
    checkIndex(edit.row, block.rows, edit, 'row');
    if (edit.op === 'scale' && edit.col === undefined) {
        return { start: block.offset + edit.row * block.cols, length: block.cols };
    }
    checkIndex(edit.col, block.cols, edit, 'col');
    return { start: block.offset + edit.row * block.cols + edit.col, length: 1 };
}

/**
 * Rejects a missing or out-of-range block index.
 * @param {number} index the requested index
 * @param {number} size the block dimension
 * @param {Record<string, any>} edit the edit operation
 * @param {string} field the index field
 * @returns {void}
 */
function checkIndex(index, size, edit, field) {
    if (!Number.isInteger(index) || index < 0 || index >= size) {
        throw new RangeError(`brain edit ${JSON.stringify(edit)}: ${field} must be an integer from 0 to ${size - 1}`);
    }
}
