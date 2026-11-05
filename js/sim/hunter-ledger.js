// The hunter death ledger (natural-selection.md T53): per slot, what a hunter did with its life - kills, carcass energy
// eaten, energy spent standing, moving and sprinting (charged in `tickCost`) - and how it was born. On a `canHunt` agent's death `pushLedger`
// pushes one `HunterLedger` event beside its `AgentDied`; `drainEvents` logs it at debug level. The arrays are zeroed by
// `freeAgent` and are outside `worldHash` and the snapshot, so no golden moves. No RNG, no clock, no allocation.

import { BORN_CAUSE, EVENT_TYPE, pushEvent } from './events.js';
import { basinOf } from './eras.js';
import { slotOfGenome } from './merit-state.js';

/**
 * How an agent came to be, stored in `birthSource`. A hunter child of a hunter is `MATE_HUNTER` or `SPLIT_HUNTER`; a hunter
 * child of a non-hunter is `SPEC_FLIP` (the `specMutationRate` flip); any other mating or split child is `MATE` or `SPLIT`.
 */
export const BIRTH_SOURCE = Object.freeze({
    INITIAL: 0,
    MATE: 1,
    SPLIT: 2,
    FLOOR: 3,
    IMMIGRANT: 4,
    SPEC_FLIP: 5,
    MATE_HUNTER: 6,
    SPLIT_HUNTER: 7,
});

/** Where a hunter's stored energy came from, the second index of `hunterIncomeBySpec` (`spec * INCOME_KINDS + kind`). */
export const INCOME = Object.freeze({ KILL: 0, BITE: 1, CARCASS: 2, HERD: 3 });
/** The number of income kinds. */
export const INCOME_KINDS = 4;

/**
 * Adds energy a body stored to its specialisation's income.
 * @param {Record<string, any>} world the world
 * @param {number} slot the slot that stored it
 * @param {{kind: number, stored: number}} income the `INCOME` kind and the energy `addEnergy` stored
 * @returns {void}
 */
export function noteIncome(world, slot, { kind, stored }) {
    world.hunterIncomeBySpec[world.spec[slot] * INCOME_KINDS + kind] += stored;
}

/**
 * @returns {[any, string, number][]} the allocation specs for `allocateWorld`, one element per slot
 */
export function ledgerSpecs() {
    return [
        [Uint8Array, 'birthSource', 1],
        [Uint32Array, 'ledgerKills', 1],
        [Float64Array, 'ledgerCarcass', 1],
        [Float64Array, 'ledgerStanding', 1],
        [Float64Array, 'ledgerMove', 1],
        [Float64Array, 'ledgerSprint', 1],
        [Float64Array, 'ledgerKillEnergy', 1],
        [Float64Array, 'ledgerBiteGain', 1],
        [Float64Array, 'ledgerBiteCost', 1],
    ];
}

/**
 * @param {number} cause a `BORN_CAUSE`
 * @returns {number} the `BIRTH_SOURCE` of a spawn with that cause
 */
export function sourceOfSpawn(cause) {
    return cause === BORN_CAUSE.FLOOR
        ? BIRTH_SOURCE.FLOOR
        : cause === BORN_CAUSE.IMMIGRANT
          ? BIRTH_SOURCE.IMMIGRANT
          : BIRTH_SOURCE.INITIAL;
}

/**
 * Records how a child was born.
 * @param {Record<string, any>} world the world
 * @param {{child: number, mother: number, cause: number}} birth the child, its mother and `BORN_CAUSE.MATE` or `SPLIT`
 * @returns {void}
 */
export function noteChildSource(world, { child, mother, cause }) {
    const mate = cause === BORN_CAUSE.MATE;
    const childHunts = world.huntBySpec[world.spec[child]] === 1;
    if (!childHunts) {
        world.birthSource[child] = mate ? BIRTH_SOURCE.MATE : BIRTH_SOURCE.SPLIT;
    } else if (world.huntBySpec[world.spec[mother]] === 1) {
        world.birthSource[child] = mate ? BIRTH_SOURCE.MATE_HUNTER : BIRTH_SOURCE.SPLIT_HUNTER;
    } else {
        world.birthSource[child] = BIRTH_SOURCE.SPEC_FLIP;
    }
}

/**
 * Credits one landed bite to a hunter's ledger: the energy it gained, as kill energy when the bite killed (the kill bonus
 * included) and as bite gain otherwise, and the kick the bite cost it.
 * @param {Record<string, any>} world the world
 * @param {number} biter the biting slot
 * @param {{gained: number, fatal: boolean, kick: number}} bite the energy gained, whether the victim died, the kick paid
 * @returns {void}
 */
export function noteBiteLedger(world, biter, { gained, fatal, kick }) {
    if (fatal) {
        world.ledgerKillEnergy[biter] += gained;
    } else {
        world.ledgerBiteGain[biter] += gained;
    }
    noteIncome(world, biter, { kind: fatal ? INCOME.KILL : INCOME.BITE, stored: gained });
    world.ledgerBiteCost[biter] += kick;
}

/**
 * Credits an eaten victim to its killer, when the killer is alive. Call at the victim's death.
 * @param {Record<string, any>} world the world
 * @param {number} victim the eaten slot
 * @returns {void}
 */
export function noteLedgerKill(world, victim) {
    const killer = slotOfGenome(world, world.lastBiter[victim]);
    if (killer >= 0) {
        world.ledgerKills[killer] += 1;
    }
}

/**
 * Pushes a `HunterLedger` event for a dying hunter and tallies the death. Call it before the slot is freed. The fields
 * are the genome id, the age, `(kills * 8 + deathCause) * 8 + birthSource`, then the carcass energy eaten, the energy
 * spent standing, moving and sprinting, the kill energy, the bite gain and the bite cost.
 * @param {Record<string, any>} world the world
 * @param {number} slot the dying hunter
 * @param {number} cause the `DEATH_CAUSE`
 * @returns {void}
 */
export function noteHunterDeath(world, slot, cause) {
    const o = pushEvent(world.events, EVENT_TYPE.HUNTER_LEDGER, world.tick);
    const d = world.events.data;
    d[o + 2] = world.genomeId[slot];
    d[o + 3] = world.ageTicks[slot];
    d[o + 4] = (world.ledgerKills[slot] * 8 + cause) * 8 + world.birthSource[slot];
    d[o + 5] = world.ledgerCarcass[slot];
    d[o + 6] = world.ledgerStanding[slot];
    d[o + 7] = world.ledgerMove[slot];
    d[o + 8] = world.ledgerSprint[slot];
    d[o + 9] = world.ledgerKillEnergy[slot];
    d[o + 10] = world.ledgerBiteGain[slot];
    d[o + 11] = world.ledgerBiteCost[slot];
    const tally = world.hunterTally;
    tally[0] += 1;
    tally[1] = basinOf(world, world.x[slot]);
    tally[2] = world.genomeId[slot];
}

/**
 * Starts a reap: no hunter has died yet.
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function openHunterTally(world) {
    world.hunterTally[0] = 0;
}

/**
 * Ends a reap: when a hunter died and none is left alive, pushes `LastHunterDied` with the basin of the last hunter to die
 * and the non-hunters alive in each basin.
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function closeHunterTally(world) {
    const tally = world.hunterTally;
    if (tally[0] === 0) {
        return;
    }
    let west = 0;
    let east = 0;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] !== 1) {
            continue;
        }
        if (world.huntBySpec[world.spec[slot]] === 1) {
            return;
        }
        west += basinOf(world, world.x[slot]) === 0 ? 1 : 0;
        east += basinOf(world, world.x[slot]) === 1 ? 1 : 0;
    }
    const o = pushEvent(world.events, EVENT_TYPE.LAST_HUNTER_DIED, world.tick);
    const d = world.events.data;
    d[o + 2] = tally[2];
    d[o + 3] = tally[1];
    d[o + 4] = west;
    d[o + 5] = east;
}
