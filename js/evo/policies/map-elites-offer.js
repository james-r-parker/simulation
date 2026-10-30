// How `map-elites-v1` feeds the archive. `onDeath` (called inside `step`, before the core frees the slot) copies a
// mature dying agent's row into a per-slot pending buffer; `onEvent` for its `AgentDied` record scores it and
// offers it. The score is read from the eval observer's death log, which the observer has already written for this
// record, so a slot refilled in the same tick does not matter.
//
// Only an established genome is offered (the proof rule, natural-selection.md): `archive-proof.js` gives each mature death
// its verdict, holds a proven parent whose children have not proven themselves, and `LineProven` releases it.

import { cellOf, offer } from '../../evo/archive.js';
import { createProofLedger } from './archive-proof.js';
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
        views: Array.from({ length: slots }, (_, slot) => rows.subarray(slot * wc, (slot + 1) * wc)),
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
 * @param {Record<string, any>} options `{ pending, observer, counters, descriptor }`
 * @returns {(d: Float64Array, o: number, row: number) => import("../../evo/archive.js").Offer} builds the offer for a mature death
 *   from the pending row, the archive's descriptor and the score of the death-log row; it fills and returns one
 *   reused object
 */
function createOfferBuilder({ pending, observer, counters, descriptor }) {
    const point = new Float64Array(2);
    const source = { deaths: observer?.deaths, row: 0, counters, slot: 0 };
    const item = {
        spec: 0,
        cell: 0,
        row: pending.views[0],
        sigma: 0,
        id: 0,
        fitness: 0,
        isClone: false,
        archiveRef: 0,
        refId: 0,
    };
    return (d, o, row) => {
        const slot = d[o + 2];
        if (pending.id[slot] !== d[o + 3]) {
            throw new Error(`map-elites-v1: no pending row for genome ${d[o + 3]} in slot ${slot}`);
        }
        source.deaths = observer.deaths;
        source.row = row;
        source.slot = slot;
        descriptor.point(source, point);
        item.spec = d[o + 6];
        item.cell = cellOf(point[0], point[1]);
        item.row = pending.views[slot];
        item.sigma = pending.sigma[slot];
        item.id = d[o + 3];
        item.fitness = observer.deaths.fitness[row];
        item.isClone = pending.isClone[slot] === 1;
        item.archiveRef = pending.archiveRef[slot];
        item.refId = pending.refId[slot];
        return item;
    };
}

/**
 * Offers a death to the archive, and logs its score when the policy keeps the parts.
 * @param {{archive: any, log?: import('../../sim/log.js').SimLog}} sink the archive and the log
 * @param {{tick: number, item: import('../../evo/archive.js').Offer, extra?: Record<string, number>}} scored the tick, the offer and the
 *   debug fields of its `FitnessScored` event (none: no event)
 * @returns {void}
 */
function offerScored({ archive, log }, { tick, item, extra }) {
    offer(archive, item, log);
    if (extra !== undefined) {
        log?.log('debug', 'FitnessScored', {
            tick,
            genomeId: item.id,
            spec: item.spec,
            cell: item.cell,
            fitness: item.fitness,
            ...extra,
        });
    }
}

/**
 * @param {Record<string, any> | undefined} observer the eval observer
 * @returns {(genomeId: number) => number} the death-log row of the next `AgentDied` record: the observer logs deaths in
 *   record order and the policy counts them the same; a host that empties the log (`drainObserverLogs`) adds the rows it
 *   removed to `observer.deathsDrained`
 */
function createRowReader(observer) {
    let deathsSeen = 0;
    return (genomeId) => {
        const row = deathsSeen++ - /** @type {any} */ (observer).deathsDrained;
        const deaths = /** @type {any} */ (observer).deaths;
        if (deaths.genomeId[row] !== genomeId || Number.isNaN(deaths.fitness[row])) {
            throw new Error(`map-elites-v1: death log row ${row} is not genome ${genomeId} or unscored`);
        }
        return row;
    };
}

/**
 * @param {Record<string, any>} options `{ config, archive, observer, counters, clones, sigma, log, scoreFields }`;
 *   `clones` is `{ isClone, archiveRef, refId }`, `sigma` the per-slot step sizes and `scoreFields(row)`, when given,
 *   the fields a debug `FitnessScored` event carries beside the offer's own (none given: no event)
 * @returns {{onDeath: Function, onEvent: Function}} the two hooks; both do nothing without an `observer`, which
 *   is the only source of fitness and speed, so an unobserved run leaves the archive empty
 */
export function createOffers({ config, archive, observer, counters, clones, sigma, log, scoreFields }) {
    const pending = createPending(config.maxAgents, archive.layout.weightCount);
    const from = { ...clones, sigma };
    const offerOf = createOfferBuilder({ pending, observer, counters, descriptor: archive.descriptor });
    const ledger = createProofLedger({ slots: config.maxAgents, weightCount: archive.layout.weightCount, log });
    const scoredRow = createRowReader(observer);

    function onDeath(/** @type {any} */ world, /** @type {number} */ slot) {
        const mature = observer !== undefined && world.ageTicks[slot] >= config.maturityTicks;
        if (mature) {
            pending.save(world, slot, from);
        }
        ledger.died(world, { slot, mature });
    }

    /** A child proved itself: each parent held in the pending table is established and offered. */
    function onProven(/** @type {Float64Array} */ d, /** @type {number} */ o) {
        for (const id of d[o + 4] === d[o + 5] ? [d[o + 4]] : [d[o + 4], d[o + 5]]) {
            const taken = ledger.table.take(id);
            if (taken !== undefined) {
                offerScored({ archive, log }, { tick: d[o + 1], item: taken, extra: taken.extra });
            }
        }
    }

    function onEvent(/** @type {any} */ world, /** @type {number} */ o) {
        const d = world.events.data;
        if (observer === undefined) {
            return;
        }
        if (d[o] === EVENT_TYPE.LINE_PROVEN) {
            onProven(d, o);
        }
        if (d[o] !== EVENT_TYPE.AGENT_DIED) {
            return;
        }
        const row = scoredRow(d[o + 3]);
        if (d[o + 8] >= config.maturityTicks) {
            const item = offerOf(d, o, row);
            const extra = scoreFields?.(row);
            if (ledger.settle(d[o + 2], { tick: d[o + 1], item, extra })) {
                offerScored({ archive, log }, { tick: d[o + 1], item, extra });
            }
            pending.id[d[o + 2]] = 0;
        }
    }

    return { onDeath, onEvent };
}
