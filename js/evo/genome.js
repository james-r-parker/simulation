// The genome: shape check against a brain layout, and the JSON form with base64 float32 weights.

import { decodeWeights, encodeWeights } from './base64.js';

/** The genome format version. */
export const GENOME_VERSION = 1;
/** The specialisation names a genome may carry. */
export const GENOME_SPECS = Object.freeze(['forager', 'predator', 'reproducer', 'scout', 'defender']);

/**
 * @typedef {object} Genome
 * @property {number} version `GENOME_VERSION`
 * @property {number} id the agent's `genomeId`
 * @property {number} lineageId the agent's `lineageId`
 * @property {[number, number]} parents `[parentA, parentB]`, `[0, 0]` for a random genome
 * @property {string} specialisation one of `GENOME_SPECS`
 * @property {{ inputCount: number, brainHidden: number, outputCount: number }} layout
 * @property {number} sigma the genome's own mutation step size
 * @property {Float32Array} weights one brain row (`weightCount` floats)
 */

/**
 * @param {string} field the mismatched field
 * @param {unknown} actual the genome's value
 * @param {unknown} expected the layout's value
 * @returns {never}
 */
function mismatch(field, actual, expected) {
    return rejectGenome(undefined, { field: `genome.${field}`, expected, actual });
}

/**
 * Logs `GenomeRejected` (error) when a log is given, then throws; the one way a genome is refused.
 * @param {import('../sim/log.js').SimLog | undefined} log the policy's log
 * @param {{ field: string, expected: unknown, actual: unknown, message?: string }} what the mismatched field; `message`
 *   replaces the default error text
 * @returns {never}
 * @throws {Error} always
 */
export function rejectGenome(log, { field, expected, actual, message }) {
    log?.log('error', 'GenomeRejected', { field, expected, actual });
    throw new Error(message ?? `${field}: expected ${expected}, got ${actual}`);
}

/**
 * Throws unless the genome has the shape the layout needs.
 * @param {Genome} genome the genome
 * @param {Readonly<Record<string, any>>} layout a `brainLayout(config)` result
 * @returns {void}
 * @throws {Error} naming the field, the genome's value and the layout's
 */
export function assertGenomeFits(genome, layout) {
    if (genome.version !== GENOME_VERSION) {
        mismatch('version', genome.version, GENOME_VERSION);
    }
    if (!GENOME_SPECS.includes(genome.specialisation)) {
        mismatch('specialisation', genome.specialisation, `one of ${GENOME_SPECS.join(', ')}`);
    }
    if (genome.layout.inputCount !== layout.inputCount) {
        mismatch('layout.inputCount', genome.layout.inputCount, layout.inputCount);
    }
    if (genome.layout.brainHidden !== layout.hidden) {
        mismatch('layout.brainHidden', genome.layout.brainHidden, layout.hidden);
    }
    if (genome.layout.outputCount !== layout.outputCount) {
        mismatch('layout.outputCount', genome.layout.outputCount, layout.outputCount);
    }
    if (genome.weights.length !== layout.weightCount) {
        mismatch('weights.length', genome.weights.length, layout.weightCount);
    }
}

/**
 * @param {Genome} genome the genome
 * @returns {Record<string, any>} a JSON-able object; `weights` is base64 of little-endian float32 bytes
 */
export function encodeGenome(genome) {
    return {
        version: genome.version,
        id: genome.id,
        lineageId: genome.lineageId,
        parents: [genome.parents[0], genome.parents[1]],
        specialisation: genome.specialisation,
        layout: { ...genome.layout },
        sigma: genome.sigma,
        weights: encodeWeights(genome.weights),
    };
}

/**
 * @param {Record<string, any>} obj the object `encodeGenome` returns, after a JSON round trip
 * @returns {Genome} the genome, with `Float32Array` weights (bit-exact)
 * @throws {Error} when the weights are not base64 of the layout's float count
 */
export function decodeGenome(obj) {
    const { inputCount, brainHidden, outputCount } = obj.layout;
    const count =
        inputCount * brainHidden + brainHidden * brainHidden + brainHidden + brainHidden * outputCount + outputCount;
    return {
        version: obj.version,
        id: obj.id,
        lineageId: obj.lineageId,
        parents: [obj.parents[0], obj.parents[1]],
        specialisation: obj.specialisation,
        layout: { inputCount, brainHidden, outputCount },
        sigma: obj.sigma,
        weights: decodeWeights(obj.weights, count),
    };
}
