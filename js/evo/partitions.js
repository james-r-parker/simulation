// Seed partitions of a training run (docs/designs/training-stages.md, "Training, validation and sealed release worlds"):
// training, checkpoint validation and release read disjoint seed ranges, every use is recorded, and a release partition
// opens only for a frozen candidate and only once. Checkpoint gates, reviews and curriculum tuning read validation only;
// release seeds never select a checkpoint or an offset. Pure: no files, no clock.

import { configHash } from '../sim/config.js';

/** Seeds in each partition (a drill trial runs on `seed + i`, an episode on its own seed). */
export const PARTITION_SPAN = 1_000_000;
/** The first release partition's number. */
export const FIRST_RELEASE = 1;

/**
 * @typedef {object} Partition
 * @property {string} name `training`, `validation` or `release-<n>`
 * @property {number} start the first seed
 * @property {number} end one past the last seed
 */

/**
 * @param {string} name `training`, `validation` or `release-<n>` (n from 1)
 * @returns {Partition} the partition's seed range: training 0 up, validation next, then one per release
 * @throws {Error} on another name
 */
export function partitionRange(name) {
    const release = /^release-([1-9][0-9]*)$/.exec(name);
    let slot;
    if (name === 'training') {
        slot = 0;
    } else if (name === 'validation') {
        slot = 1;
    } else if (release !== null) {
        slot = 1 + Number(release[1]);
    } else {
        throw new Error(`partition: unknown "${name}"; use training, validation or release-<n>`);
    }
    return { name, start: slot * PARTITION_SPAN, end: (slot + 1) * PARTITION_SPAN };
}

/**
 * @param {string} name the partition
 * @param {number} index a seed's index inside it
 * @returns {number} the seed
 * @throws {Error} when the index is outside the partition
 */
export function partitionSeed(name, index) {
    const { start, end } = partitionRange(name);
    if (!Number.isInteger(index) || index < 0 || start + index >= end) {
        throw new Error(`partition ${name}: seed index ${index} is outside 0 to ${PARTITION_SPAN - 1}`);
    }
    return start + index;
}

/**
 * @typedef {object} PartitionManifest
 * @property {string} partition the partition's name
 * @property {number} start the first seed used
 * @property {number} count seeds used
 * @property {string} scenarioHash a hash of the scenario list the seeds run (headings, spacing, food, density, phase)
 */

/**
 * @param {string} name the partition
 * @param {{count: number, scenarios: unknown}} use how many seeds from its start, and the scenario manifest they run
 * @returns {PartitionManifest} the manifest: the exact seeds and the scenarios' hash, for replay
 * @throws {Error} when `count` does not fit the partition
 */
export function partitionManifest(name, { count, scenarios }) {
    partitionSeed(name, count - 1);
    return { partition: name, start: partitionRange(name).start, count, scenarioHash: configHash({ scenarios }) };
}

/**
 * @param {readonly PartitionManifest[]} manifests the manifests of one run
 * @returns {void}
 * @throws {Error} naming the two partitions whose seeds overlap
 */
export function assertDisjoint(manifests) {
    const sorted = [...manifests].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
        const previous = sorted[i - 1];
        if (sorted[i].start < previous.start + previous.count) {
            throw new Error(`partitions ${previous.partition} and ${sorted[i].partition} share seeds`);
        }
    }
}

/**
 * Freezes a candidate: everything the release exam judges, hashed. A release partition opens for this hash only.
 * @param {{set: string, code: string, rulesHash: string, curriculumHash: string, founders: unknown}} fields the
 *   champion set's hash, the code's git sha, the rules hash, the curriculum hash and the founder mixture
 * @returns {{set: string, code: string, rulesHash: string, curriculumHash: string, founders: unknown, hash: string}} the
 *   fields and their hash
 */
export function freezeCandidate(fields) {
    return { ...fields, hash: configHash(fields) };
}

/** What each purpose may read. */
const PURPOSES = Object.freeze({
    train: 'training',
    resume: 'training',
    gate: 'validation',
    review: 'validation',
    tune: 'validation',
    exam: 'release',
});

/**
 * @typedef {object} Access
 * @property {string} purpose `train`, `resume`, `gate`, `review`, `tune` or `exam`
 * @property {string} partition the partition read
 * @property {string} [freeze] the candidate's `freezeCandidate` hash (an `exam` needs it)
 * @property {number} [generation] the generation completed when a training run read it
 */

/**
 * Appends a partition use to the ledger, or refuses it: a purpose reads only its own kind of partition, an exam reads a
 * release partition only with a frozen candidate, and a release partition is read for one candidate only (a failed exam
 * stays in the record; a revised candidate uses a new, precommitted release partition).
 * @param {readonly Access[]} ledger the uses so far
 * @param {Access} access the use to record
 * @returns {Access[]} the ledger with the use appended; the same use again for the same candidate is recorded too (a replay)
 * @throws {Error} when the use is not allowed
 */
export function recordAccess(ledger, access) {
    const kind = /** @type {Record<string, string>} */ (PURPOSES)[access.purpose];
    if (kind === undefined) {
        throw new Error(`partition use: unknown purpose "${access.purpose}"`);
    }
    partitionRange(access.partition);
    if (access.partition.replace(/-\d+$/, '') !== kind) {
        throw new Error(`partition use: "${access.purpose}" reads ${kind} seeds, not ${access.partition}`);
    }
    if (kind === 'release') {
        if (access.freeze === undefined) {
            throw new Error(`partition use: opening ${access.partition} needs a frozen candidate`);
        }
        const other = ledger.find((u) => u.partition === access.partition && u.freeze !== access.freeze);
        if (other !== undefined) {
            throw new Error(
                `partition use: ${access.partition} was opened for another candidate; use a new release partition`,
            );
        }
    }
    return [...ledger, access];
}
