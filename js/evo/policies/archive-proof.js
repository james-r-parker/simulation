// The archive's side of the proof rule (natural-selection.md, "The proof rule"): what a mature death does to the archive,
// and the pending table that holds a proven parent whose children have not proven themselves yet.
//
// A death is offered only when the dead genome is established (`isEstablished` in js/sim/proof.js). A proven parent that
// dies with unproven children alive is held in the pending table (its genome and the offer built from its death-log
// row, at most `maxAgents` entries) and offered when one of those children proves; the entry is dropped when the last of
// them dies unproven. Anything else is refused. Preallocated; a scan finds an entry (the table is touched once per
// death and once per proof, never per tick).

import { isEstablished } from '../../sim/proof.js';

/** What a mature death does to the archive. */
export const VERDICT = Object.freeze({ NONE: 0, OFFER: 1, HOLD: 2, REFUSE: 3 });

/**
 * @param {Record<string, any>} world the world, read before the dying slot is freed
 * @param {number} slot the dying agent
 * @returns {number} `OFFER` when the genome is established, `HOLD` when it is proven and has an unproven child alive,
 *   else `REFUSE`
 */
export function verdictOf(world, slot) {
    if (isEstablished(world, slot)) {
        return VERDICT.OFFER;
    }
    return world.proven[slot] === 1 && world.unprovenKids[slot] > 0 ? VERDICT.HOLD : VERDICT.REFUSE;
}

/**
 * @param {number} weightCount weights per genome row
 * @returns {Record<string, any>} an empty entry: an offer (`spec`, `cell`, `row`, `sigma`, `id`, `fitness`, `isClone`,
 *   `archiveRef`, `refId`) plus the children it waits for, its age order and the debug fields
 */
function emptyEntry(weightCount) {
    return {
        spec: 0,
        cell: 0,
        row: new Float32Array(weightCount),
        sigma: 0,
        id: 0,
        fitness: 0,
        isClone: false,
        archiveRef: 0,
        refId: 0,
        live: false,
        kids: 0,
        order: 0,
        extra: undefined,
    };
}

/**
 * @param {number} slots `maxAgents`, the most entries the table holds
 * @param {number} weightCount weights per genome row
 * @returns {Record<string, any>} the table: `hold`, `find`, `childDied`, `take` and `count`
 */
export function createPendingTable(slots, weightCount) {
    const entries = Array.from({ length: slots }, () => emptyEntry(weightCount));
    let next = 0;
    let count = 0;

    /** @returns {Record<string, any> | undefined} the live entry for a genome id */
    function find(/** @type {number} */ genomeId) {
        return entries.find((e) => e.live && e.id === genomeId);
    }

    /** @returns {Record<string, any>} a free entry, or the oldest when the table is full */
    function room() {
        return entries.find((e) => !e.live) ?? entries.reduce((a, b) => (b.order < a.order ? b : a));
    }

    return {
        /** @returns {boolean} whether a live entry holds the genome */
        has: (/** @type {number} */ genomeId) => find(genomeId) !== undefined,
        /** @returns {number} the entries held */
        count: () => count,
        /**
         * Holds a dead proven parent.
         * @param {Record<string, any>} item the offer built for its death
         * @param {{kids: number, extra?: Record<string, number>}} what its unproven children alive, and the debug fields
         * @returns {number} the genome id of the entry evicted to make room, or 0 for none
         */
        hold(item, what) {
            const e = room();
            const evicted = e.live ? e.id : 0;
            count += e.live ? 0 : 1;
            e.row.set(item.row);
            Object.assign(e, { ...item, row: e.row, live: true, kids: what.kids, order: next++, extra: what.extra });
            return evicted;
        },
        /**
         * An unproven child of the genome died: one fewer child can prove the line.
         * @param {number} genomeId the parent's genome id
         * @returns {number} the genome id when that was its last child and the entry was dropped, else 0
         */
        childDied(genomeId) {
            const e = find(genomeId);
            if (e === undefined) {
                return 0;
            }
            e.kids -= 1;
            e.live = e.kids > 0;
            count -= e.live ? 0 : 1;
            return e.live ? 0 : genomeId;
        },
        /**
         * A child of the genome proved itself: removes the entry.
         * @param {number} genomeId the parent's genome id
         * @returns {Record<string, any> | undefined} the entry, an offer valid until the next `hold`, or undefined
         *   when no entry holds the genome
         */
        take(genomeId) {
            const e = find(genomeId);
            if (e !== undefined) {
                e.live = false;
                count -= 1;
            }
            return e;
        },
    };
}

/**
 * @param {number} slots `maxAgents`
 * @returns {Record<string, any>} the per-slot verdict state of `createProofLedger`: the `verdict`, the children a held
 *   parent still `waiting` for, whether it was `proven`, its `genome` id, and how many slots are `holding`
 */
function createVerdicts(slots) {
    return {
        verdict: new Uint8Array(slots),
        waiting: new Uint16Array(slots),
        proven: new Uint8Array(slots),
        genome: new Float64Array(slots),
        holding: 0,
    };
}

/**
 * An unproven child of `genomeId` died in the tick its held parent died: the parent waits for one child fewer, and is
 * refused when none is left.
 * @param {Record<string, any>} state the verdict state
 * @param {number} genomeId the parent's genome id
 * @returns {void}
 */
function shortenWait(state, genomeId) {
    const { verdict, waiting, genome } = state;
    for (let s = 0; state.holding > 0 && s < verdict.length; s++) {
        if (verdict[s] === VERDICT.HOLD && genome[s] === genomeId) {
            waiting[s] -= 1;
            if (waiting[s] === 0) {
                verdict[s] = VERDICT.REFUSE;
                state.holding -= 1;
            }
        }
    }
}

/**
 * The proof rule's bookkeeping for a policy: the verdict of each mature death, the unproven children a held parent
 * still waits for, and the pending table. `died` runs in the death hook (before the slot is freed, so the sim's
 * proof arrays still hold the dying agent); `settle` runs when the policy reads the `AgentDied` record.
 * @param {{slots: number, weightCount: number, log?: import('../../sim/log.js').SimLog}} options `maxAgents`, weights
 *   per genome and the log that receives `ArchivePending` and `ArchiveRefused`
 * @returns {Record<string, any>} `{ table, died, settle }`
 */
export function createProofLedger({ slots, weightCount, log }) {
    const table = createPendingTable(slots, weightCount);
    const state = createVerdicts(slots);

    /** Notes that an unproven child of `genomeId` died, in the table and among this tick's held parents. */
    function childOf(/** @type {number} */ genomeId, /** @type {number} */ tick) {
        if (genomeId !== 0 && table.childDied(genomeId) !== 0) {
            log?.log('debug', 'ArchiveRefused', { tick, genomeId, reason: 'children-died' });
        }
        shortenWait(state, genomeId);
    }

    return {
        table,
        /**
         * A death. An unproven child frees its parents' wait; a mature death gets its verdict.
         * @param {Record<string, any>} world the world before `freeAgent`
         * @param {{slot: number, mature: boolean}} death the dying slot and whether it reached maturity
         * @returns {void}
         */
        died(world, { slot, mature }) {
            if (world.proven[slot] === 0 && world.parentA[slot] !== 0) {
                childOf(world.parentA[slot], world.tick);
                childOf(world.parentB[slot] === world.parentA[slot] ? 0 : world.parentB[slot], world.tick);
            }
            if (mature) {
                state.verdict[slot] = verdictOf(world, slot);
                state.waiting[slot] = world.unprovenKids[slot];
                state.proven[slot] = world.proven[slot];
                state.genome[slot] = world.genomeId[slot];
                state.holding += state.verdict[slot] === VERDICT.HOLD ? 1 : 0;
            }
        },
        /**
         * Settles a mature death when its record is read.
         * @param {number} slot the dying slot
         * @param {{tick: number, item: Record<string, any>, extra?: Record<string, number>}} death the tick, the offer
         *   built from the death-log row, and the debug fields
         * @returns {boolean} true when the death is offered to the archive now
         */
        settle(slot, { tick, item, extra }) {
            const v = state.verdict[slot];
            state.verdict[slot] = VERDICT.NONE;
            const base = { tick, genomeId: item.id, spec: item.spec };
            if (v === VERDICT.HOLD) {
                state.holding -= 1;
                const evicted = table.hold(item, { kids: state.waiting[slot], extra });
                log?.log('debug', 'ArchivePending', { ...base, kids: state.waiting[slot] });
                if (evicted !== 0) {
                    log?.log('debug', 'ArchiveRefused', { tick, genomeId: evicted, reason: 'pending-full' });
                }
            } else if (v === VERDICT.REFUSE) {
                const reason = state.proven[slot] === 1 ? 'no-proven-child' : 'unproven';
                log?.log('debug', 'ArchiveRefused', { ...base, reason });
            }
            return v === VERDICT.OFFER;
        },
    };
}
