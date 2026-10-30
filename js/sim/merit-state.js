// The per-slot state behind in-world merit: the merit arrays, the tracker that decides whether a meal or bite is
// deliberate (an exact port of `trackTarget` and `isDeliberate` in js/evo/observer-intent.js, whose constants and
// `isDeliberate` the observer now imports from here) and the escape episode state. Nothing here draws randomness
// or allocates per tick. See docs/designs/fitness-and-selection.md (In-world merit).

import { RAY_CHANNELS } from './brain-layout.js';
import { detCos, detSin } from './det-math.js';
import { visionOf } from './traits.js';

/** Ticks a sighting stays current. */
export const INTENT_WINDOW = 30;

/** Ticks of closing history read. */
export const CLOSING_BITS = 10;

/** Of those ticks, how many must show the agent closing on the nearest target. */
export const CLOSING_MIN = 6;

/** A tick counts as closing on a target when the agent's speed towards it exceeds this share of `maxVelocity`. */
export const CLOSING_SPEED = 0.25;

/**
 * An agent moving slower than this share of `maxVelocity` is nearly still. Prey that closes on a nearly still agent at
 * more than `CLOSING_SPEED` counts as a closing tick for it, so an ambush is deliberate (principles rule 2).
 */
export const AMBUSH_STILL = 0.1;

/** A turn counts only above this fraction of `maxTurn`. */
export const TURN_THRESHOLD = 0.1;

/** Ticks after the first bite of an episode in which a flee still counts. */
export const RESPONSE_WINDOW = 30;

/** Ticks after the first bite of an episode at which a surviving agent has escaped. */
export const ESCAPE_TICKS = 300;

/** An agent moving faster than this share of `maxVelocity` counts as fleeing. */
export const FLEE_SPEED = 0.5;

/**
 * Slots of `world.meritTally`, agent-ticks counted at each tick's split decision: the cumulative
 * totals first, then the totals at the last `MeritSummary` (the log reads the difference).
 */
export const TALLY = Object.freeze({ READY: 0, GATED: 1, DELIBERATE: 2, MARK: 3 });

/** Length of `world.meritTally`. */
export const MERIT_TALLY_SIZE = 6;

const NEVER = -Infinity;
const CLOSING_MASK = (1 << CLOSING_BITS) - 1;

// Class channels within a ray (see js/sim/ray-march.js).
const CH_FOOD = 1;
const CH_THREAT = 2;
const CH_PREY = 3;

/** Per-slot arrays as `[type, name, value a (re)allocated slot holds]`; every other value is 0. */
/** @type {[any, string, number][]} */
const MERIT_FIELDS = [
    [Float64Array, 'merit', 0],
    [Float64Array, 'deliberateIntake', 0],
    [Float64Array, 'meritStamp', 0],
    [Int32Array, 'parentSlotA', -1],
    [Int32Array, 'parentSlotB', -1],
    [Float64Array, 'meritFoodSeen', NEVER],
    [Uint16Array, 'meritFoodBits', 0],
    [Float64Array, 'meritFoodTurn', NEVER],
    [Float64Array, 'meritFoodOff', NEVER],
    [Float64Array, 'meritFoodStart', NEVER],
    [Float64Array, 'meritPreySeen', NEVER],
    [Uint16Array, 'meritPreyBits', 0],
    [Float64Array, 'meritPreyTurn', NEVER],
    [Float64Array, 'meritPreyOff', NEVER],
    [Float64Array, 'meritPreyStart', NEVER],
    [Float64Array, 'meritFoodProx', -1],
    [Float64Array, 'meritPreyProx', -1],
    [Float64Array, 'meritFoodMark', 0],
    [Float64Array, 'meritBiteMark', 0],
    [Uint8Array, 'biteOpen', 0],
    [Uint32Array, 'biteFirst', 0],
    [Uint8Array, 'biteResponded', 0],
];

const NAMES = MERIT_FIELDS.map(([, name]) => name);
const RESETS = MERIT_FIELDS.map(([, , value]) => value);

/**
 * @returns {[any, string, number][]} the allocation specs for `allocateWorld`, one element per slot each
 */
export function meritSpecs() {
    return MERIT_FIELDS.map(([Type, name]) => [Type, name, 1]);
}

/**
 * The arc rays: ray `k` points `2 pi k / rayCount` from the heading, and is an arc ray when that angle, wrapped to
 * -PI..PI, is within `biteArc + 1e-9` of 0; every ray is one when `biteArc` is at least PI.
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Uint8Array} 1 for each arc ray
 */
export function arcRays(config) {
    const arc = new Uint8Array(config.rayCount);
    for (let k = 0; k < config.rayCount; k++) {
        let angle = (2 * Math.PI * k) / config.rayCount;
        angle = angle > Math.PI ? angle - 2 * Math.PI : angle;
        arc[k] = config.biteArc >= Math.PI || Math.abs(angle) <= config.biteArc + 1e-9 ? 1 : 0;
    }
    return arc;
}

/**
 * @param {Record<string, any>} world the world with its merit arrays
 * @param {string} name `Food` or `Prey`
 * @param {number} at the offset of the kind's hit in a scan row: 0 for food, 2 for prey
 * @returns {Record<string, any>} the kind's state arrays, `at`, and whether turning away clears its closing history
 */
function targetView(world, name, at) {
    const array = (/** @type {string} */ field) => world[`merit${name}${field}`];
    return {
        seen: array('Seen'),
        bits: array('Bits'),
        turn: array('Turn'),
        off: array('Off'),
        start: array('Start'),
        prox: array('Prox'),
        at,
        clears: at === 0,
        ambush: at !== 0,
    };
}

/**
 * Builds the food and prey target views the tracker and `isDeliberate` read, as direct references to the world's
 * arrays. Call once after the arrays are allocated.
 * @param {Record<string, any>} world the world with its merit arrays
 * @returns {void}
 */
export function createMeritViews(world) {
    world.meritArc = arcRays(world.config);
    world.meritFood = targetView(world, 'Food', 0);
    world.meritPrey = targetView(world, 'Prey', 2);
}

/**
 * Resets a freshly allocated slot's merit, tracker and episode state.
 * @param {Record<string, any>} world the world
 * @param {number} slot the slot `allocAgent` just took
 * @returns {void}
 */
export function resetMeritSlot(world, slot) {
    for (let i = 0; i < NAMES.length; i++) {
        world[NAMES[i]][slot] = RESETS[i];
    }
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} genomeId a genome id
 * @returns {number} the alive slot holding that genome, or -1 for none (dead, or an id of 0)
 */
export function slotOfGenome(world, genomeId) {
    // `freeAgent` zeroes a dead slot's `genomeId`, and a live one is never 0, so the first match is the live slot.
    return genomeId === 0 ? -1 : world.genomeId.indexOf(genomeId);
}

/**
 * @param {number} v a 16-bit value
 * @returns {number} the number of set bits
 */
export function popcount16(v) {
    const pairs = v - ((v >> 1) & 0x5555);
    const nibbles = (pairs & 0x3333) + ((pairs >> 2) & 0x3333);
    const bytes = (nibbles + (nibbles >> 4)) & 0x0f0f;
    return (bytes + (bytes >> 8)) & 0x1f;
}

/**
 * @param {Record<string, any>} kind a target view with `seen`, `bits`, `turn`, `off` and `start` arrays
 * @param {number} slot the slot
 * @param {number} tick the observed tick
 * @returns {boolean} whether the sighting is current, enough of the history shows the agent closing on the target,
 *   and the agent either turned towards it within the window or never saw it off the ray dead ahead
 */
export function isDeliberate(kind, slot, tick) {
    const bits = kind.bits[slot] & CLOSING_MASK;
    if (tick - kind.seen[slot] > INTENT_WINDOW || popcount16(bits) < CLOSING_MIN) {
        return false;
    }
    const turned = tick - kind.turn[slot] <= INTENT_WINDOW;
    return turned || kind.off[slot] < kind.start[slot];
}

/**
 * @param {number} k ray index
 * @param {number} rayCount rays per agent
 * @returns {number} +1 for a ray on the positive turn side, -1 for the negative side, 0 dead ahead, +1 dead behind
 */
export function turnTowards(k, rayCount) {
    if (k <= 0) {
        return 0;
    }
    return 2 * k <= rayCount ? 1 : -1;
}

/** Nearest hit per kind: food proximity, food ray, prey proximity, prey ray; reused by every call. */
const best = new Float64Array(4);

/**
 * Finds the nearest food hit and the nearest prey hit on an arc ray, with the classing of the observer's
 * `summariseRays`: food first, then any threat hit (which is not prey), then prey on an arc ray.
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @returns {void} the hits are left in `best`; a proximity or ray is -1 for none
 */
function scanRays(world, slot) {
    const { inputs, meritArc } = world;
    const origin = slot * world.layout.rawInputCount;
    best.fill(-1);
    for (let k = 0; k < world.config.rayCount; k++) {
        const base = origin + k * RAY_CHANNELS;
        const at = inputs[base + CH_FOOD] === 1 ? 0 : -1;
        const preyAt = inputs[base + CH_THREAT] <= 0 && inputs[base + CH_PREY] > 0 && meritArc[k] === 1 ? 2 : -1;
        const i = at === 0 ? 0 : preyAt;
        if (i >= 0 && inputs[base] > best[i]) {
            best[i] = inputs[base];
            best[i + 1] = k;
        }
    }
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @param {number} k a ray index
 * @returns {number} the agent's velocity component along ray `k`'s direction
 */
export function speedAlong(world, slot, k) {
    const cosH = detCos(world.angle[slot]);
    const sinH = detSin(world.angle[slot]);
    const dx = cosH * world.rayCos[k] - sinH * world.raySin[k];
    const dy = sinH * world.rayCos[k] + cosH * world.raySin[k];
    return world.vx[slot] * dx + world.vy[slot] * dy;
}

/**
 * Notes the target's proximity for the next tick and tells whether this tick is an ambush closing: the agent is nearly
 * still (`AMBUSH_STILL`) while the nearest prey's distance shrank by more than `CLOSING_SPEED x maxVelocity` since the
 * tick before. Such a tick also counts as a turn towards the prey, which the ambusher holds still for.
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive slot
 * @param {{kind: Record<string, any>, proximity: number}} target the target view and the nearest hit's proximity
 * @returns {boolean} whether the tick is an ambush closing (prey kinds only)
 */
function ambushCloses(world, slot, { kind, proximity }) {
    const previous = kind.prox[slot];
    kind.prox[slot] = proximity;
    if (!kind.ambush || previous < 0) {
        return false;
    }
    const { maxVelocity } = world.config;
    const still = AMBUSH_STILL * maxVelocity;
    const nearlyStill = world.vx[slot] * world.vx[slot] + world.vy[slot] * world.vy[slot] <= still * still;
    const closes = nearlyStill && (proximity - previous) * visionOf(world, slot) > CLOSING_SPEED * maxVelocity;
    kind.turn[slot] = closes ? world.tick : kind.turn[slot];
    return closes;
}

/**
 * Updates one target kind for an agent from a scan row (the nearest hit's proximity at `kind.at` and ray at
 * `kind.at + 1`, -1 for none): the sighting, the closing history (a tick closes when the agent's speed towards the
 * nearest target ray is above `CLOSING_SPEED x maxVelocity`), turns towards the target and off-axis ticks. Turning
 * away from a target that `clears` empties its closing history. The observer's intent state runs this same function.
 * @param {Record<string, any>} world the world after the step
 * @param {number} slot an alive slot
 * @param {Record<string, any>} kind the food or prey target view
 * @param {Float64Array} scan the scan row
 * @returns {void}
 */
export function trackTarget(world, slot, kind, scan) {
    const { tick } = world;
    const { bits } = kind;
    if (scan[kind.at] < 0) {
        bits[slot] = (bits[slot] << 1) & 0xffff;
        kind.prox[slot] = -1;
        return;
    }
    const k = scan[kind.at + 1];
    if (tick - kind.seen[slot] > INTENT_WINDOW) {
        kind.start[slot] = tick;
    }
    kind.seen[slot] = tick;
    kind.off[slot] = k === 0 ? kind.off[slot] : tick;
    const towards = world.turnRate[slot] * turnTowards(k, world.config.rayCount);
    const limit = TURN_THRESHOLD * world.config.maxTurn;
    kind.turn[slot] = towards > limit ? tick : kind.turn[slot];
    const ambush = ambushCloses(world, slot, { kind, proximity: scan[kind.at] });
    const closes = ambush || speedAlong(world, slot, k) > CLOSING_SPEED * world.config.maxVelocity;
    bits[slot] = ((bits[slot] << 1) | (closes ? 1 : 0)) & 0xffff;
    if (kind.clears && towards < -limit) {
        bits[slot] = 0;
    }
}

/**
 * Advances the food and prey trackers of one alive agent from the world after a step. A slot born this tick
 * (`ageTicks` 0, which includes every slot at tick 0) is skipped, as the observer discards the tick it first sees
 * a newborn; call it once per tick after the agent's rays, outputs and motion are final for the tick.
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive slot
 * @returns {void}
 */
export function trackMerit(world, slot) {
    if (world.ageTicks[slot] === 0) {
        return;
    }
    scanRays(world, slot);
    trackTarget(world, slot, world.meritFood, best);
    trackTarget(world, slot, world.meritPrey, best);
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot a slot `trackMerit` has run for this tick
 * @returns {boolean} whether a meal by the slot this tick is deliberate
 */
export function mealDeliberate(world, slot) {
    return isDeliberate(world.meritFood, slot, world.tick);
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot a slot `trackMerit` has run for this tick
 * @returns {boolean} whether a bite by the slot this tick is deliberate
 */
export function biteDeliberate(world, slot) {
    return isDeliberate(world.meritPrey, slot, world.tick);
}

/**
 * Opens the escape episode of a slot bitten by a `canHunt` agent; a bite inside an open episode changes nothing, so
 * the episode counts from its first bite.
 * @param {Record<string, any>} world the world
 * @param {number} slot the bitten slot
 * @returns {void}
 */
export function noteMeritBite(world, slot) {
    if (world.biteOpen[slot] === 0) {
        world.biteOpen[slot] = 1;
        world.biteFirst[slot] = world.tick;
        world.biteResponded[slot] = 0;
    }
}

/**
 * Advances the escape episode of one alive slot: a speed above `FLEE_SPEED x maxVelocity` within `RESPONSE_WINDOW`
 * ticks of the first bite counts as a response, and `ESCAPE_TICKS` after the first bite the episode ends.
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive slot
 * @returns {boolean} true on the tick an episode ends with the slot alive and having responded: an escape
 */
export function resolveEscape(world, slot) {
    if (world.biteOpen[slot] === 0) {
        return false;
    }
    const age = world.tick - world.biteFirst[slot];
    const limit = FLEE_SPEED * world.config.maxVelocity;
    if (age <= RESPONSE_WINDOW && world.vx[slot] * world.vx[slot] + world.vy[slot] * world.vy[slot] > limit * limit) {
        world.biteResponded[slot] = 1;
    }
    if (age < ESCAPE_TICKS) {
        return false;
    }
    world.biteOpen[slot] = 0;
    return world.biteResponded[slot] === 1;
}
