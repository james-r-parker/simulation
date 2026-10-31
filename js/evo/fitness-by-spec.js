// Each specialisation's mean `fitnessV6` and each term's share of it (natural-selection.md Phase 4 T39): a check that
// no specialisation's fitness is carried by one role term. A tally is fed the terms of every scored life
// (`createFitnessV6(...).terms`); a share is the term's total over the fitness total, so the shares of the paid terms,
// less the waste share, sum to 1.

/** The terms of `FitnessTerms` in table order; `waste` is charged, the rest are paid. */
export const TERM_NAMES = Object.freeze(['intake', 'survival', 'role', 'escape', 'kill', 'born', 'lineage', 'waste']);

/**
 * @returns {{bySpec: Record<string, number>[]}} an empty tally
 */
export function createTermTally() {
    return { bySpec: [] };
}

/**
 * Adds one scored life to its specialisation's totals.
 * @param {ReturnType<typeof createTermTally>} tally the tally
 * @param {number} spec the specialisation index
 * @param {Record<string, number>} terms the life's `FitnessTerms`
 * @returns {void}
 */
export function noteTerms(tally, spec, terms) {
    const row = (tally.bySpec[spec] ??= { lives: 0, fitness: 0, ...Object.fromEntries(TERM_NAMES.map((t) => [t, 0])) });
    row.lives += 1;
    row.fitness += terms.fitness;
    for (const name of TERM_NAMES) {
        row[name] += terms[name];
    }
}

/**
 * Wraps a `fitnessV6` so every call while `on()` holds also adds the life's terms to the tally. The value returned is
 * the fitness's own.
 * @param {ReturnType<typeof import('./fitness-v6.js').createFitnessV6>} fitness the fitness, with `terms`
 * @param {{tally: ReturnType<typeof createTermTally>, on: () => boolean}} target the tally, and whether to count now
 * @returns {(observer: any, slot: number, config: any) => number} the wrapped fitness, with the original's fields
 */
export function tallyingFitness(fitness, { tally, on }) {
    const out = Object.fromEntries(['fitness', ...TERM_NAMES].map((t) => [t, 0]));
    const wrapped = (/** @type {any} */ observer, /** @type {number} */ slot, /** @type {any} */ config) => {
        const value = fitness(observer, slot, config);
        if (on()) {
            fitness.terms(observer, slot, config, /** @type {any} */ (out));
            noteTerms(tally, observer.spec[slot], out);
        }
        return value;
    };
    return Object.assign(wrapped, fitness);
}

/**
 * @param {ReturnType<typeof createTermTally>} tally the tally
 * @param {string[]} names the specialisation names by index
 * @returns {{spec: string, lives: number, mean: number, shares: Record<string, number | null>}[]} one row per
 *   specialisation with a scored life; a share is null when the fitness total is 0
 */
export function termTable(tally, names) {
    const rows = [];
    for (let spec = 0; spec < tally.bySpec.length; spec++) {
        const row = tally.bySpec[spec];
        if (row !== undefined) {
            const shares = Object.fromEntries(
                TERM_NAMES.map((t) => [t, row.fitness === 0 ? null : row[t] / row.fitness]),
            );
            rows.push({ spec: names[spec] ?? String(spec), lives: row.lives, mean: row.fitness / row.lives, shares });
        }
    }
    return rows;
}
