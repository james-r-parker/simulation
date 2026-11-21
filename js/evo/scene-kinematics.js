// Chase kinematics detectors (chase-physics.md, Detectors): tracks overshoot rate, refuge/cover-zone use in
// prey-evaded chases, and tick-to-tick turn sign reversals inside active approaches (`scene-approach.js`).
// Observer state only; zero per-tick allocations.

import { OUTPUT_COUNT, OUTPUT_INDEX } from '../sim/brain-layout.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { none, ok } from './metrics-stats.js';
import { CHASE_FLAG, CHASE_OUTCOME, chasesEvaded, chasesFlagged } from './chase-outcome.js';
import { findAlive } from './observer-intent.js';
import { refugeCentres, ringDistance } from './scene-terrain.js';

const OVERSHOOT_SCALE = 1.25;
const OVERSHOOT_MIN_DELTA_SQ = 100;
const TURN_EPS = 1e-6;
const NO_CHASES = 'no resolved chase after burn-in';
const NO_EVADED = 'no evaded chase after burn-in';
const NO_TURN_PAIRS = 'no active chase turn samples after burn-in';

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} empty chase-kinematics scene state
 */
export function createKinematicsScene(config) {
    const n = config.maxAgents;
    return {
        minDistSq: new Float64Array(n).fill(Infinity),
        overshot: new Uint8Array(n),
        coverUsed: new Uint8Array(n),
        prevTurnSign: new Int8Array(n),
        hasTurnSample: new Uint8Array(n),
        turnReversals: new Uint32Array(n),
        turnPairs: new Uint32Array(n),
        totalTurnReversals: 0,
        totalTurnPairs: 0,
    };
}

/**
 * Clears per-slot chase kinematics accumulators.
 * @param {Record<string, any>} scene the kinematics scene
 * @param {number} slot the hunter slot
 * @returns {void}
 */
export function resetKinematicsSlot(scene, slot) {
    scene.minDistSq[slot] = Infinity;
    scene.overshot[slot] = 0;
    scene.coverUsed[slot] = 0;
    scene.prevTurnSign[slot] = 0;
    scene.hasTurnSample[slot] = 0;
    scene.turnReversals[slot] = 0;
    scene.turnPairs[slot] = 0;
}

/** @param {Record<string, any>} scene @param {Record<string, any>} world @param {number} slot */
function noteTurnJitter(scene, world, slot) {
    const turn = world.turnRate ? world.turnRate[slot] : world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.TURN];
    const sign = turn > TURN_EPS ? 1 : turn < -TURN_EPS ? -1 : 0;
    if (scene.hasTurnSample[slot] === 1) {
        scene.turnPairs[slot] += 1;
        if (sign !== 0 && scene.prevTurnSign[slot] !== 0 && sign !== scene.prevTurnSign[slot]) {
            scene.turnReversals[slot] += 1;
        }
    }
    if (sign !== 0) {
        scene.prevTurnSign[slot] = sign;
    }
    scene.hasTurnSample[slot] = 1;
}

/** @param {Record<string, any>} scene @param {Record<string, any>} observer @param {Record<string, any>} world @param {number} slot */
function noteRangeAndCover(scene, observer, world, slot) {
    const { approach, terrain } = observer.scenes;
    const victim = findAlive(world, observer.slotOf, approach.victim[slot]);
    if (victim < 0) {
        return;
    }
    const dx = world.x[victim] - world.x[slot];
    const dy = world.y[victim] - world.y[slot];
    const d2 = dx * dx + dy * dy;
    if (d2 < scene.minDistSq[slot]) {
        scene.minDistSq[slot] = d2;
    } else if (d2 > scene.minDistSq[slot] * OVERSHOOT_SCALE * OVERSHOOT_SCALE + OVERSHOOT_MIN_DELTA_SQ) {
        scene.overshot[slot] = 1;
    }
    if (
        refugeCentres(terrain, world).length > 0 &&
        ringDistance(terrain, world, world.x[victim], world.y[victim]) === 0
    ) {
        scene.coverUsed[slot] = 1;
    }
}

/**
 * Updates per-slot turn jitter, minimum range / overshoot, and prey cover use for active approaches.
 * @param {Record<string, any>} scene the kinematics scene
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function tickKinematics(scene, observer, world) {
    if (world.tick < BURN_IN_TICKS) {
        return;
    }
    const { alive } = world;
    const { approach } = observer.scenes;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] !== 1 || approach.phase[slot] === 0) {
            if (scene.hasTurnSample[slot] !== 0 || scene.minDistSq[slot] !== Infinity) {
                resetKinematicsSlot(scene, slot);
            }
            continue;
        }
        noteTurnJitter(scene, world, slot);
        noteRangeAndCover(scene, observer, world, slot);
    }
}

/**
 * Flags a resolved chase that overshot or crossed cover on its record (`chase-outcome.js`) and commits its turn-jitter
 * totals. The record's tally holds the chase counts; the flags are set on every chase, and the metrics read them over
 * the chases that were not caught.
 * @param {Record<string, any>} scene the kinematics scene
 * @param {Record<string, any>} world the world
 * @param {{slot: number, outcome: number, flags: number}} chase the resolved chase, its `flags` updated in place
 * @returns {void}
 */
export function noteKinematicsChase(scene, world, chase) {
    if (world.tick < BURN_IN_TICKS) {
        resetKinematicsSlot(scene, chase.slot);
        return;
    }
    const s = chase.slot;
    if (scene.overshot[s] === 1) {
        chase.flags |= CHASE_FLAG.OVERSHOT;
    }
    if (scene.coverUsed[s] === 1) {
        chase.flags |= CHASE_FLAG.CROSSED_COVER;
    }
    scene.totalTurnReversals += scene.turnReversals[s];
    scene.totalTurnPairs += scene.turnPairs[s];
    resetKinematicsSlot(scene, s);
}

/**
 * @param {Record<string, any>} scene the kinematics scene
 * @param {import('./chase-outcome.js').ChaseTally} tally the approach scene's tally of chase records
 * @returns {import('./metrics-stats.js').MetricRecord} the three chase-kinematics metrics
 */
export function kinematicsMetrics(scene, tally) {
    const evaded = chasesEvaded(tally);
    const notCaught = [CHASE_OUTCOME.ESCAPED, CHASE_OUTCOME.GAVE_UP];
    return {
        'eval.chase_overshoot_share':
            tally.total === 0
                ? none(NO_CHASES)
                : ok(chasesFlagged(tally, CHASE_FLAG.OVERSHOT, notCaught) / tally.total),
        'eval.chase_cover_use_share':
            evaded === 0 ? none(NO_EVADED) : ok(chasesFlagged(tally, CHASE_FLAG.CROSSED_COVER, notCaught) / evaded),
        'eval.chase_turn_jitter':
            scene.totalTurnPairs === 0 ? none(NO_TURN_PAIRS) : ok(scene.totalTurnReversals / scene.totalTurnPairs),
    };
}

/** @type {import('./observer-detectors.js').Detector} */
export const kinematicsDetector = {
    name: 'kinematics',
    modules: ['js/evo/scene-kinematics.js'],
    create: (config) => createKinematicsScene(config),
    onSlotFree: resetKinematicsSlot,
    onTick: (scene, world, observer) => tickKinematics(scene, observer, world),
    metrics: (scene, world, observer) => kinematicsMetrics(scene, observer.scenes.approach.tally),
};
