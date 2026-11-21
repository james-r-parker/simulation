// Sprint detectors (sprint-burst.md, Phase 1). Observer-only counters; no sim state or per-tick allocations.

import { sprintEffort } from '../sim/sprint-store.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { SCAN, SCAN_SIZE } from './ray-summary.js';
import { none, ok } from './metrics-stats.js';

const NO_ROLE_TICKS = 'no agent-ticks for this role after burn-in';
const NO_CHASE_TICKS = 'no chase and non-chase hunter-ticks after burn-in';
const NO_THREAT_TICKS = 'no threat and calm prey-ticks after burn-in';
const NO_ENERGY_SPENT = 'no energy removed from agents after burn-in';

/** @param {Readonly<Record<string, any>>} config @returns {Record<string, any>} empty sprint scene */
export function createSprintScene(config) {
    return {
        juvenileTicks: config.juvenileTicks,
        juvenileBurn: config.juvenileBurn,
        sprintCost: config.sprintCost,
        lastEnergyLoss: 0,
        hunterTicks: 0,
        hunterSprints: 0,
        preyTicks: 0,
        preySprints: 0,
        chaseTicks: 0,
        chaseSprints: 0,
        calmHunterTicks: 0,
        calmHunterSprints: 0,
        threatPreyTicks: 0,
        threatPreySprints: 0,
        calmPreyTicks: 0,
        calmPreySprints: 0,
        nominalSprintCharge: 0,
        energyRemoved: 0,
    };
}

// A sprinting tick counts by its effort (`sprintEffort`, fair-chase T7a): 0 or 1 with the store off, as before, and the
// graded effort with the store on, so a half sprint is half a sprinting tick.

/** @param {Record<string, any>} scene @param {Record<string, any>} approach @param {number} slot @param {number} effort */
function tickHunter(scene, approach, slot, effort) {
    scene.hunterTicks += 1;
    scene.hunterSprints += effort;
    if (approach.phase[slot] !== 0) {
        scene.chaseTicks += 1;
        scene.chaseSprints += effort;
        return;
    }
    scene.calmHunterTicks += 1;
    scene.calmHunterSprints += effort;
}

/** @param {Record<string, any>} scene @param {boolean} threatened @param {number} effort */
function tickPrey(scene, threatened, effort) {
    scene.preyTicks += 1;
    scene.preySprints += effort;
    if (threatened) {
        scene.threatPreyTicks += 1;
        scene.threatPreySprints += effort;
        return;
    }
    scene.calmPreyTicks += 1;
    scene.calmPreySprints += effort;
}

/** @param {Record<string, any>} scene @param {Record<string, any>} world @param {number} slot @param {{hunter: boolean, effort: number}} flags */
function noteSprintEnergy(scene, world, slot, { hunter, effort }) {
    if (effort === 0) {
        return;
    }
    const burn = hunter && world.ageTicks[slot] < scene.juvenileTicks ? scene.juvenileBurn : 1;
    scene.nominalSprintCharge += scene.sprintCost * burn * effort;
}

/** @param {Record<string, any>} scene @param {Record<string, any>} observer @param {Record<string, any>} world */
export function tickSprint(scene, observer, world) {
    const loss = world.ledger[1];
    const lostThisTick = loss - scene.lastEnergyLoss;
    scene.lastEnergyLoss = loss;
    if (world.tick < BURN_IN_TICKS) {
        return;
    }
    scene.energyRemoved += lostThisTick;
    const { alive, huntBySpec, spec } = world;
    const { intent, scenes } = observer;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] !== 1) {
            continue;
        }
        const effort = sprintEffort(world, slot);
        const hunter = huntBySpec[spec[slot]] === 1;
        const threatened = intent.scan[slot * SCAN_SIZE + SCAN.THREAT] >= 0;
        if (hunter) {
            tickHunter(scene, scenes.approach, slot, effort);
        } else {
            tickPrey(scene, threatened, effort);
        }
        noteSprintEnergy(scene, world, slot, { hunter, effort });
    }
}

/** @param {number} sprints @param {number} ticks @param {string} reason */
function share(sprints, ticks, reason) {
    return ticks === 0 ? none(reason) : ok(sprints / ticks);
}

/** @param {{sprints: number, ticks: number}} on @param {{sprints: number, ticks: number}} off @param {string} reason */
function lift(on, off, reason) {
    if (on.ticks === 0 || off.ticks === 0 || off.sprints === 0) {
        return none(reason);
    }
    return ok(on.sprints / on.ticks / (off.sprints / off.ticks));
}

/** @param {Record<string, any>} scene @returns {import('./metrics-stats.js').MetricRecord} */
export function sprintMetrics(scene) {
    return {
        'eval.sprint_share.hunter': share(scene.hunterSprints, scene.hunterTicks, NO_ROLE_TICKS),
        'eval.sprint_share.prey': share(scene.preySprints, scene.preyTicks, NO_ROLE_TICKS),
        'eval.chase_sprint_lift': lift(
            { sprints: scene.chaseSprints, ticks: scene.chaseTicks },
            { sprints: scene.calmHunterSprints, ticks: scene.calmHunterTicks },
            NO_CHASE_TICKS,
        ),
        'eval.flee_sprint_lift': lift(
            { sprints: scene.threatPreySprints, ticks: scene.threatPreyTicks },
            { sprints: scene.calmPreySprints, ticks: scene.calmPreyTicks },
            NO_THREAT_TICKS,
        ),
        'eval.sprint_cost_share':
            scene.energyRemoved === 0 ? none(NO_ENERGY_SPENT) : ok(scene.nominalSprintCharge / scene.energyRemoved),
    };
}

/** @type {import('./observer-detectors.js').Detector} */
export const sprintDetector = {
    name: 'sprint',
    modules: ['js/evo/scene-sprint.js'],
    create: (config) => createSprintScene(config),
    onTick: (scene, world, observer) => tickSprint(scene, observer, world),
    metrics: (scene) => sprintMetrics(scene),
};
