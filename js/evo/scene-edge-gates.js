// Why does a thin prey population not breed (low-density-edge.md, Detectors)? Two share detectors, sampled only at the
// edge checkpoints (a 1000-tick checkpoint after burn-in with 1 to `EDGE_PREY - 1` prey alive), each from one pass over the
// alive prey:
//
// - `eval.edge_mate_unreached_share` (watch, lower): of the ready prey females (`isReadyToMate`), the share that saw a
//   possible mate in the latest sense (`mateSeenAt` is the tick before the checkpoint's, since `step` advances `tick` after
//   the sense phase) and have none within `size[a] + size[b] + mateRange` of them. The reach is the distance half of
//   `isPartner` in `js/sim/mate-search.js`; the mate is `isPossibleMate`, the test `noteMatesSeen` uses (the other half of
//   `isPartner`, `canMatePair`, asks for the brain to want it, so it would not read 0 once `noteMatesSeen` counts only
//   reachable mates). It reads 0 by construction once the reach lands.
// - `eval.edge_split_blocked_share.*` (watch, lower): of the mature, rested, not-pregnant prey, the share whose first
//   closed split gate is `seen` (`mateScarce` is false), `clonal` (`splitClonalMax`), `energy` (`splitMinBySpec`), `merit`
//   (`splitDeliberateMin`, `splitDeliberateShareMin`), `proof` (`splitBraked`) or `other` (`splitMaxPerLife`,
//   `birthBudgetSpent`, `territoryAllows`), tested in that order. The six shares sum to the blocked share; the rest could split.
//
// Each share pools the prey over the edge checkpoints. The read-only predicates run once per prey; the scratch list of
// prey is allocated with the scene. The scene writes only itself, so no hash can move.

import { birthBudgetSpent } from '../sim/birth-budget.js';
import { isPossibleMate, mateScarce } from '../sim/mate-scarcity.js';
import { isReadyToMate } from '../sim/mate-eligibility.js';
import { splitBraked } from '../sim/proof.js';
import { SEX } from '../sim/sex.js';
import { territoryAllows } from '../sim/territory.js';
import { none, ok } from './metrics-stats.js';

/** The split gates in the order a prey is attributed to the first that holds it. */
export const GATES = Object.freeze(['seen', 'clonal', 'energy', 'merit', 'proof', 'other']);

const NO_CHECKPOINT = 'no edge checkpoint (a 1000-tick checkpoint after burn-in with 1 to 99 prey)';

/**
 * @param {number} limit the most prey one sample reads (the edge bound)
 * @returns {Record<string, any>} an empty gate scene: the prey scratch list and the pooled counts
 */
export function createEdgeGates(limit) {
    return {
        prey: new Int32Array(limit),
        checkpoints: 0,
        females: 0,
        unreached: 0,
        eligible: 0,
        held: { seen: 0, clonal: 0, energy: 0, merit: 0, proof: 0, other: 0 },
    };
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive prey
 * @returns {boolean} whether the prey saw a possible mate in the latest sense (`step` ran it at the tick before this one)
 */
function sawMate(world, slot) {
    return world.mateSeenAt[slot] === world.tick - 1;
}

/**
 * @param {Record<string, any>} gates the gate scene, its `prey` list filled to `count`
 * @param {Record<string, any>} world the world
 * @param {number} count the prey in the list
 * @param {number} slot a ready prey female
 * @returns {boolean} whether some prey in the list is a possible mate of `slot` within reach
 */
function mateInReach(gates, world, count, slot) {
    const { x, y, size } = world;
    for (let i = 0; i < count; i++) {
        const other = gates.prey[i];
        if (isPossibleMate(world, slot, other)) {
            const dx = x[other] - x[slot];
            const dy = y[other] - y[slot];
            const reach = size[slot] + size[other] + world.config.mateRange;
            if (dx * dx + dy * dy < reach * reach) {
                return true;
            }
        }
    }
    return false;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot a prey
 * @returns {boolean} whether the merit split gate holds it: too little deliberate intake, or too small a deliberate share of
 *   its meals (`splitDeliberateMin`, `splitDeliberateShareMin`)
 */
function meritHolds(world, slot) {
    const c = world.config;
    const total = world.mealsTotal[slot];
    const shareMissed =
        c.splitDeliberateShareMin !== 0 &&
        (total === 0 || world.mealsDeliberate[slot] < c.splitDeliberateShareMin * total);
    return (c.splitDeliberateMin !== 0 && world.deliberateIntake[slot] < c.splitDeliberateMin) || shareMissed;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot a prey
 * @returns {boolean} whether the lifetime cap, the birth budget or the territory rule holds it
 */
function otherHolds(world, slot) {
    const { splitMaxPerLife } = world.config;
    const capped = splitMaxPerLife > 0 && world.splitsDone[slot] >= splitMaxPerLife;
    return capped || birthBudgetSpent(world, slot) || !territoryAllows(world, slot);
}

/**
 * The first gate that holds a mature, rested, not-pregnant prey from splitting.
 * @param {Record<string, any>} world the world
 * @param {number} slot the prey
 * @returns {'seen' | 'clonal' | 'energy' | 'merit' | 'proof' | 'other' | null} the gate, or null when none holds it
 */
export function firstClosedGate(world, slot) {
    if (!mateScarce(world, slot)) {
        return 'seen';
    }
    if (world.clonalDepth[slot] >= world.config.splitClonalMax) {
        return 'clonal';
    }
    if (world.energy[slot] <= world.splitMinBySpec[world.spec[slot]]) {
        return 'energy';
    }
    if (meritHolds(world, slot)) {
        return 'merit';
    }
    if (splitBraked(world, slot)) {
        return 'proof';
    }
    return otherHolds(world, slot) ? 'other' : null;
}

/**
 * Lists the alive prey, up to the list's length.
 * @param {Record<string, any>} gates the gate scene
 * @param {Record<string, any>} world the world
 * @returns {number} the prey listed
 */
function listPrey(gates, world) {
    let count = 0;
    for (let slot = 0; slot < world.alive.length && count < gates.prey.length; slot++) {
        if (world.alive[slot] === 1 && world.huntBySpec[world.spec[slot]] !== 1) {
            gates.prey[count++] = slot;
        }
    }
    return count;
}

/**
 * Adds one prey to the pooled counts.
 * @param {Record<string, any>} gates the gate scene, its `prey` list filled to `count`
 * @param {Record<string, any>} world the world
 * @param {{slot: number, count: number}} prey the prey and the length of the list
 * @returns {void}
 */
function tallyPrey(gates, world, { slot, count }) {
    if (world.sex[slot] === SEX.FEMALE && isReadyToMate(world, slot)) {
        gates.females += 1;
        gates.unreached += sawMate(world, slot) && !mateInReach(gates, world, count, slot) ? 1 : 0;
    }
    if (
        world.ageTicks[slot] >= world.config.maturityTicks &&
        world.cooldown[slot] === 0 &&
        world.pregnancy[slot] === 0
    ) {
        gates.eligible += 1;
        const gate = firstClosedGate(world, slot);
        if (gate !== null) {
            gates.held[gate] += 1;
        }
    }
}

/**
 * Samples the alive prey at an edge checkpoint. The caller picks the checkpoint; the prey must be few (at most the list's
 * length are read).
 * @param {Record<string, any>} gates the gate scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleEdgeGates(gates, world) {
    const count = listPrey(gates, world);
    gates.checkpoints += 1;
    for (let i = 0; i < count; i++) {
        tallyPrey(gates, world, { slot: gates.prey[i], count });
    }
}

/**
 * @param {Record<string, any>} gates the gate scene
 * @returns {import('./metrics-stats.js').MetricRecord} the unreached share and the six blocked shares, null with a reason
 *   when no edge checkpoint was sampled (or no ready female, or no eligible prey, stood in one)
 */
export function edgeGateMetrics(gates) {
    const noFemale = 'no ready prey female at an edge checkpoint';
    const noPrey = 'no mature, rested, not-pregnant prey at an edge checkpoint';
    const sampled = gates.checkpoints > 0;
    const share = (/** @type {number} */ count, /** @type {number} */ whole, /** @type {string} */ reason) =>
        !sampled ? none(NO_CHECKPOINT) : whole === 0 ? none(reason) : ok(count / whole);
    return {
        'eval.edge_mate_unreached_share': share(gates.unreached, gates.females, noFemale),
        'eval.edge_split_blocked_share.seen': share(gates.held.seen, gates.eligible, noPrey),
        'eval.edge_split_blocked_share.clonal': share(gates.held.clonal, gates.eligible, noPrey),
        'eval.edge_split_blocked_share.energy': share(gates.held.energy, gates.eligible, noPrey),
        'eval.edge_split_blocked_share.merit': share(gates.held.merit, gates.eligible, noPrey),
        'eval.edge_split_blocked_share.proof': share(gates.held.proof, gates.eligible, noPrey),
        'eval.edge_split_blocked_share.other': share(gates.held.other, gates.eligible, noPrey),
    };
}
