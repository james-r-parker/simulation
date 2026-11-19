// Records and summarizes one subject's brain and body state through a staged trial.

import { GENE_OUTPUTS, OUTPUT_COUNT, OUTPUT_INDEX } from '../sim/brain-layout.js';

/**
 * Creates fixed-size storage and a per-tick hook for one trial.
 * @param {{maxTicks: number, inputCount: number, hidden: number}} options the trial and brain dimensions
 * @returns {{onTick: (world: Record<string, any>, slots: Record<string, number[]>, tick: number) => void,
 *   finish: (won: boolean) => Record<string, any>}} a recorder hook and its result function
 */
export function createTraceRecorder({ maxTicks, inputCount, hidden }) {
    const pooled = new Float32Array(maxTicks * inputCount);
    const hiddenRows = new Float32Array(maxTicks * hidden);
    const outputs = new Float32Array(maxTicks * OUTPUT_COUNT);
    const x = new Float32Array(maxTicks);
    const y = new Float32Array(maxTicks);
    const heading = new Float32Array(maxTicks);
    const energy = new Float64Array(maxTicks);
    const alive = new Uint8Array(maxTicks);
    const rows = { inputCount, hidden, pooled, hiddenRows, outputs, x, y, heading, energy, alive };
    let ticks = 0;

    function onTick(
        /** @type {Record<string, any>} */ world,
        /** @type {Record<string, number[]>} */ slots,
        /** @type {number} */ tick,
    ) {
        if (ticks >= maxTicks) {
            throw new RangeError(`brain trace tick ${tick} exceeds maxTicks ${maxTicks}`);
        }
        recordSubject(world, slots.subject[0], ticks, rows);
        ticks += 1;
    }

    function finish(/** @type {boolean} */ won) {
        return { pooled, hidden: hiddenRows, outputs, x, y, heading, energy, alive, ticks, won };
    }

    return { onTick, finish };
}

/**
 * Summarizes changing hidden units, fired outputs and active inputs.
 * @param {Record<string, any>} trace a finished recorder result
 * @param {{inputs: string[], outputs: string[], units: string[]}} labels the input, gene-output and unit labels
 * @returns {Record<string, any>} compact per-unit, per-output and active-input summaries
 */
export function traceSummary(trace, labels) {
    const outputRowLabels = Array.from({ length: OUTPUT_COUNT }, (_, output) => outputLabel(output, labels.outputs));
    return {
        ticks: trace.ticks,
        won: trace.won,
        hidden: summarizeHidden(trace, labels.units),
        outputs: summarizeOutputs(trace, outputRowLabels),
        inputs: activeInputs(trace, labels.inputs),
    };
}

/**
 * Copies one subject row after a step, leaving dead-agent rows zero.
 * @param {Record<string, any>} world the current world
 * @param {number} slot the subject slot
 * @param {number} tick the trace index
 * @param {Record<string, any>} rows the arrays and dimensions
 * @returns {void}
 */
function recordSubject(world, slot, tick, rows) {
    if (slot === undefined || world.alive[slot] !== 1) {
        return;
    }
    const { inputCount, hidden, pooled, hiddenRows, outputs, x, y, heading, energy, alive } = rows;
    alive[tick] = 1;
    pooled.set(world.pooled.subarray(slot * inputCount, (slot + 1) * inputCount), tick * inputCount);
    hiddenRows.set(world.hidden.subarray(slot * hidden, (slot + 1) * hidden), tick * hidden);
    outputs.set(world.outputs.subarray(slot * OUTPUT_COUNT, (slot + 1) * OUTPUT_COUNT), tick * OUTPUT_COUNT);
    x[tick] = world.x[slot];
    y[tick] = world.y[slot];
    heading[tick] = world.angle[slot];
    energy[tick] = world.energy[slot];
}

/**
 * Summarizes mean, range and largest tick-to-tick hidden change.
 * @param {Record<string, any>} trace the trace arrays
 * @param {string[]} labels hidden-unit labels
 * @returns {Array<Record<string, any>>} one summary per unit
 */
function summarizeHidden(trace, labels) {
    return labels.map((label, unit) => {
        let total = 0;
        let count = 0;
        let min = Infinity;
        let max = -Infinity;
        let largestChange = -1;
        let largestChangeTick = null;
        let previous = 0;
        for (let tick = 0; tick < trace.ticks; tick++) {
            if (trace.alive[tick] === 0) {
                continue;
            }
            const value = trace.hidden[tick * labels.length + unit];
            total += value;
            count += 1;
            min = Math.min(min, value);
            max = Math.max(max, value);
            if (count > 1 && Math.abs(value - previous) > largestChange) {
                largestChange = Math.abs(value - previous);
                largestChangeTick = tick;
            }
            previous = value;
        }
        return {
            unit: label,
            mean: count === 0 ? 0 : total / count,
            min: count === 0 ? 0 : min,
            max: count === 0 ? 0 : max,
            largestChangeTick,
        };
    });
}

/**
 * Summarizes the share of alive ticks on which each output is positive.
 * @param {Record<string, any>} trace the trace arrays
 * @param {string[]} labels full output-row labels
 * @returns {Array<Record<string, any>>} one summary per output
 */
function summarizeOutputs(trace, labels) {
    return labels.map((label, output) => {
        let aliveTicks = 0;
        let firingTicks = 0;
        for (let tick = 0; tick < trace.ticks; tick++) {
            if (trace.alive[tick] === 1) {
                aliveTicks += 1;
                firingTicks += Number(trace.outputs[tick * OUTPUT_COUNT + output] > 0);
            }
        }
        return { output: label, firingTicks, aliveTicks, firingShare: aliveTicks === 0 ? 0 : firingTicks / aliveTicks };
    });
}

/**
 * Lists inputs that had a nonzero pooled value on an alive tick.
 * @param {Record<string, any>} trace the trace arrays
 * @param {string[]} labels input labels
 * @returns {string[]} active input labels in input order
 */
function activeInputs(trace, labels) {
    return labels.filter((_, input) => {
        for (let tick = 0; tick < trace.ticks; tick++) {
            if (trace.alive[tick] === 1 && trace.pooled[tick * labels.length + input] !== 0) {
                return true;
            }
        }
        return false;
    });
}

/**
 * Maps an output row index to its gene label, with the ungeneed split slot included.
 * @param {number} output output row index
 * @param {string[]} geneLabels labels in `GENE_OUTPUTS` order
 * @returns {string} the output-row label
 */
function outputLabel(output, geneLabels) {
    if (output === OUTPUT_INDEX.SPLIT) {
        return 'split';
    }
    const gene = GENE_OUTPUTS.indexOf(output);
    if (gene < 0 || geneLabels[gene] === undefined) {
        throw new Error(`traceSummary: missing label for output ${output}`);
    }
    return geneLabels[gene];
}
