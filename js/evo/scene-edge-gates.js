// Why does a thin prey population not breed (low-density-edge.md, Detectors)? A share detector, sampled only at the
// edge checkpoints (a 1000-tick checkpoint after burn-in with 1 to `EDGE_PREY - 1` prey alive), from one pass over the
// alive prey:
//
// - `eval.edge_split_blocked_share.*` (watch, lower): of the mature, rested, not-pregnant prey, the share whose first
//   closed split gate is `seen` (`mateScarce` is false), `clonal` (`splitClonalMax`), `energy` (`splitMinBySpec`), `merit`
//   (`splitDeliberateMin`, `splitDeliberateShareMin`), `proof` (`splitBraked`) or `other` (`splitMaxPerLife`,
//   `birthBudgetSpent`, `territoryAllows`), tested in that order. The six shares sum to the blocked share; the rest could split.
//
// Each share pools the prey over the edge checkpoints. The read-only predicates run once per prey; the scratch list of
// prey is allocated with the scene. The scene writes only itself, so no hash can move.

import { birthBudgetSpent } from '../sim/birth-budget.js';
import { mateScarce } from '../sim/mate-scarcity.js';
import { splitBraked } from '../sim/proof.js';
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
        eligible: 0,
        held: { seen: 0, clonal: 0, energy: 0, merit: 0, proof: 0, other: 0 },
    };
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
 * @param {Record<string, any>} gates the gate scene
 * @param {Record<string, any>} world the world
 * @param {number} slot a prey
 * @returns {void}
 */
function tallyPrey(gates, world, slot) {
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
        tallyPrey(gates, world, gates.prey[i]);
    }
}

/**
 * @param {Record<string, any>} gates the gate scene
 * @returns {import('./metrics-stats.js').MetricRecord} the six blocked shares, null with a reason when no edge
 *   checkpoint was sampled (or no eligible prey stood in one)
 */
export function edgeGateMetrics(gates) {
    const noPrey = 'no mature, rested, not-pregnant prey at an edge checkpoint';
    const sampled = gates.checkpoints > 0;
    const share = (/** @type {number} */ count, /** @type {number} */ whole, /** @type {string} */ reason) =>
        !sampled ? none(NO_CHECKPOINT) : whole === 0 ? none(reason) : ok(count / whole);
    return {
        'eval.edge_split_blocked_share.seen': share(gates.held.seen, gates.eligible, noPrey),
        'eval.edge_split_blocked_share.clonal': share(gates.held.clonal, gates.eligible, noPrey),
        'eval.edge_split_blocked_share.energy': share(gates.held.energy, gates.eligible, noPrey),
        'eval.edge_split_blocked_share.merit': share(gates.held.merit, gates.eligible, noPrey),
        'eval.edge_split_blocked_share.proof': share(gates.held.proof, gates.eligible, noPrey),
        'eval.edge_split_blocked_share.other': share(gates.held.other, gates.eligible, noPrey),
    };
}
