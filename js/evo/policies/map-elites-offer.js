// How `map-elites-v1` feeds the archive. `onDeath` (called inside `step`, before the core frees the slot) copies a
// mature dying agent's row into a per-slot pending buffer; `onEvent` for its `AgentDied` record scores it and
// offers it. The score is read from the eval observer's death log, which the observer has already written for this
// record, so a slot refilled in the same tick does not matter.

import { cellOf, offer } from '../../evo/archive.js';
import { crowdingMean } from '../../evo/life-counters.js';
import { EVENT_TYPE } from '../../sim/events.js';

/**
 * Per-slot copies of the dying agents' genomes, preallocated.
 * @param {number} slots `maxAgents`
 * @param {number} wc weights per row
 * @returns {Record<string, any>} the buffers and `save(world, slot, from)`
 */
function createPending(slots, wc) {
    const rows = new Float32Array(slots * wc);
    const p = {
        rows,
        sigma: new Float32Array(slots),
        id: new Float64Array(slots),
        isClone: new Uint8Array(slots),
        archiveRef: new Int32Array(slots),
        refId: new Float64Array(slots),
        row: (/** @type {number} */ slot) => rows.subarray(slot * wc, (slot + 1) * wc),
        save(/** @type {any} */ world, /** @type {number} */ slot, /** @type {Record<string, any>} */ from) {
            rows.set(world.weights.subarray(slot * wc, (slot + 1) * wc), slot * wc);
            p.sigma[slot] = from.sigma[slot];
            p.id[slot] = world.genomeId[slot];
            p.isClone[slot] = from.isClone[slot];
            p.archiveRef[slot] = from.archiveRef[slot];
            p.refId[slot] = from.refId[slot];
        },
    };
    return p;
}

/**
 * @param {Record<string, any>} options `{ config, archive, observer, counters, clones, sigma, log }`; `clones` is
 *   `{ isClone, archiveRef, refId }` and `sigma` the per-slot step sizes
 * @returns {{onDeath: Function, onEvent: Function}} the two hooks; both do nothing without an `observer`, which
 *   is the only source of fitness and speed, so an unobserved run leaves the archive empty
 */
export function createOffers({ config, archive, observer, counters, clones, sigma, log }) {
    const pending = createPending(config.maxAgents, archive.layout.weightCount);
    const from = { ...clones, sigma };
    let deathsSeen = 0;

    function onDeath(/** @type {any} */ world, /** @type {number} */ slot) {
        if (observer !== undefined && world.ageTicks[slot] >= config.maturityTicks) {
            pending.save(world, slot, from);
        }
    }

    /** The death-log row of the record: the observer logs deaths in record order, the policy counts them the same. */
    function scoredRow(/** @type {number} */ genomeId) {
        const row = deathsSeen++;
        const deaths = observer.deaths;
        if (deaths.genomeId[row] !== genomeId || Number.isNaN(deaths.fitness[row])) {
            throw new Error(`map-elites-v1: death log row ${row} is not genome ${genomeId} or unscored`);
        }
        return row;
    }

    /** The offer for a mature death: the pending row, the descriptors and score from the log row. */
    function offerOf(/** @type {Float64Array} */ d, /** @type {number} */ o, /** @type {number} */ row) {
        const slot = d[o + 2];
        if (pending.id[slot] !== d[o + 3]) {
            throw new Error(`map-elites-v1: no pending row for genome ${d[o + 3]} in slot ${slot}`);
        }
        const { samples, speedSum, fitness } = observer.deaths;
        const speed = samples[row] === 0 ? 0 : Math.min(1, speedSum[row] / samples[row]);
        return {
            spec: d[o + 6],
            cell: cellOf(speed, crowdingMean(counters, slot)),
            row: pending.row(slot),
            sigma: pending.sigma[slot],
            id: d[o + 3],
            fitness: fitness[row],
            isClone: pending.isClone[slot] === 1,
            archiveRef: pending.archiveRef[slot],
            refId: pending.refId[slot],
        };
    }

    function onEvent(/** @type {any} */ world, /** @type {number} */ o) {
        const d = world.events.data;
        if (observer === undefined || d[o] !== EVENT_TYPE.AGENT_DIED) {
            return;
        }
        const row = scoredRow(d[o + 3]);
        if (d[o + 8] >= config.maturityTicks) {
            offer(archive, offerOf(d, o, row), log);
            pending.id[d[o + 2]] = 0;
        }
    }

    return { onDeath, onEvent };
}
