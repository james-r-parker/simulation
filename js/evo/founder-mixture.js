// Exact founder-mixture manifests (training-stages.md, Opponents and exported populations): the two hunter styles are
// compared alone and in the intended release mixture with the same total starting population and energy, so abundance of
// one style cannot hide the extinction of the other. The manifest freezes every founder: its slot, family (kin group),
// style, champion, age, energy and place. The slots (places, ages, families) are the same in every arm; only the style that
// fills a family changes, so an arm differs from another in style and nothing else. No role quota or replacement injection
// follows from it: it says who starts the world, not who stays. Pure and deterministic from its seed.

import { configHash } from '../sim/config.js';
import { createRng, fork, nextFloat } from '../sim/rng.js';

/** The arms of a comparison: each style alone, and the intended mixture. */
export const ARMS = Object.freeze(['low', 'high', 'mixed']);
const STYLES = /** @type {readonly ('low' | 'high')[]} */ (Object.freeze(['low', 'high']));

/**
 * @typedef {object} FounderSpec
 * @property {{low: {name: string, genomeId: number} | null, high: {name: string, genomeId: number} | null}} champions
 *   the champion of each style band; a null band cannot found a world
 * @property {{low: number, high: number}} mixture founders of each style in the mixed arm (both at least 1, each a
 *   multiple of `kinGroupSize`)
 * @property {number} kinGroupSize founders per family: siblings of one champion's lineage
 * @property {readonly {ticks: number, share: number}[]} ages the age distribution: a share of the founders at each age,
 *   the shares summing to 1
 * @property {{columns: number, rows: number}} arena the grid the founders are placed on (at least one cell each)
 * @property {number} energyEach the starting energy of every founder
 * @property {number} seed the seed of the shuffles
 */

/**
 * @param {number} count items
 * @param {import('../sim/rng.js').Rng} rng the stream
 * @returns {number[]} `0..count-1` shuffled (Fisher-Yates)
 */
function shuffled(count, rng) {
    const order = Array.from({ length: count }, (_, i) => i);
    for (let i = count - 1; i > 0; i--) {
        const j = Math.floor(nextFloat(rng) * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
}

/**
 * @param {readonly {ticks: number, share: number}[]} ages the distribution
 * @param {number} total founders
 * @returns {number[]} one age per founder: each age's count by the largest remainder, the ages in distribution order
 * @throws {Error} when the shares do not sum to 1
 */
function apportionAges(ages, total) {
    const sum = ages.reduce((s, a) => s + a.share, 0);
    if (Math.abs(sum - 1) > 1e-9) {
        throw new Error(`founderMixture: age shares sum to ${sum}, not 1`);
    }
    const exact = ages.map((a) => a.share * total);
    const counts = exact.map(Math.floor);
    const order = exact
        .map((e, i) => i)
        .sort((a, b) => exact[b] - Math.floor(exact[b]) - (exact[a] - Math.floor(exact[a])) || a - b);
    for (let left = total - counts.reduce((s, c) => s + c, 0), i = 0; left > 0; left--, i++) {
        counts[order[i]] += 1;
    }
    return ages.flatMap((a, i) => Array.from({ length: counts[i] }, () => a.ticks));
}

/**
 * @param {FounderSpec} spec the spec
 * @param {'low' | 'high'} style a band
 * @returns {void}
 * @throws {Error} when the band has no champion or its count is not a whole number of families
 */
function validateBand({ champions, mixture, kinGroupSize }, style) {
    if (champions[style] === null || champions[style] === undefined) {
        throw new Error(`founderMixture: the ${style} band has no champion, so it cannot found a world`);
    }
    const count = mixture[style];
    if (!Number.isInteger(count) || count < 1 || count % kinGroupSize !== 0) {
        throw new Error(`founderMixture: ${style} count ${count} is not a whole number of families of ${kinGroupSize}`);
    }
}

/**
 * @param {FounderSpec} spec the spec
 * @returns {void}
 * @throws {Error} naming the first thing wrong: an empty band, a count that is not a whole number of families, too small an
 *   arena
 */
function validate(spec) {
    const { mixture, kinGroupSize, arena, energyEach } = spec;
    if (!Number.isInteger(kinGroupSize) || kinGroupSize < 1) {
        throw new Error(`founderMixture: kinGroupSize ${kinGroupSize} is not a positive whole number`);
    }
    STYLES.forEach((style) => validateBand(spec, style));
    if (!(energyEach > 0)) {
        throw new Error(`founderMixture: energyEach ${energyEach} is not positive`);
    }
    if (arena.columns * arena.rows < mixture.low + mixture.high) {
        throw new Error('founderMixture: the arena has fewer cells than founders');
    }
}

/**
 * @param {FounderSpec} spec the spec (validated)
 * @returns {{family: number, ageTicks: number, column: number, row: number}[]} the slots, in slot order: the same in every
 *   arm
 */
function slotsOf({ mixture, kinGroupSize, ages, arena, seed }) {
    const total = mixture.low + mixture.high;
    const cells = shuffled(arena.columns * arena.rows, fork(createRng(seed), 'founder-cells')).slice(0, total);
    const ageList = apportionAges(ages, total);
    const ageOrder = shuffled(total, fork(createRng(seed), 'founder-ages'));
    return cells.map((cell, slot) => ({
        family: Math.floor(slot / kinGroupSize),
        ageTicks: ageList[ageOrder[slot]],
        column: cell % arena.columns,
        row: Math.floor(cell / arena.columns),
    }));
}

/**
 * @param {FounderSpec} spec the spec (validated)
 * @param {string} arm `low`, `high` or `mixed`
 * @returns {string[]} the style of each family in this arm: a single style, or the mixture's families in a seeded order
 */
function familyStyles({ mixture, kinGroupSize, seed }, arm) {
    const families = (mixture.low + mixture.high) / kinGroupSize;
    if (arm !== 'mixed') {
        return Array.from({ length: families }, () => arm);
    }
    const styles = [
        ...Array.from({ length: mixture.low / kinGroupSize }, () => 'low'),
        ...Array.from({ length: mixture.high / kinGroupSize }, () => 'high'),
    ];
    return shuffled(families, fork(createRng(seed), 'founder-styles')).map((i) => styles[i]);
}

/**
 * Builds the manifest of a founder comparison: three arms (low alone, high alone, the mixture) over the same slots, so
 * the total population, total energy, age distribution, places and family structure are identical and only the style
 * of each family differs.
 * @param {FounderSpec} spec the founders' spec
 * @returns {Record<string, any>} the manifest: the spec, `total`, `totalEnergy`, each arm's founders and the `hash` of
 *   everything else (a candidate's freeze hash includes it)
 * @throws {Error} on an empty band or an inexact count (`validate`)
 */
export function founderMixture(spec) {
    validate(spec);
    const slots = slotsOf(spec);
    const total = slots.length;
    const arms = Object.fromEntries(
        ARMS.map((arm) => {
            const styles = familyStyles(spec, arm);
            const founders = slots.map((slot, i) => {
                const style = /** @type {'low' | 'high'} */ (styles[slot.family]);
                const champion = /** @type {{name: string, genomeId: number}} */ (spec.champions[style]);
                return {
                    slot: i,
                    ...slot,
                    style,
                    champion: champion.name,
                    genomeId: champion.genomeId,
                    energy: spec.energyEach,
                };
            });
            return [arm, founders];
        }),
    );
    const body = { ...spec, total, totalEnergy: total * spec.energyEach, arms };
    return { ...body, hash: configHash(body) };
}
