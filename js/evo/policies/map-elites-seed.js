// How `map-elites-v1` seeds new lineages (initial agents, floor spawns, immigrants): the least-populated
// specialisation (a random elite's when `specMutationRate` is above 0), then a genome from the archive, a clone of one, or a random one.

import { occupiedCount, nextClone, selectParent } from '../../evo/archive.js';
import { GENOME_SPECS, rejectGenome } from '../../evo/genome.js';
import { randomGenome } from '../../evo/instinct.js';
import { SIGMA_START, mutateSigma, mutateWeights } from '../../evo/mutation.js';
import { nextFloat, nextInt } from '../../sim/rng.js';
import { countSpecs } from '../../sim/spec-rescue.js';
import { rowOf } from './natural-birth.js';

/** Random seeding until the archive has this many occupied cells (all specialisations). */
export const MIN_ARCHIVE_CELLS = 10;
/** Below this draw, a mutated child of `selectParent` (the default of the `archiveShare` option). */
export const ARCHIVE_SHARE = 0.5;
/**
 * Below this draw (and from `archiveShare` up), an unmutated clone from `nextClone`; the rest are random (the default of
 * the `cloneShareEnd` option).
 */
export const CLONE_SHARE_END = 0.8;

/**
 * @param {Record<string, any>} world the world; `slot` is already allocated, so it is not counted
 * @param {number} slot the slot being seeded
 * @param {Int32Array} counts scratch, one entry per specialisation
 * @returns {number} the specialisation with the fewest alive agents, ties to the lowest index
 */
export function leastPopulatedSpec(world, slot, counts) {
    countSpecs(world, slot, counts);
    let best = 0;
    for (let spec = 1; spec < counts.length; spec++) {
        best = counts[spec] < counts[best] ? spec : best;
    }
    return best;
}

/**
 * The specialisation of a random archive elite (every occupied cell equally likely), or a random one while the archive
 * is thin. Used instead of `leastPopulatedSpec` once `specMutationRate` is above 0, so a lost role is not refilled.
 * @param {Record<string, any>} archive the archive
 * @param {any} rng the `spawn` stream
 * @returns {number} the specialisation index
 */
export function randomEliteSpec(archive, rng) {
    const cells = occupiedCount(/** @type {any} */ (archive));
    if (cells < MIN_ARCHIVE_CELLS) {
        return nextInt(rng, GENOME_SPECS.length);
    }
    let left = nextInt(rng, cells);
    for (let spec = 0; spec < GENOME_SPECS.length - 1; spec++) {
        const here = occupiedCount(/** @type {any} */ (archive), spec);
        if (left < here) {
            return spec;
        }
        left -= here;
    }
    return GENOME_SPECS.length - 1;
}

/**
 * Draws the source of an immigrant's genome from `rng` (`brain-init`); no draw while the archive is thin.
 * @param {Record<string, any>} archive the archive
 * @param {number} spec the specialisation
 * @param {any} rng the `brain-init` stream
 * @param {{cellDraws: number, archiveShare: number, cloneShareEnd: number}} mix the parent cell tournament size
 *   (`selectParent`) and the two cut points of the draw
 * @returns {{source: 'archive' | 'clone' | 'random', ref: ReturnType<typeof selectParent>}} the source; `ref` is null for
 *   random, or when the specialisation has no genome to give
 */
function draw(archive, spec, rng, { cellDraws, archiveShare, cloneShareEnd }) {
    if (occupiedCount(/** @type {any} */ (archive)) < MIN_ARCHIVE_CELLS) {
        return { source: 'random', ref: null };
    }
    const u = nextFloat(rng);
    if (u < archiveShare) {
        const ref = selectParent(/** @type {any} */ (archive), spec, rng, cellDraws);
        return { source: ref === null ? 'random' : 'archive', ref };
    }
    if (u < cloneShareEnd) {
        const ref = nextClone(/** @type {any} */ (archive), spec);
        return { source: ref === null ? 'random' : 'clone', ref };
    }
    return { source: 'random', ref: null };
}

/**
 * Refuses an archive row that does not fit the world's layout: logs `GenomeRejected`, then throws.
 * @param {Float32Array} row the archive genome's weights
 * @param {{weightCount: number}} layout the world's brain layout
 * @param {import('../../sim/log.js').SimLog | undefined} log the policy's log
 * @returns {void}
 */
function checkRow(row, layout, log) {
    if (row.length !== layout.weightCount) {
        rejectGenome(log, { field: 'weights.length', expected: layout.weightCount, actual: row.length });
    }
}

/**
 * The specialisation for a new lineage, in order: a random elite's
 * (`specMutationRate` above 0), the least populated.
 * @param {{world: Record<string, any>, slot: number, rng: any, archive: Record<string, any>, counts: Int32Array}} what
 *   the world, the slot being seeded, the `spawn` stream, the archive and scratch counts
 * @returns {number} the specialisation index
 */
function chooseSpec({ world, slot, rng, archive, counts }) {
    if (world.config.specMutationRate > 0) {
        return randomEliteSpec(archive, rng);
    }
    return leastPopulatedSpec(world, slot, counts);
}

/**
 * @param {number} archiveShare the draw below which an immigrant is a mutated archive child
 * @param {number} cloneShareEnd the draw below which (from `archiveShare` up) it is a clone
 * @returns {void}
 * @throws {Error} naming the option when the shares are not `0 <= archiveShare <= cloneShareEnd <= 1`
 */
function checkShares(archiveShare, cloneShareEnd) {
    if (!(archiveShare >= 0 && archiveShare <= cloneShareEnd)) {
        throw new Error(
            `createSeeder: archiveShare ${archiveShare} must be from 0 to cloneShareEnd (${cloneShareEnd})`,
        );
    }
    if (!(cloneShareEnd <= 1)) {
        throw new Error(`createSeeder: cloneShareEnd ${cloneShareEnd} must be at most 1`);
    }
}

/**
 * Records where a seeded slot's genome came from: a clone marks what it cloned, anything else clears the marks.
 * @param {Record<string, any>} clones the per-slot clone state (`fromArchive` is optional)
 * @param {number} slot the slot
 * @param {{archiveRef: number, id: number} | null} cloned the archive genome the slot is an unmutated clone of
 * @param {boolean} fromArchive whether the genome came from the archive at all (an archive child or a clone)
 * @returns {void}
 */
function markSeeded(clones, slot, cloned, fromArchive) {
    clones.isClone[slot] = cloned === null ? 0 : 1;
    clones.archiveRef[slot] = cloned === null ? -1 : cloned.archiveRef;
    clones.refId[slot] = cloned === null ? 0 : cloned.id;
    if (clones.fromArchive !== undefined) {
        clones.fromArchive[slot] = fromArchive ? 1 : 0;
    }
}

/**
 * @param {Record<string, any>} options `{ archive, birth, clones, log, cellDraws, archiveShare, cloneShareEnd }`: the
 *   shared per-slot state in `birth.sigma` and `clones.isClone`, `clones.archiveRef`, `clones.refId`; the draw below
 *   `archiveShare` is a mutated archive child, from there to `cloneShareEnd` a clone, above it a random genome
 *   (defaults `ARCHIVE_SHARE` and `CLONE_SHARE_END`)
 * @returns {{initSpec: Function, initBrain: Function}} the two seeding hooks
 * @throws {Error} naming the option when the shares are not `0 <= archiveShare <= cloneShareEnd <= 1`
 */
export function createSeeder({
    archive,
    birth,
    clones,
    log,
    cellDraws = 1,
    archiveShare = ARCHIVE_SHARE,
    cloneShareEnd = CLONE_SHARE_END,
}) {
    checkShares(archiveShare, cloneShareEnd);
    const mix = { cellDraws, archiveShare, cloneShareEnd };
    const counts = new Int32Array(GENOME_SPECS.length);
    /** @type {(Float32Array | undefined)[]} */
    const own = [];

    function initSpec(/** @type {any} */ world, /** @type {number} */ slot, /** @type {any} */ rng) {
        return chooseSpec({ world, slot, rng, archive, counts });
    }

    /** Writes the slot's row and sigma; a clone also records what it cloned. */
    function initBrain(/** @type {any} */ world, /** @type {number} */ slot, /** @type {any} */ rng) {
        const { layout } = world;
        const row = rowOf(own, world.weights, { slot, count: layout.weightCount });
        const { source, ref } = draw(archive, world.spec[slot], rng, mix);
        markSeeded(clones, slot, source === 'clone' ? ref : null, ref !== null);
        if (ref === null) {
            randomGenome(world, slot, { row, rng });
            birth.sigma[slot] = SIGMA_START;
        } else if (source === 'archive') {
            checkRow(ref.row, layout, log);
            row.set(ref.row);
            birth.sigma[slot] = mutateSigma(ref.sigma, layout.weightCount, rng);
            mutateWeights(row, birth.sigma[slot], rng, birth.mutation);
        } else {
            checkRow(ref.row, layout, log);
            row.set(ref.row);
            birth.sigma[slot] = ref.sigma;
        }
        log?.log('debug', 'ImmigrantSeeded', {
            spec: world.spec[slot],
            source,
            archiveRef: ref === null ? -1 : ref.archiveRef,
        });
    }

    return { initSpec, initBrain };
}
