// Stillness detectors (stillness.md, Phase 1). Observer-only state; no world arrays or RNG are changed.

import { BURN_IN_TICKS } from './burn-in.js';
import { CHASE_OUTCOME } from './chase-outcome.js';
import { none, ok } from './metrics-stats.js';
import { RING_SPEED } from './style.js';

export const AMBUSH_STILL_TICKS = 60;

const NO_PAIRED_PREY = 'no prey sampled both current-threat and calm ticks after burn-in';
const NO_COMPLETED_EPISODES = 'no completed episodes in both still and moving groups after burn-in';
const NO_CAUGHT_APPROACHES = 'no caught approaches after burn-in';

/** @param {Readonly<Record<string, any>>} config @returns {Record<string, any>} empty stillness scene */
export function createStillnessScene(config) {
    const n = config.maxAgents;
    return {
        limit: RING_SPEED * config.maxVelocity,
        threatTicks: new Uint32Array(n),
        threatStill: new Uint32Array(n),
        calmTicks: new Uint32Array(n),
        calmStill: new Uint32Array(n),
        freezeDifference: 0,
        freezeSamples: 0,
        activePrey: new Uint8Array(n),
        episodeOpen: new Uint8Array(n),
        episodeStill: new Uint8Array(n),
        episodeStillCount: 0,
        episodeStillSurvived: 0,
        episodeMovingCount: 0,
        episodeMovingSurvived: 0,
        stillRun: new Uint16Array(n),
        ambushAtOpen: new Uint8Array(n),
        caughtApproaches: 0,
        ambushCatches: 0,
    };
}

/** @param {Record<string, any>} scene @param {number} slot */
export function resetStillnessSlot(scene, slot) {
    scene.threatTicks[slot] = 0;
    scene.threatStill[slot] = 0;
    scene.calmTicks[slot] = 0;
    scene.calmStill[slot] = 0;
    scene.activePrey[slot] = 0;
    scene.episodeOpen[slot] = 0;
    scene.episodeStill[slot] = 0;
    scene.stillRun[slot] = 0;
    scene.ambushAtOpen[slot] = 0;
}

/** @param {Record<string, any>} scene @param {number} slot @param {number} survived */
function finishEpisode(scene, slot, survived) {
    if (scene.episodeStill[slot] === 1) {
        scene.episodeStillCount += 1;
        scene.episodeStillSurvived += survived;
    } else {
        scene.episodeMovingCount += 1;
        scene.episodeMovingSurvived += survived;
    }
    scene.episodeOpen[slot] = 0;
}

/** @param {Record<string, any>} scene @param {number} slot @param {boolean} still @param {boolean} threatened */
function recordPrey(scene, slot, still, threatened) {
    if (threatened) {
        scene.threatTicks[slot] += 1;
        scene.threatStill[slot] += still ? 1 : 0;
        if (scene.episodeOpen[slot] === 0) {
            scene.episodeOpen[slot] = 1;
            scene.episodeStill[slot] = still ? 1 : 0;
        }
    } else {
        scene.calmTicks[slot] += 1;
        scene.calmStill[slot] += still ? 1 : 0;
        if (scene.episodeOpen[slot] === 1) {
            finishEpisode(scene, slot, 1);
        }
    }
}

/** @param {Record<string, any>} scene @param {number} slot @param {boolean} still @param {number} tick */
function recordHunter(scene, slot, still, tick) {
    if (scene.approachOpenedTick[slot] === tick) {
        scene.ambushAtOpen[slot] = scene.stillRun[slot] >= AMBUSH_STILL_TICKS ? 1 : 0;
    }
    scene.stillRun[slot] = still ? Math.min(scene.stillRun[slot] + 1, AMBUSH_STILL_TICKS) : 0;
}

/** @param {Record<string, any>} scene @param {Record<string, any>} observer @param {Record<string, any>} world */
export function tickStillness(scene, observer, world) {
    const { alive, spec, vx, vy, tick } = world;
    const { hunterSpec, lastThreat } = observer.intent;
    const limitSquared = scene.limit * scene.limit;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] !== 1) {
            continue;
        }
        const still = vx[slot] * vx[slot] + vy[slot] * vy[slot] < limitSquared;
        const threatened = lastThreat[slot] === tick;
        if (tick < BURN_IN_TICKS) {
            scene.stillRun[slot] = 0;
        } else if (hunterSpec[spec[slot]] === 1) {
            recordHunter(scene, slot, still, tick);
        } else {
            scene.activePrey[slot] = 1;
            recordPrey(scene, slot, still, threatened);
        }
    }
}

/** @param {Record<string, any>} scene @param {number} slot @param {number} tick */
export function noteStillnessDeath(scene, slot, tick) {
    const threatTicks = scene.threatTicks[slot];
    const calmTicks = scene.calmTicks[slot];
    if (threatTicks > 0 && calmTicks > 0 && tick >= BURN_IN_TICKS) {
        scene.freezeDifference += scene.threatStill[slot] / threatTicks - scene.calmStill[slot] / calmTicks;
        scene.freezeSamples += 1;
    }
    if (scene.episodeOpen[slot] === 1) {
        finishEpisode(scene, slot, 0);
    }
}

/** @param {Record<string, any>} scene @param {{slot: number, outcome: number}} chase */
export function noteStillnessChase(scene, chase) {
    if (chase.outcome !== CHASE_OUTCOME.CAUGHT) {
        return;
    }
    scene.caughtApproaches += 1;
    scene.ambushCatches += scene.ambushAtOpen[chase.slot];
}

/** @param {Record<string, any>} scene */
function freezeUnderThreat(scene) {
    let difference = scene.freezeDifference;
    let samples = scene.freezeSamples;
    for (let slot = 0; slot < scene.activePrey.length; slot++) {
        if (scene.activePrey[slot] !== 1) {
            continue;
        }
        const threat = scene.threatTicks[slot];
        const calm = scene.calmTicks[slot];
        if (threat > 0 && calm > 0) {
            difference += scene.threatStill[slot] / threat - scene.calmStill[slot] / calm;
            samples += 1;
        }
    }
    return samples === 0 ? none(NO_PAIRED_PREY) : ok(difference / samples);
}

/** @param {Record<string, any>} scene */
function freezeSurvivalGain(scene) {
    if (scene.episodeStillCount === 0 || scene.episodeMovingCount === 0) {
        return none(NO_COMPLETED_EPISODES);
    }
    return ok(
        scene.episodeStillSurvived / scene.episodeStillCount - scene.episodeMovingSurvived / scene.episodeMovingCount,
    );
}

/** @param {Record<string, any>} scene */
export function stillnessMetrics(scene) {
    return {
        'eval.freeze_under_threat': freezeUnderThreat(scene),
        'eval.freeze_survival_gain': freezeSurvivalGain(scene),
        'eval.ambush_kill_share':
            scene.caughtApproaches === 0
                ? none(NO_CAUGHT_APPROACHES)
                : ok(scene.ambushCatches / scene.caughtApproaches),
    };
}
