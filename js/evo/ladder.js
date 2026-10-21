// The skill ladder: the controller rungs the default world is run with, and the summary that says whether chance and
// skill separate (world-balance.md).

/** A rung saturates when its mean final population reaches this share of `maxAgents`. */
export const SATURATION_SHARE = 0.9;

/**
 * @typedef {object} Rung
 * @property {string} ladder the ladder the rung belongs to
 * @property {string} name the rung's name, unique across the ladders
 * @property {string | {canHunt: string, rest: string}} arms one arm for every agent, or an arm for the agents with
 *   `canHunt` and one for the rest (a key of `SCRIPTED_CONTROLLERS`, or `random`)
 */

/** @type {readonly Rung[]} Every rung, lowest first within its ladder. */
export const LADDER_RUNGS = Object.freeze([
    { ladder: 'forage', name: 'random', arms: 'random' },
    { ladder: 'forage', name: 'wanderer', arms: 'wanderer' },
    { ladder: 'forage', name: 'sloppyForager', arms: 'sloppyForager' },
    { ladder: 'forage', name: 'foodSeeker', arms: 'foodSeeker' },
    { ladder: 'forage', name: 'fleer', arms: 'fleer' },
    { ladder: 'combat', name: 'jawSitter-vs-foodSeeker', arms: { canHunt: 'jawSitter', rest: 'foodSeeker' } },
    { ladder: 'combat', name: 'hunter-vs-foodSeeker', arms: { canHunt: 'hunter', rest: 'foodSeeker' } },
    { ladder: 'combat', name: 'hunter-vs-fleer', arms: { canHunt: 'hunter', rest: 'fleer' } },
]);

/**
 * @typedef {object} RungSummary
 * @property {string} ladder the rung's ladder
 * @property {string} rung the rung's name
 * @property {number} meanPopulation the mean final population over the rung's seeds
 * @property {boolean} saturated whether `meanPopulation` reaches `SATURATION_SHARE` x `maxAgents`
 * @property {number | null} ratioToPrevious `meanPopulation` over the previous rung's in the same ladder, `null` for
 *   the first rung or when the previous mean is 0
 */

/**
 * Summarises a ladder run: each rung's mean final population, whether it saturated, and the ratio to the rung below.
 * @param {readonly {rung: string, population: number}[]} results one entry per rung and seed
 * @param {{maxAgents: number}} config the world's config
 * @returns {RungSummary[]} the rungs that have results, in `LADDER_RUNGS` order
 * @throws {Error} when a result names a rung that is not in `LADDER_RUNGS`
 */
export function ladderSummary(results, config) {
    const known = new Set(LADDER_RUNGS.map((rung) => rung.name));
    for (const result of results) {
        if (!known.has(result.rung)) {
            throw new Error(`ladderSummary: unknown rung "${result.rung}"; known: ${[...known].join(', ')}`);
        }
    }
    /** @type {RungSummary[]} */
    const summary = [];
    for (const { ladder, name } of LADDER_RUNGS) {
        const own = results.filter((result) => result.rung === name);
        if (own.length === 0) {
            continue;
        }
        const meanPopulation = own.reduce((sum, result) => sum + result.population, 0) / own.length;
        const previous = summary.at(-1);
        const below = previous?.ladder === ladder ? previous.meanPopulation : 0;
        summary.push({
            ladder,
            rung: name,
            meanPopulation,
            saturated: meanPopulation >= SATURATION_SHARE * config.maxAgents,
            ratioToPrevious: below > 0 ? meanPopulation / below : null,
        });
    }
    return summary;
}
