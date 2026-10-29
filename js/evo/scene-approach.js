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

import { popcount16 } from '../sim/merit-state.js';
import { none, ok } from './metrics-stats.js';
import { BURN_IN_TICKS } from './observer-events.js';
import { CLOSING_BITS, CLOSING_MIN, INTENT_WINDOW } from './observer-intent-state.js';
import { BITTEN_THIS_TICK } from './observer-intent-episode.js';
import { findAlive } from './observer-intent.js';

const IDLE = 0;
const OPEN = 1;
const BITTEN = 2;
const CLOSING_MASK = (1 << CLOSING_BITS) - 1;

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} an empty scene: per slot the phase, last closing tick, victim and bite tick, and the
 *   counts of committed, aborted, caught and escaped approaches
 */
export function createApproachScene(config) {
    const n = config.maxAgents;
    return {
        phase: new Uint8Array(n),
        lastClosing: new Float64Array(n),
        victim: new Uint32Array(n),
        biteTick: new Float64Array(n),
        committed: 0,
        aborted: 0,
        caught: 0,
        escaped: 0,
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
    scene.caught += counted ? 1 : 0;
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
        if (biter >= 0 && scene.phase[biter] === OPEN) {
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
function advance(scene, observer, world, slot) {
    const { tick } = world;
    if (scene.phase[slot] === BITTEN) {
        if (tick - scene.biteTick[slot] >= INTENT_WINDOW) {
            const lives = findAlive(world, observer.slotOf, scene.victim[slot]) >= 0;
            scene.escaped += lives && tick >= BURN_IN_TICKS ? 1 : 0;
            scene.phase[slot] = IDLE;
        }
    } else if (closingNow(observer.intent.prey, slot, tick)) {
        scene.phase[slot] = OPEN;
        scene.lastClosing[slot] = tick;
    } else if (scene.phase[slot] === OPEN && tick - scene.lastClosing[slot] > INTENT_WINDOW) {
        scene.aborted += tick >= BURN_IN_TICKS ? 1 : 0;
        scene.phase[slot] = IDLE;
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
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the abort rate and the three chase shares
 */
export function approachMetrics(scene) {
    const ended = scene.committed + scene.aborted;
    const chases = scene.caught + scene.escaped + scene.aborted;
    const noApproach = none('no hunter approach ended after burn-in');
    const noChase = none('no chase resolved after burn-in');
    return {
        'eval.hunt_abort_rate': ended > 0 ? ok(scene.aborted / ended) : noApproach,
        'eval.chase_catch_share': chases > 0 ? ok(scene.caught / chases) : noChase,
        'eval.chase_escape_share': chases > 0 ? ok(scene.escaped / chases) : noChase,
        'eval.chase_giveup_share': chases > 0 ? ok(scene.aborted / chases) : noChase,
    };
}
