// The contagion's world state (docs/designs/disease.md, State): the per-agent arrays and the strain pool. Kept apart from
// `disease.js` so `world.js` can allocate it without importing the contagion's rules.

import { DISEASE_MAX_STRAINS } from './config-disease.js';
import { SIMILARITY_DIMS } from './genetics.js';

/** @typedef {Record<string, any>} World */

/** Per-agent arrays, zeroed with the slot when it is freed. */
export const DISEASE_AGENT_ARRAYS = Object.freeze(['infection', 'infectionTicks', 'immuneMask']);

/** Strain-pool arrays, one entry per strain slot (`strainGenotype` holds `SIMILARITY_DIMS` per slot). */
export const DISEASE_STRAIN_ARRAYS = Object.freeze([
    'strainAlive',
    'strainGenotype',
    'strainInfected',
    'strainTotal',
    'strainFounderLineage',
    'strainBornTick',
]);

/** @returns {[any, string, number][]} the per-agent disease arrays, for the world's agent rows */
export function diseaseSpecs() {
    return [
        [Uint8Array, 'infection', 1],
        [Int32Array, 'infectionTicks', 1],
        [Uint8Array, 'immuneMask', 1],
    ];
}

/**
 * Allocates the strain pool.
 * @param {World} world the world being built
 * @returns {void}
 */
export function allocDiseaseState(world) {
    world.strainAlive = new Uint8Array(DISEASE_MAX_STRAINS);
    world.strainGenotype = new Float32Array(DISEASE_MAX_STRAINS * SIMILARITY_DIMS);
    world.strainInfected = new Int32Array(DISEASE_MAX_STRAINS);
    world.strainTotal = new Int32Array(DISEASE_MAX_STRAINS);
    world.strainFounderLineage = new Uint32Array(DISEASE_MAX_STRAINS);
    world.strainBornTick = new Uint32Array(DISEASE_MAX_STRAINS);
}
