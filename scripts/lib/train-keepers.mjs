// Kept passers (docs/designs/training-stages.md, T59): when a stage with `keepPasser` passes its gate, the trainer keeps the
// champions that passed it; at every later gate checkpoint it drills them on that stage's own drills and offers the
// readings to the retention read (`readings.keepers.<stage>`, `js/evo/stage-run.js`). A detector and a trainer memory
// only: a kept passer is never put back into the archive or the world.
import { drillReadings } from '../../js/evo/gate-readings.js';
import { drillGenomes } from '../drill.mjs';

/** The most champions kept per stage (those with the highest lower bound). */
export const KEEP_MAX = 8;

/**
 * @typedef {object} KeptSubject
 * @property {string} name the subject's name
 * @property {number} id the genome id
 * @property {number | null} spec the specialisation
 * @property {string | undefined} [style] the style band
 * @property {number} [lowerBound] the archive lower bound when kept
 * @property {number[]} weights the genome row
 */

/**
 * @param {readonly any[]} subjects the champions drilled at a pass
 * @returns {KeptSubject[]} the best `KEEP_MAX` by lower bound, as plain data (the row as numbers) so they save as JSON
 */
export function toKept(subjects) {
    const best = [...subjects].sort((a, b) => (b.lowerBound ?? 0) - (a.lowerBound ?? 0)).slice(0, KEEP_MAX);
    return best.map((s) => ({
        name: s.name,
        id: s.id,
        spec: s.spec,
        style: s.style,
        lowerBound: s.lowerBound,
        weights: Array.from(s.weights),
    }));
}

/**
 * @param {readonly KeptSubject[]} kept saved kept passers
 * @returns {any[]} drill subjects
 */
export function fromKept(kept) {
    return kept.map((k) => ({ ...k, weights: Float32Array.from(k.weights), act: null }));
}

/**
 * @param {Record<string, any> | undefined} saved the `keepers` of a saved archive, if any
 * @returns {Record<string, KeptSubject[]>} the kept passers by stage (none: empty)
 */
export function loadKeepers(saved) {
    return saved ?? {};
}

/**
 * @param {readonly {read: string}[]} gate a stage's gate conditions
 * @returns {string[]} the drills they read (`drill.<name>.<reading>`)
 */
export function gateDrills(gate) {
    return [...new Set(gate.flatMap((c) => /^drill\.([^.]+)\./.exec(c.read)?.[1] ?? []))];
}

/**
 * Drills each stage's kept passers on that stage's gate drills.
 * @param {Record<string, KeptSubject[]>} keepers the kept passers by stage
 * @param {{stages: readonly {name: string, gate?: any[]}[], seed: number, trials: number, workers: number | undefined,
 *   cache?: import('./drill-cache.mjs').DrillCache, log: import('../../js/sim/log.js').SimLog}} at the stages, the gate's
 *   drill seed and trials, the pool size, the run's drill cache (none: no cache) and the log
 * @returns {Promise<Record<string, Record<string, any>>>} `<stage>` -> the drill readings of its kept passers
 */
export async function keeperReadings(keepers, { stages, seed, trials, workers, cache, log }) {
    /** @type {Record<string, Record<string, any>>} */
    const out = {};
    for (const stage of stages) {
        const kept = keepers[stage.name];
        if (kept === undefined || kept.length === 0 || stage.gate === undefined) {
            continue;
        }
        const drills = gateDrills(stage.gate);
        const genomes = fromKept(kept);
        const rows = await drillGenomes(/** @type {any} */ ({ drills, seed, trials, workers, cache }), {
            genomes,
            config: {},
            log,
        });
        out[stage.name] = drillReadings(/** @type {any} */ (rows), genomes.length, drills);
    }
    return out;
}
