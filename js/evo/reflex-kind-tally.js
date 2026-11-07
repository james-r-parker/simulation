// Per-kind results of a reflex case (training.md T18): for each staging kind (`prey`, `too-big`, `kin`, ...) the share of
// its stagings that passed every scored tick and the share of scored ticks with `BITE` above 0. A case's pass share mixes
// the kinds; this keeps them apart, so a brain that never bites (right on two kinds, wrong on one) shows as such.

import { SEQUENCE_TICKS, SETTLE_TICKS } from './reflex-stage.js';

/** Ticks of a staging that are scored. */
const SCORED_TICKS = SEQUENCE_TICKS - SETTLE_TICKS;

/**
 * @typedef {object} KindScore one staging kind's results for one genome
 * @property {number} stagings stagings of the kind the genome played
 * @property {number} passShare the share of them that passed every scored tick
 * @property {number} biteShare the share of their scored ticks with `BITE` above 0
 */

/**
 * @typedef {object} KindTally
 * @property {string[]} kinds the kinds, in order of first appearance in the table
 * @property {number[]} kindOf the kind index of each sequence
 * @property {number[]} stagings stagings per kind
 * @property {Uint32Array} passed `slots x kinds`: stagings passed
 * @property {Uint32Array} bites `slots x kinds`: scored ticks with `BITE` above 0
 */

/**
 * @param {readonly {staging: {kind: string}}[]} sequences a case table's sequences
 * @param {number} slots slots in the batch
 * @returns {KindTally} an empty tally
 */
export function createKindTally(sequences, slots) {
    /** @type {string[]} */
    const kinds = [];
    const kindOf = sequences.map(({ staging }) => {
        if (!kinds.includes(staging.kind)) {
            kinds.push(staging.kind);
        }
        return kinds.indexOf(staging.kind);
    });
    const stagings = kinds.map((_, k) => kindOf.filter((x) => x === k).length);
    return {
        kinds,
        kindOf,
        stagings,
        passed: new Uint32Array(slots * kinds.length),
        bites: new Uint32Array(slots * kinds.length),
    };
}

/**
 * Notes one scored tick's bite of a slot.
 * @param {KindTally} tally the tally
 * @param {{slot: number, sequence: number, bite: number}} at the slot, the sequence and its `BITE` output
 * @returns {void}
 */
export function noteBite(tally, { slot, sequence, bite }) {
    if (bite > 0) {
        tally.bites[slot * tally.kinds.length + tally.kindOf[sequence]]++;
    }
}

/**
 * Notes a finished sequence's pass of a slot.
 * @param {KindTally} tally the tally
 * @param {{slot: number, sequence: number, ok: number}} at the slot, the sequence and 1 when it passed
 * @returns {void}
 */
export function notePass(tally, { slot, sequence, ok }) {
    tally.passed[slot * tally.kinds.length + tally.kindOf[sequence]] += ok;
}

/**
 * @param {KindTally} tally the tally after every sequence
 * @param {number} slot a slot
 * @returns {Record<string, KindScore>} the slot's score per kind
 */
export function kindScores(tally, slot) {
    const count = tally.kinds.length;
    return Object.fromEntries(
        tally.kinds.map((kind, k) => {
            const stagings = tally.stagings[k];
            return [
                kind,
                {
                    stagings,
                    passShare: tally.passed[slot * count + k] / stagings,
                    biteShare: tally.bites[slot * count + k] / (stagings * SCORED_TICKS),
                },
            ];
        }),
    );
}
