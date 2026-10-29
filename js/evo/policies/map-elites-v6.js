// map-elites-v6: `map-elites-v1` scored by `fitnessV6` and placed by `descriptorV6` (role skill x body plan), with an
// immigrant mix set by options (fitness-and-selection.md "Archive"). It is the live policy from T48b (the E41 finalist
// split-300, with merit on and the split gate at 300).
//
// Options beyond the eval runner's `{ config, log, observer }`: `fitnessOverrides` (weights replacing `FITNESS_V6`
// entries), `archiveShare` and `cloneShareEnd` (the immigrant mix), `cellDraws` (the parent cell tournament, default
// `QUALITY_CELL_DRAWS`, four) and `descriptor` (the name of a registered descriptor, default `v6`).
//
// With a debug log and an observer, every scored death also keeps its group values in extra columns of the observer's
// death log, which `FitnessScored` reads when the policy offers the death. The wrapped fitness computes the parts a
// second time, so nothing is added at the default level.

import { DESCRIPTORS } from '../../evo/descriptors.js';
import { createFitnessV6 } from '../../evo/fitness-v6.js';
import { ensureRoom } from '../../evo/growable-log.js';
import { LOG_LEVEL } from '../../sim/log.js';
import { QUALITY_CELL_DRAWS, createMapElitesV1 } from './map-elites-v1.js';

/** The death-log columns that hold a scored death's parts, by the `FitnessScored` field they feed. */
const PART_COLUMNS = Object.freeze({
    skill: 'scoreSkill',
    waste: 'scoreWaste',
    lineage: 'scoreLineage',
    watch: 'scoreWatch',
    diversityFactor: 'scoreDiversity',
});

/**
 * Adds the part columns to the observer's death log and wraps the fitness so each scored death fills its row.
 * @param {Record<string, any>} observer the observer
 * @param {ReturnType<typeof createFitnessV6>} base the fitness
 * @returns {{fitness: ReturnType<typeof createFitnessV6>, scoreFields: (row: number) => Record<string, number>}}
 */
function recordParts(observer, base) {
    const names = /** @type {Array<keyof typeof PART_COLUMNS>} */ (Object.keys(PART_COLUMNS));
    const { deaths } = observer;
    for (const column of Object.values(PART_COLUMNS)) {
        deaths[column] = new Float64Array(deaths.capacity);
    }
    const parts = { skill: 0, waste: 0, lineage: 0, watch: 0, diversityFactor: 1 };
    const fitness = (/** @type {any} */ obs, /** @type {number} */ slot, /** @type {any} */ config) => {
        const value = base(obs, slot, config);
        ensureRoom(obs.deaths, obs.deathCount);
        base.parts(obs, slot, config, parts);
        for (const name of names) {
            obs.deaths[PART_COLUMNS[name]][obs.deathCount] = parts[name];
        }
        return value;
    };
    return {
        fitness: Object.assign(fitness, { weights: base.weights, parts: base.parts }),
        scoreFields: (row) => Object.fromEntries(names.map((name) => [name, deaths[PART_COLUMNS[name]][row]])),
    };
}

/**
 * @param {Record<string, any>} options `{ counters, observer, log, fitnessOverrides }`
 * @returns {{fitness: ReturnType<typeof createFitnessV6>, scoreFields?: (row: number) => Record<string, number>}}
 */
function createScoring({ counters, observer, log, fitnessOverrides }) {
    const base = createFitnessV6(counters, fitnessOverrides);
    const debug = log !== undefined && LOG_LEVEL[/** @type {keyof typeof LOG_LEVEL} */ (log.level)] <= LOG_LEVEL.debug;
    return debug && observer !== undefined ? recordParts(observer, base) : { fitness: base };
}

/**
 * Builds the map-elites-v6 policy object.
 * @param {Record<string, any>} options the eval runner's `{ config, log, observer }` plus the options in the header
 * @returns {Record<string, any>} the `map-elites-v1` policy object with `name` `map-elites-v6` and `fitnessName` `v6`
 */
export function createMapElitesV6(options) {
    const { fitnessOverrides, descriptor: descriptorName = 'v6', ...rest } = options;
    if (!Object.hasOwn(DESCRIPTORS, descriptorName)) {
        throw new Error(
            `createMapElitesV6: unknown descriptor "${descriptorName}"; known: ${Object.keys(DESCRIPTORS).join(', ')}`,
        );
    }
    return createMapElitesV1({
        cellDraws: QUALITY_CELL_DRAWS,
        ...rest,
        name: 'map-elites-v6',
        scoring: {
            fitnessName: 'v6',
            descriptor: DESCRIPTORS[/** @type {keyof typeof DESCRIPTORS} */ (descriptorName)],
            createScoring: (/** @type {Record<string, any>} */ ctx) => createScoring({ ...ctx, fitnessOverrides }),
        },
    });
}
