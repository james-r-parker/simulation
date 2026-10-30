// Mate rank (natural-selection.md T8; principles rule 5, incompetence kills before fertility ranks): a female chooses
// among the males in range by their rank inside their own specialisation, not by who is rich.
//
// A candidate's rank is its percentile among the living members of its specialisation (a mating pair always shares one,
// `canMatePair`), from a score:
//
// - `rank`: for a `canHunt` specialisation its `deliberateKills` (an ambush counts as deliberate); for the others the
//   smoothed deliberate meal share `(mealsDeliberate + 1) / (mealsTotal + 2)` of `split-gate.js`, 0 under
//   `RANK_MIN_MEALS` meals;
// - `offspring`: the children that reached maturity (the merit child credit of `merit.js`).
//
// The percentile is (members scoring lower + half the other ties) / (members - 1), and 0.5 for a lone member. Age is not
// corrected: the counters are lifetime, so older males rank higher. `refreshMateRanks` recomputes every rank each
// `MATE_RANK_INTERVAL` ticks into the preallocated `mateRank` array by counting pairs inside each specialisation (about
// 250,000 comparisons a pass at 500 agents, no sort, no allocation); a slot born since the last pass ranks 0. The eval
// observer reads the same percentile (`fillScores`, `percentileInto`) for `eval.mate_skill_gap`.
//
// `mateRank`, `maturedKids` are per-slot arrays zeroed by `freeAgent`, outside `worldHash`.

/** Ticks between two passes of `refreshMateRanks`. */
export const MATE_RANK_INTERVAL = 100;

/** A non-hunter with fewer meals than this scores 0 under `rank`. */
export const RANK_MIN_MEALS = 5;

/**
 * @returns {[Float32ArrayConstructor | Uint32ArrayConstructor, string, number][]} the allocation specs for
 *   `allocateWorld`, one element per slot: `mateRank` and `maturedKids`
 */
export function mateRankSpecs() {
    return [
        [Float32Array, 'mateRank', 1],
        [Uint32Array, 'maturedKids', 1],
    ];
}

/**
 * Writes the score of every alive slot (the `rank` or `offspring` score in the header). The scoring is inline so that no
 * double crosses a call: a boxed return would allocate once per slot.
 * @param {Record<string, any>} world the world
 * @param {Float64Array} scores per-slot scores to fill
 * @param {string} mode `rank` or `offspring`
 * @returns {void}
 */
export function fillScores(world, scores, mode) {
    const offspring = mode === 'offspring';
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 0) {
            continue;
        }
        const meals = world.mealsTotal[slot];
        const grazer = meals < RANK_MIN_MEALS ? 0 : (world.mealsDeliberate[slot] + 1) / (meals + 2);
        const rank = world.huntBySpec[world.spec[slot]] === 1 ? world.deliberateKills[slot] : grazer;
        scores[slot] = offspring ? world.maturedKids[slot] : rank;
    }
}

/**
 * Writes the percentile of one slot among the alive members of its specialisation: members scoring lower plus half
 * of the other ties, over members - 1, and 0.5 for a lone member. It writes into `out` rather than returning the
 * double, which would be boxed (an allocation) on every call of the pass.
 * @param {Record<string, any>} world the world
 * @param {Float64Array | Float32Array} scores the scores `fillScores` wrote this tick
 * @param {{slot: number, out: Float64Array | Float32Array}} target the alive slot, and the array that receives its percentile at `slot`
 * @returns {void}
 */
export function percentileInto(world, scores, { slot, out }) {
    const own = scores[slot];
    const { alive, spec } = world;
    let members = 0;
    let lower = 0;
    let ties = 0;
    for (let other = 0; other < alive.length; other++) {
        if (alive[other] === 1 && spec[other] === spec[slot]) {
            members += 1;
            lower += scores[other] < own ? 1 : 0;
            ties += scores[other] === own && other !== slot ? 1 : 0;
        }
    }
    out[slot] = members <= 1 ? 0.5 : (lower + ties / 2) / (members - 1);
}

/**
 * @param {Record<string, any>} world the world
 * @returns {boolean} whether this tick is a pass tick
 */
export function mateRankDue(world) {
    return world.tick % MATE_RANK_INTERVAL === 0;
}

/**
 * Recomputes the rank of every alive slot.
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function refreshMateRanks(world) {
    const scores = world.mateScores;
    fillScores(world, scores, world.config.mateRank);
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            percentileInto(world, scores, { slot, out: world.mateRank });
        }
    }
}
