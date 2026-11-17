// Abort and a real chase (natural-selection.md, Detectors). An approach opens when the intent tracker sees a hunter
// close on prey (`CLOSING_MIN` of the last `CLOSING_BITS` ticks with a current sighting). It ends in a bite
// (committed) or lapses when no tick has closed for `INTENT_WINDOW` ticks (aborted).
//
// - `eval.hunt_abort_rate`: aborted over committed plus aborted.
// - `eval.chase_catch_share`, `eval.chase_escape_share`, `eval.chase_giveup_share`: the same approaches from the first
//   closing sighting. A kill ends in a catch; a victim alive `INTENT_WINDOW` ticks after the first bite is an escape;
//   a lapse is a give-up. The three sum to 1. A victim that dies of something else inside the window is dropped.
//
// Counts come from approaches that end at or after `BURN_IN_TICKS`. Per slot state only; nothing is allocated.
//
// Each chase counted here (a catch, an escape or a give-up, never a dropped one) is also handed to the scene's `onChase` hook
// with the hunter's slot, its outcome and the tick the chase opened (hunter-learning.md T2a: `scene-competence.js` bins it by
// the hunter's age at the opening) and whether it could eat then (`canEatNow` at the opening tick) and its energy then (`scene-matched.js` strata).

import { canEatNow } from '../sim/feeding.js';
import { popcount16 } from '../sim/merit-state.js';
import { none, ok } from './metrics-stats.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { CLOSING_BITS, CLOSING_MIN, INTENT_WINDOW } from './observer-intent-state.js';
import { CHASE_OUTCOME, chasesEnded, createChaseTally, tallyChase } from './chase-outcome.js';
import { notePreySight, scentChaseFlags } from './scene-scent.js';
import { BITTEN_THIS_TICK } from './observer-intent-episode.js';
import { findAlive } from './observer-intent.js';
import { createLapseScene, lapseFlags, noteChaseLength, noteClosingProximity } from './scene-chase-lapse.js';

const IDLE = 0;
const OPEN = 1;
const BITTEN = 2;
const CLOSING_MASK = (1 << CLOSING_BITS) - 1;

/**
 * @typedef {(world: Record<string, any>, chase: {slot: number, outcome: number, flags: number, openedTick: number, hungry: boolean, energy: number}) => void} ChaseHook
 *   called once for each counted chase with the hunter's slot, its `CHASE_OUTCOME`, its `CHASE_FLAG` bits (a hook may add its own), the tick the chase opened, whether the
 *   hunter could eat (`canEatNow`) at that tick and its energy then
 */

/**
 * @typedef {(world: Record<string, any>, biter: number) => void} BiteHook called with the slot of the alive biter of each
 *   bite landed on a live victim this tick, whatever the biter's approach
 */

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @param {{onChase?: ChaseHook | null, onBite?: BiteHook | null}} [hooks] the hook told of each counted chase, and the hook told
 *   of each bite by an alive biter
 * @returns {Record<string, any>} an empty scene: per slot the phase, last closing tick, tick the chase opened, victim and
 *   bite tick, the count of committed approaches and the tally of resolved chases (`chase-outcome.js`)
 */
export function createApproachScene(config, { onChase = null, onBite = null } = {}) {
    const n = config.maxAgents;
    return {
        onChase,
        onBite,
        phase: new Uint8Array(n),
        lastClosing: new Float64Array(n),
        openedTick: new Float64Array(n),
        openedHungry: new Uint8Array(n),
        openedEnergy: new Float64Array(n),
        victim: new Uint32Array(n),
        biteTick: new Float64Array(n),
        resolvedTick: new Float64Array(n).fill(-1),
        committed: 0,
        tally: createChaseTally(),
        lapse: createLapseScene(config),
    };
}

/**
 * Forgets a slot's approach (a birth or death in the slot).
 * @param {Record<string, any>} scene the approach scene
 * @param {number} slot the slot
 * @returns {void}
 */
export function resetApproachSlot(scene, slot) {
    scene.phase[slot] = IDLE;
    scene.resolvedTick[slot] = -1;
}

/**
 * @param {Record<string, any>} prey the intent state's prey target view
 * @param {number} slot an alive slot
 * @param {number} tick the observed tick
 * @returns {boolean} whether the hunter has a current prey sighting and closes on it (the `isDeliberate` test without
 *   the turn condition)
 */
function closingNow(prey, slot, tick) {
    return tick - prey.seen[slot] <= INTENT_WINDOW && popcount16(prey.bits[slot] & CLOSING_MASK) >= CLOSING_MIN;
}

/**
 * Whether an idle hunter opens a new approach: it is closing on a sighting newer than its last ended chase. The closing
 * bits of a chase outlive it by a few ticks, so without the second test a kill reopened an approach on the dead prey's
 * last sighting, which lapsed 30 ticks later as a give-up (metric-trust T16).
 * @param {Record<string, any>} scene the approach scene
 * @param {Record<string, any>} prey the observer's prey tracker
 * @param {number} slot the hunter
 * @param {number} tick the tick
 * @returns {boolean} whether it opens
 */
function opensNow(scene, prey, slot, tick) {
    return prey.seen[slot] > scene.resolvedTick[slot] && closingNow(prey, slot, tick);
}

/**
 * Records a resolved chase when it resolves at or after burn-in: the hook, if the scene has one, may add flags to it, then it
 * joins the tally.
 * @param {Record<string, any>} scene the approach scene
 * @param {Record<string, any>} world the world
 * @param {{slot: number, outcome: number, flags?: number}} chase the hunter's slot, the chase's `CHASE_OUTCOME` and the flags it starts with
 * @returns {void}
 */
function resolved(scene, world, { slot, outcome, flags = 0 }) {
    scene.resolvedTick[slot] = world.tick;
    if (world.tick < BURN_IN_TICKS) {
        return;
    }
    const chase = {
        slot,
        outcome,
        flags,
        openedTick: scene.openedTick[slot],
        hungry: scene.openedHungry[slot] === 1,
        energy: scene.openedEnergy[slot],
    };
    if (scene.onChase !== null) {
        scene.onChase(world, chase);
    }
    tallyChase(scene.tally, chase);
    noteChaseLength(scene.lapse, world.tick - chase.openedTick);
}

/**
 * Notes an eaten death: the killer's open approach (or the chase on that victim) ends in a catch.
 * @param {Record<string, any>} scene the approach scene
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @param {{killerId: number, victimId: number}} kill the killer's and the victim's genome ids
 * @returns {void}
 */
export function noteApproachKill(scene, observer, world, { killerId, victimId }) {
    const killer = findAlive(world, observer.slotOf, killerId);
    if (killer < 0 || scene.phase[killer] === IDLE) {
        return;
    }
    const counted = world.tick >= BURN_IN_TICKS;
    if (scene.phase[killer] === OPEN) {
        scene.committed += counted ? 1 : 0;
    } else if (scene.victim[killer] !== victimId) {
        return;
    }
    resolved(scene, world, {
        slot: killer,
        outcome: CHASE_OUTCOME.CAUGHT,
        flags: scentChaseFlags(observer.scenes?.scent, killer),
    });
    scene.phase[killer] = IDLE;
}

/**
 * Moves each approach whose hunter bit someone this tick from open to bitten.
 * @param {Record<string, any>} scene the approach scene
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
function noteBites(scene, observer, world) {
    const { alive, bittenTimer } = world;
    for (let victim = 0; victim < alive.length; victim++) {
        if (alive[victim] !== 1 || bittenTimer[victim] !== BITTEN_THIS_TICK) {
            continue;
        }
        const biter = findAlive(world, observer.slotOf, world.lastBiter[victim]);
        if (biter < 0) {
            continue;
        }
        if (scene.onBite !== null) {
            scene.onBite(world, biter);
        }
        if (scene.phase[biter] === OPEN) {
            scene.phase[biter] = BITTEN;
            scene.victim[biter] = world.genomeId[victim];
            scene.biteTick[biter] = world.tick;
            scene.committed += world.tick >= BURN_IN_TICKS ? 1 : 0;
        }
    }
}

/**
 * Advances one hunter's approach for the tick.
 * @param {Record<string, any>} scene the approach scene
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive hunter slot
 * @returns {void}
 */
/** @param {Record<string, any>} observer @param {Record<string, any>} scene @param {Record<string, any>} world @param {number} slot */
function noteVisiblePrey(observer, scene, world, slot) {
    const scent = observer.scenes?.scent;
    const sighted = observer.intent.prey.seen[slot] === world.tick;
    if (scent !== undefined && sighted && scene.phase[slot] !== IDLE) {
        notePreySight(scent, world, slot);
    }
}

/** @param {Record<string, any>} scene @param {Record<string, any>} observer @param {Record<string, any>} world @param {number} slot */
function advanceBitten(scene, observer, world, slot) {
    const scent = observer.scenes?.scent;
    if (scene.phase[slot] !== BITTEN || world.tick - scene.biteTick[slot] < INTENT_WINDOW) {
        return scene.phase[slot] === BITTEN;
    }
    const lives = findAlive(world, observer.slotOf, scene.victim[slot]) >= 0;
    scene.resolvedTick[slot] = world.tick;
    if (lives) {
        resolved(scene, world, {
            slot,
            outcome: CHASE_OUTCOME.ESCAPED,
            flags: scentChaseFlags(scent, slot),
        });
    }
    scene.phase[slot] = IDLE;
    return true;
}

/** @param {Record<string, any>} scene @param {Record<string, any>} observer @param {Record<string, any>} world @param {number} slot */
function advanceClosing(scene, observer, world, slot) {
    const { tick } = world;
    const scent = observer.scenes?.scent;
    const sighted = observer.intent.prey.seen[slot] === tick;
    const prey = observer.intent.prey;
    const closing = scene.phase[slot] === OPEN ? closingNow(prey, slot, tick) : opensNow(scene, prey, slot, tick);
    if (!closing) {
        return false;
    }
    if (scene.phase[slot] !== OPEN) {
        if (scent !== undefined) {
            scent.reacquired[slot] = 0;
            scent.lastSight[slot] = -1;
            if (sighted) {
                notePreySight(scent, world, slot);
            }
        }
        scene.openedTick[slot] = tick;
        scene.openedHungry[slot] = canEatNow(world, slot) ? 1 : 0;
        scene.openedEnergy[slot] = world.energy[slot];
    }
    scene.phase[slot] = OPEN;
    scene.lastClosing[slot] = tick;
    noteClosingProximity(scene.lapse, prey, slot);
    return true;
}

/** @param {Record<string, any>} scene @param {Record<string, any>} observer @param {Record<string, any>} world @param {number} slot */
function advanceLapse(scene, observer, world, slot) {
    const scent = observer.scenes?.scent;
    if (scene.phase[slot] !== OPEN || world.tick - scene.lastClosing[slot] <= INTENT_WINDOW) {
        return;
    }
    const flags = lapseFlags(scene.lapse, observer.intent.prey, { slot, tick: world.tick });
    resolved(scene, world, {
        slot,
        outcome: CHASE_OUTCOME.GAVE_UP,
        flags: flags | scentChaseFlags(scent, slot),
    });
    scene.phase[slot] = IDLE;
}

/** @param {Record<string, any>} scene @param {Record<string, any>} observer @param {Record<string, any>} world @param {number} slot */
function advance(scene, observer, world, slot) {
    noteVisiblePrey(observer, scene, world, slot);
    if (advanceBitten(scene, observer, world, slot)) {
        return;
    }
    if (!advanceClosing(scene, observer, world, slot)) {
        advanceLapse(scene, observer, world, slot);
    }
}

/**
 * Runs one tick: the bites first (so a bite on the tick a closing run ends still commits), then every hunter.
 * @param {Record<string, any>} scene the approach scene
 * @param {Record<string, any>} observer the observer, with its intent state current for this tick
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function trackApproaches(scene, observer, world) {
    noteBites(scene, observer, world);
    const { alive, spec } = world;
    const { hunterSpec } = observer.intent;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1 && hunterSpec[spec[slot]] === 1) {
            advance(scene, observer, world, slot);
        }
    }
}

/**
 * @param {Record<string, any>} scene the approach scene
 * @returns {import('./metrics-stats.js').MetricRecord} the abort rate and the three chase shares
 */
export function approachMetrics(scene) {
    const { tally } = scene;
    const aborted = chasesEnded(tally, CHASE_OUTCOME.GAVE_UP);
    const ended = scene.committed + aborted;
    const chases = tally.total;
    const noApproach = none('no hunter approach ended after burn-in');
    const noChase = none('no chase resolved after burn-in');
    return {
        'eval.hunt_abort_rate': ended > 0 ? ok(aborted / ended) : noApproach,
        'eval.chase_catch_share': chases > 0 ? ok(chasesEnded(tally, CHASE_OUTCOME.CAUGHT) / chases) : noChase,
        'eval.chase_escape_share': chases > 0 ? ok(chasesEnded(tally, CHASE_OUTCOME.ESCAPED) / chases) : noChase,
        'eval.chase_giveup_share': chases > 0 ? ok(aborted / chases) : noChase,
    };
}
