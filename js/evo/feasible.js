// The learnability check's logic (docs/designs/training-loop.md, Learnability check): the win share each gate condition
// implies for its drill, whether enough of the learn probe's populations reach it, and the fair band of a bite drill's
// chase. A detector: nothing here reaches fitness, merit, mate rank or archive rank, and no gate bar moves.

import { createConfig } from '../sim/config.js';
import { arenaConfig } from './chase-arena.js';
import { runEnvelope } from './chase-envelope.js';
import { drillSubject, randomBrains } from './drill.js';
import { DRILLS } from './drill-scenarios.js';
import { referenceSubject } from './memory-probe-references.js';

/** Populations that must reach the bar for a drill to count as learnable. */
export const POPULATIONS_NEEDED = 2;
/** Trials the reference's and the random brains' win shares are measured on. */
export const BASELINE_TRIALS = 64;
/** The drills whose lesson is a bite: the chase's fair band is read beside them. */
export const BITE_DRILLS = Object.freeze(['prey-adrift', 'prey-weak', 'prey-mid', 'prey-ahead', 'prey-crossing']);

const KEY = /^drill\.([a-z][a-z0-9-]*)\.(winShareLow|winShareOverReference|edgeLow)$/;

/**
 * @typedef {object} Need one condition's demand on a drill
 * @property {'winShareLow' | 'winShareOverReference' | 'edgeLow'} kind the reading
 * @property {number} bound the condition's `min`
 */

/**
 * @param {readonly import('./stage-gate.js').Condition[]} gate a stage's gate
 * @returns {{needs: Map<string, Need[]>, unchecked: string[]}} the demands by drill, and the readings the check cannot
 *   test (retention, cross-play, `jawShareLow`, a `max` bound, ...), each once
 * @throws {Error} naming a drill that does not exist
 */
export function parseGate(gate) {
    /** @type {Map<string, Need[]>} */
    const needs = new Map();
    /** @type {string[]} */
    const unchecked = [];
    for (const condition of gate) {
        const match = KEY.exec(condition.read);
        if (match === null || condition.min === undefined) {
            unchecked.push(condition.read);
            continue;
        }
        if (!DRILLS.some((d) => d.name === match[1])) {
            throw new Error(`feasible: "${condition.read}" names an unknown drill`);
        }
        const list = needs.get(match[1]) ?? [];
        list.push({ kind: /** @type {Need['kind']} */ (match[2]), bound: condition.min });
        needs.set(match[1], list);
    }
    return { needs, unchecked: [...new Set(unchecked)] };
}

/**
 * @param {readonly Need[]} needs a drill's demands
 * @param {{reference: number, random: number}} shares the memoryless reference's and the random brains' win shares
 * @returns {number} the final win share that meets every demand (the largest bar)
 */
export function barOf(needs, { reference, random }) {
    const bars = needs.map(({ kind, bound }) => {
        if (kind === 'winShareLow') {
            return bound;
        }
        return kind === 'edgeLow' ? random + bound : reference * bound;
    });
    return Math.max(...bars);
}

/**
 * @param {readonly number[]} finals each population's final win share
 * @param {number} bar the bar
 * @returns {{reached: number, best: number, learnable: boolean}} populations at or above the bar, the best share, and
 *   whether `POPULATIONS_NEEDED` reached it
 */
export function judge(finals, bar) {
    const reached = finals.filter((share) => share >= bar).length;
    return { reached, best: Math.max(...finals), learnable: reached >= POPULATIONS_NEEDED };
}

/**
 * @param {string} name a drill's name
 * @param {{config: Record<string, any>, seed?: number, trials?: number}} run the stage's config overrides and the trials
 * @returns {{reference: number, random: number}} the memoryless reference's win share and the random brains' mean, in
 *   the stage's config
 */
export function baselineShares(name, { config, seed = 1, trials = BASELINE_TRIALS }) {
    const drill = /** @type {import('./drill-scenarios.js').Drill} */ (DRILLS.find((d) => d.name === name));
    const options = { config, seed, trials };
    const brains = randomBrains(drill, options);
    return {
        reference: drillSubject(drill, referenceSubject('memoryless'), options).winShare,
        random: brains.reduce((sum, brain) => sum + drillSubject(drill, brain, options).winShare, 0) / brains.length,
    };
}

/**
 * Plays each hunting specialisation against the forager at the stage config's forager sprint.
 * @param {Record<string, any>} config a stage's config overrides
 * @param {{trials?: number}} [options] trials per chase cell
 * @returns {Record<string, number[]>} each hunter's fair band (start distances as shares of view; empty: no distance
 *   leaves the chase to skill)
 */
export function fairBands(config, options = {}) {
    const stage = createConfig(config);
    const sprintBoost = stage.specialisations.forager.sprintBoost;
    const arena = arenaConfig({ specialisations: { forager: { sprintBoost } } });
    const hunters = Object.entries(arena.specialisations)
        .filter(([, spec]) => /** @type {any} */ (spec).canHunt)
        .map(([name]) => name);
    const results = runEnvelope(arena, {
        ...options,
        pairs: hunters.map((hunter) => /** @type {[string, string]} */ ([hunter, 'forager'])),
    });
    return Object.fromEntries(results.map((r) => [r.pursuer, r.band]));
}
