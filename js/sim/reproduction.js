// Mating, pregnancies, splits and child placement.

import { OUTPUT_COUNT, OUTPUT_INDEX } from './brain-layout.js';
import { detCos, detSin } from './det-math.js';
import { LOSS_CAUSE, removeEnergy, transferEnergy } from './energy.js';
import { BLOCKED_CAUSE, BORN_CAUSE, EVENT_TYPE, pushEvent } from './events.js';
import { birthBudgetSpent, recordBirth } from './birth-budget.js';
import { readyToMate } from './mate-eligibility.js';
import { childSpec } from './heritable-spec.js';
import { findMale, findMate } from './mate-search.js';
import { SEX, drawSex } from './sex.js';
import { nextFloat } from './rng.js';
import { specParams } from './spec-params.js';
import { applyGenes, childShareOf } from './traits.js';
import { TIMER_CAP, allocAgent } from './world.js';

/** @typedef {import('./world.js').World} World */

/**
 * @typedef {object} BirthPolicy
 * @property {(world: World, mother: number, father: number) => void} [onMate] called after a mating starts a pregnancy
 * @property {(world: World, child: number, mother: number, options: {cause: number, rng: import('./rng.js').Rng}) => void} childBrain
 *   writes the child's weights row
 */

/** The `SPLIT` output must exceed this for a female to split when sexes are on. */
const SPLIT_THRESHOLD = 0.5;

const TWO_PI = 6.283185307179586;
const PI = 3.141592653589793;

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
 * @param {World} world the world
 * @param {number} a a ready agent
 * @param {number} chance the probability that the chosen pair mates
 * @returns {number} the male the female `a` chooses, or -1 when `a` is a male or no choice wins the draw
 */
function femaleChoice(world, a, chance) {
    return world.sex[a] === SEX.FEMALE ? findMale(world, a, chance) : -1;
}

/**
 * Walks the alive slots in ascending order; each ready one looks for a partner with a higher slot within `mateRange`
 * and starts a pregnancy when one wins the lifecycle draw. With `sexesEnabled` only the ready females search, each
 * choosing the strongest male in reach (`findMale`) and being the mother whatever her slot. Uses the hash built this
 * tick.
 * @param {World} world the world
 * @param {BirthPolicy} policy the policy
 * @returns {void}
 */
export function mate(world, policy) {
    const { alive } = world;
    const { sexesEnabled, mateChanceScale } = world.config;
    const { reproductionBonus } = world.config.seasons[world.season[0]];
    const chance = Math.min(1, reproductionBonus / mateChanceScale);
    for (let a = 0; a < alive.length; a++) {
        if (alive[a] === 1 && readyToMate(world, a)) {
            const b = sexesEnabled ? femaleChoice(world, a, chance) : findMate(world, a, chance);
            if (b >= 0) {
                startMating(world, policy, a, b);
            }
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
    world.temperature[child] = world.config.temperatureStart;
}

/**
 * Allocates a child of `mother`, runs the brain hook, moves its energy in, places it and pushes `AgentBorn`.
 * A mating birth gives `childEnergyShare` of the mother's energy, and is blocked when that is below `childEnergyMin`;
 * a split gives half. Either needs a free slot.
 * @param {World} world the world
 * @param {BirthPolicy} policy the policy
 * @param {number} mother the mother or splitter
 * @param {number} cause `BORN_CAUSE.MATE` or `BORN_CAUSE.SPLIT`
 * @returns {number} the child slot, or -1 when the birth was blocked
 */
function giveBirth(world, policy, mother, cause) {
    const { maxAgents, childEnergyMin } = world.config;
    const isMate = cause === BORN_CAUSE.MATE;
    if (world.population >= maxAgents) {
        pushBlocked(world, mother, BLOCKED_CAUSE.CAPACITY);
        return -1;
    }
    const gift = world.energy[mother] * (isMate ? childShareOf(world, mother) : 0.5);
    if (isMate && gift < childEnergyMin) {
        pushBlocked(world, mother, BLOCKED_CAUSE.ENERGY);
        return -1;
    }
    const child = allocAgent(world);
    world.genomeId[child] = world.nextId++;
    world.lineageId[child] = world.lineageId[mother];
    world.parentA[child] = world.genomeId[mother];
    world.parentB[child] = isMate ? world.fatherId[mother] : world.genomeId[mother];
    world.spec[child] = childSpec(world, mother);
    drawSex(world, child);
    recordBirth(world, mother);
    world.birthOptions.cause = cause;
    world.birthOptions.rng = world.rng.mutation;
    policy.childBrain(world, child, mother, world.birthOptions);
    applyGenes(world, child);
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
    d[o + 9] = world.sex[child];
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
 * @param {World} world the world
 * @param {number} slot an alive agent
 * @returns {boolean} true when mature, rested, not pregnant and above `splitMinEnergy`; with `sexesEnabled` it must
 *   also be a female whose `SPLIT` output is above 0.5 and hold `splitCost` more
 */
function readyToSplit(world, slot) {
    const { maturityTicks, splitMinEnergy, sexesEnabled, splitCost } = world.config;
    const basic =
        world.ageTicks[slot] >= maturityTicks &&
        world.pregnancy[slot] === 0 &&
        world.cooldown[slot] === 0 &&
        world.energy[slot] > splitMinEnergy;
    if (!basic || birthBudgetSpent(world, slot)) {
        return false;
    }
    if (!sexesEnabled) {
        return true;
    }
    return (
        world.sex[slot] === SEX.FEMALE &&
        world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.SPLIT] > SPLIT_THRESHOLD &&
        world.energy[slot] > splitMinEnergy + splitCost
    );
}

/**
 * Splits every agent that `readyToSplit` in two. With `sexesEnabled` the splitter first pays `splitCost` (not when the
 * world is full, where the birth is blocked), then gives half of what is left.
 * @param {World} world the world
 * @param {BirthPolicy} policy the policy
 * @returns {void}
 */
export function splitAll(world, policy) {
    const { alive } = world;
    const { splitCooldownMultiplier, sexesEnabled, splitCost, maxAgents } = world.config;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1 && readyToSplit(world, slot)) {
            if (sexesEnabled && world.population < maxAgents) {
                removeEnergy(world, slot, splitCost, LOSS_CAUSE.COST);
            }
            if (giveBirth(world, policy, slot, BORN_CAUSE.SPLIT) >= 0) {
                world.cooldown[slot] = cooldownFor(world, slot, splitCooldownMultiplier);
            }
        }
    }
}
