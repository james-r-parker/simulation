// Mating, pregnancies, splits and child placement.

import { OUTPUT_COUNT } from './brain-layout.js';
import { detCos, detSin } from './det-math.js';
import { LOSS_CAUSE, removeEnergy, transferEnergy } from './energy.js';
import { BLOCKED_CAUSE, BORN_CAUSE, EVENT_TYPE, pushEvent } from './events.js';
import { nextFloat } from './rng.js';
import { specParams } from './spec-params.js';
import { TIMER_CAP, allocAgent } from './world.js';

/** @typedef {import('./world.js').World} World */

/**
 * @typedef {object} BirthPolicy
 * @property {(world: World, mother: number, father: number) => void} [onMate] called after a mating starts a pregnancy
 * @property {(world: World, child: number, mother: number, options: {cause: number, rng: import('./rng.js').Rng}) => void} childBrain
 *   writes the child's weights row
 */

const TWO_PI = 6.283185307179586;
const PI = 3.141592653589793;
const MATE_OUT = 3;

/**
 * @param {World} world the world
 * @param {number} slot an alive agent
 * @returns {boolean} true when mature, not pregnant, off cooldown and above `mateMinEnergy`
 */
export function isReadyToMate(world, slot) {
    const { maturityTicks, mateMinEnergy } = world.config;
    return (
        world.ageTicks[slot] >= maturityTicks &&
        world.pregnancy[slot] === 0 &&
        world.cooldown[slot] === 0 &&
        world.energy[slot] > mateMinEnergy
    );
}

/**
 * @param {World} world the world
 * @param {number} slot an alive agent
 * @returns {boolean} true when ready to mate and the brain wants to
 */
function readyToMate(world, slot) {
    return isReadyToMate(world, slot) && world.outputs[slot * OUTPUT_COUNT + MATE_OUT] > 0;
}

/**
 * @param {World} world the world
 * @param {number} a an agent slot
 * @param {number} b another agent slot
 * @returns {boolean} true when both are ready, share a specialisation and their sizes are within `huntSizeRatio`
 */
function canMatePair(world, a, b) {
    if (world.spec[a] !== world.spec[b] || !readyToMate(world, a) || !readyToMate(world, b)) {
        return false;
    }
    const ratio = world.size[a] / world.size[b];
    const limit = world.config.huntSizeRatio;
    return ratio <= limit && ratio >= 1 / limit;
}

/**
 * @param {World} world the world
 * @param {number} slot the agent
 * @param {number} multiplier extra cooldown factor, applied after the specialisation's
 * @returns {number} the cooldown in ticks, rounded down
 */
function cooldownFor(world, slot, multiplier) {
    const { reproductionCooldown } = world.config;
    return Math.floor(
        reproductionCooldown * specParams(world.config, world.spec[slot]).cooldownMultiplier * multiplier,
    );
}

/**
 * Charges both parents, starts their cooldowns and makes the lower slot pregnant by the higher.
 * @param {World} world the world
 * @param {BirthPolicy} policy the policy
 * @param {number} mother the lower slot
 * @param {number} father the higher slot
 * @returns {void}
 */
function startMating(world, policy, mother, father) {
    const { mateCost, pregnancyTicks } = world.config;
    const count = world.layout.weightCount;
    removeEnergy(world, mother, mateCost, LOSS_CAUSE.COST);
    removeEnergy(world, father, mateCost, LOSS_CAUSE.COST);
    world.cooldown[mother] = cooldownFor(world, mother, 1);
    world.cooldown[father] = cooldownFor(world, father, 1);
    const { weights, fatherWeights } = world;
    const from = father * count;
    const to = mother * count;
    for (let i = 0; i < count; i++) {
        fatherWeights[to + i] = weights[from + i];
    }
    world.fatherId[mother] = world.genomeId[father];
    world.fatherLineage[mother] = world.lineageId[father];
    world.pregnancy[mother] = pregnancyTicks;
    if (policy.onMate) {
        policy.onMate(world, mother, father);
    }
}

/**
 * Walks the contact list in order and starts a pregnancy for each eligible pair that wins the lifecycle draw.
 * @param {World} world the world
 * @param {BirthPolicy} policy the policy
 * @returns {void}
 */
export function mate(world, policy) {
    const { contacts, contactCount } = world;
    const { reproductionBonus } = world.config.seasons[world.season[0]];
    const chance = Math.min(1, reproductionBonus / world.config.mateChanceScale);
    for (let i = 0; i < contactCount; i++) {
        const a = Math.min(contacts[2 * i], contacts[2 * i + 1]);
        const b = Math.max(contacts[2 * i], contacts[2 * i + 1]);
        if (canMatePair(world, a, b) && nextFloat(world.rng.lifecycle) < chance) {
            startMating(world, policy, a, b);
        }
    }
}

/**
 * @param {World} world the world
 * @param {number} mother the parent slot
 * @param {number} cause a `BLOCKED_CAUSE`
 * @returns {void}
 */
function pushBlocked(world, mother, cause) {
    const o = pushEvent(world.events, EVENT_TYPE.BIRTH_BLOCKED, world.tick);
    world.events.data[o + 2] = mother;
    world.events.data[o + 3] = cause;
}

/**
 * Sets the child's centre touching its mother's, along a `lifecycle` angle and clamped inside the world.
 * @param {World} world the world
 * @param {number} child the child slot
 * @param {number} mother the mother slot
 * @returns {void}
 */
function placeChild(world, child, mother) {
    const { worldWidth, worldHeight } = world.config;
    const theta = nextFloat(world.rng.lifecycle) * TWO_PI;
    const rc = world.size[child];
    const reach = world.size[mother] + rc;
    world.x[child] = Math.min(worldWidth - rc, Math.max(rc, world.x[mother] + reach * detCos(theta)));
    world.y[child] = Math.min(worldHeight - rc, Math.max(rc, world.y[mother] + reach * detSin(theta)));
    world.angle[child] = theta - PI;
    world.vx[child] = 0;
    world.vy[child] = 0;
    world.ateTimer[child] = TIMER_CAP;
    world.bittenTimer[child] = TIMER_CAP;
}

/**
 * Allocates a child of `mother`, runs the brain hook, moves its energy in, places it and pushes `AgentBorn`.
 * A mating birth needs more energy than `childEnergy`; a split gives half the mother's energy. Either needs a free slot.
 * @param {World} world the world
 * @param {BirthPolicy} policy the policy
 * @param {number} mother the mother or splitter
 * @param {number} cause `BORN_CAUSE.MATE` or `BORN_CAUSE.SPLIT`
 * @returns {number} the child slot, or -1 when the birth was blocked
 */
function giveBirth(world, policy, mother, cause) {
    const { maxAgents, childEnergy } = world.config;
    const isMate = cause === BORN_CAUSE.MATE;
    if (world.population >= maxAgents) {
        pushBlocked(world, mother, BLOCKED_CAUSE.CAPACITY);
        return -1;
    }
    if (isMate && !(world.energy[mother] > childEnergy)) {
        pushBlocked(world, mother, BLOCKED_CAUSE.ENERGY);
        return -1;
    }
    const gift = isMate ? childEnergy : world.energy[mother] / 2;
    const child = allocAgent(world);
    world.genomeId[child] = world.nextId++;
    world.lineageId[child] = world.lineageId[mother];
    world.parentA[child] = world.genomeId[mother];
    world.parentB[child] = isMate ? world.fatherId[mother] : world.genomeId[mother];
    world.spec[child] = world.spec[mother];
    world.birthOptions.cause = cause;
    world.birthOptions.rng = world.rng.mutation;
    policy.childBrain(world, child, mother, world.birthOptions);
    transferEnergy(world, mother, child, gift);
    placeChild(world, child, mother);
    const o = pushEvent(world.events, EVENT_TYPE.AGENT_BORN, world.tick);
    const d = world.events.data;
    d[o + 2] = child;
    d[o + 3] = world.genomeId[child];
    d[o + 4] = world.lineageId[child];
    d[o + 5] = world.spec[child];
    d[o + 6] = world.parentA[child];
    d[o + 7] = world.parentB[child];
    d[o + 8] = cause;
    return child;
}

/**
 * Counts every pregnancy down and attempts the birth of each that reaches 0.
 * @param {World} world the world
 * @param {BirthPolicy} policy the policy
 * @returns {void}
 */
export function advancePregnancies(world, policy) {
    const { alive, pregnancy } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1 && pregnancy[slot] > 0) {
            pregnancy[slot] -= 1;
            if (pregnancy[slot] === 0) {
                giveBirth(world, policy, slot, BORN_CAUSE.MATE);
            }
        }
    }
}

/**
 * Splits every mature, rested, not pregnant agent above `splitMinEnergy` in two.
 * @param {World} world the world
 * @param {BirthPolicy} policy the policy
 * @returns {void}
 */
export function splitAll(world, policy) {
    const { alive } = world;
    const { maturityTicks, splitMinEnergy, splitCooldownMultiplier } = world.config;
    for (let slot = 0; slot < alive.length; slot++) {
        const ready =
            alive[slot] === 1 &&
            world.ageTicks[slot] >= maturityTicks &&
            world.pregnancy[slot] === 0 &&
            world.cooldown[slot] === 0 &&
            world.energy[slot] > splitMinEnergy;
        if (ready && giveBirth(world, policy, slot, BORN_CAUSE.SPLIT) >= 0) {
            world.cooldown[slot] = cooldownFor(world, slot, splitCooldownMultiplier);
        }
    }
}
