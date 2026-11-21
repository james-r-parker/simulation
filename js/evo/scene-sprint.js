// Sprint detectors (sprint-burst.md, Phase 1). Observer-only counters; no sim state or per-tick allocations.

import { OUTPUT_COUNT, OUTPUT_INDEX } from '../sim/brain-layout.js';
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

/** @param {Record<string, any>} scene @param {Record<string, any>} approach @param {number} slot @param {boolean} sprinting */
function tickHunter(scene, approach, slot, sprinting) {
    scene.hunterTicks += 1;
    if (sprinting) {
        scene.hunterSprints += 1;
    }
    if (approach.phase[slot] !== 0) {
        scene.chaseTicks += 1;
        if (sprinting) {
            scene.chaseSprints += 1;
        }
        return;
    }
    scene.calmHunterTicks += 1;
    if (sprinting) {
        scene.calmHunterSprints += 1;
    }
}

/** @param {Record<string, any>} scene @param {boolean} threatened @param {boolean} sprinting */
function tickPrey(scene, threatened, sprinting) {
    scene.preyTicks += 1;
    if (sprinting) {
        scene.preySprints += 1;
    }
    if (threatened) {
        scene.threatPreyTicks += 1;
        if (sprinting) {
            scene.threatPreySprints += 1;
        }
        return;
    }
    scene.calmPreyTicks += 1;
    if (sprinting) {
        scene.calmPreySprints += 1;
    }
}

/** @param {Record<string, any>} scene @param {Record<string, any>} world @param {number} slot @param {{hunter: boolean, sprinting: boolean}} flags */
function noteSprintEnergy(scene, world, slot, { hunter, sprinting }) {
    if (!sprinting) {
        return;
    }
    const burn = hunter && world.ageTicks[slot] < scene.juvenileTicks ? scene.juvenileBurn : 1;
    scene.nominalSprintCharge += scene.sprintCost * burn;
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
    const { alive, huntBySpec, outputs, spec } = world;
    const { intent, scenes } = observer;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] !== 1) {
            continue;
        }
        const sprinting = outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.SPRINT] > 0;
        const hunter = huntBySpec[spec[slot]] === 1;
        const threatened = intent.scan[slot * SCAN_SIZE + SCAN.THREAT] >= 0;
        if (hunter) {
            tickHunter(scene, scenes.approach, slot, sprinting);
        } else {
            tickPrey(scene, threatened, sprinting);
        }
        noteSprintEnergy(scene, world, slot, { hunter, sprinting });
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
