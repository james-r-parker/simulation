// The opponent pool as `map-elites-v1`'s seeder sees it (docs/designs/training-stages.md, Opponent pool): frozen archives
// a share of the founders and floor entrants is cloned from, so a lineage meets the past of the other roles. Trainer
// state: a pool never reaches a champion file or the live world.

import { restoreArchive } from '../../evo/archive-snapshot.js';
import { nextClone } from '../../evo/archive.js';
import { fork, nextFloat, nextInt } from '../../sim/rng.js';

/**
 * @typedef {object} Opponents
 * @property {Record<string, any>[]} archives the pool's frozen archives
 * @property {number} share the share of founders drawn from them, 0 to 1
 */

/**
 * @param {Opponents | undefined} opponents the pool, if any
 * @returns {void}
 * @throws {Error} naming the option when the share is not from 0 to 1
 */
export function checkOpponents(opponents) {
    if (opponents !== undefined && !(opponents.share >= 0 && opponents.share <= 1)) {
        throw new Error(`createSeeder: opponents share ${opponents.share} must be from 0 to 1`);
    }
}

/**
 * @param {{snapshots: import('../../evo/archive-snapshot.js').ArchiveSnapshot[], share: number} | undefined} option the
 *   `opponents` option of the policy: snapshots and a share
 * @param {Readonly<Record<string, any>>} config the world's config (the rows must fit its brain layout)
 * @param {import('../../evo/descriptors.js').Descriptor} descriptor the archive's descriptor
 * @returns {Opponents | undefined} the pool with its snapshots restored as archives; undefined when no option is given
 */
export function restoreOpponents(option, config, descriptor) {
    if (option === undefined) {
        return undefined;
    }
    return {
        share: option.share,
        archives: option.snapshots.map((snapshot) => restoreArchive(snapshot, config, { descriptor })),
    };
}

/**
 * Draws founders from a pool. With no pool, an empty one or a share of 0 nothing is drawn, so the seeder's own streams
 * and the genomes it writes are the ones a run without the option has.
 * @param {Opponents | undefined} opponents the pool
 * @returns {{founders: Set<number>, draw: (world: Record<string, any>, slot: number, rng: import('../../sim/rng.js').Rng) => ReturnType<typeof nextClone>}}
 *   the genome ids of the founders drawn so far, and the draw: the pool elite a founder of the slot's specialisation is
 *   cloned from (a uniform snapshot, its next clone), or null (not drawn, or the snapshot holds none of the specialisation)
 */
export function createPoolDraw(opponents) {
    /** @type {import('../../sim/rng.js').Rng | null} */
    let rng = null;
    return {
        founders: new Set(),
        draw(world, slot, brainInit) {
            if (opponents === undefined || opponents.share <= 0 || opponents.archives.length === 0) {
                return null;
            }
            rng ??= fork(brainInit, 'opponent-pool');
            if (nextFloat(rng) >= opponents.share) {
                return null;
            }
            const archive = opponents.archives[nextInt(rng, opponents.archives.length)];
            return nextClone(/** @type {any} */ (archive), world.spec[slot]);
        },
    };
}
