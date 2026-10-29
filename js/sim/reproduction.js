// Mating, pregnancies, splits and child placement.

import { detCos, detSin } from './det-math.js';
import { LOSS_CAUSE, removeEnergy, transferEnergy } from './energy.js';
import { BLOCKED_CAUSE, BORN_CAUSE, EVENT_TYPE, pushEvent } from './events.js';
import { birthBudgetSpent, recordBirth } from './birth-budget.js';
import { meritCapOn, pickBest, stampKeys } from './birth-cap.js';
import { readyToMate } from './mate-eligibility.js';
import { childSpec } from './heritable-spec.js';
import { findMale } from './mate-search.js';
import { creditMating, meritPeek } from './merit.js';
import { SEX, drawSex } from './sex.js';
import { nextFloat } from './rng.js';
import { specParams } from './spec-params.js';
import { applyGenes, childShareOf } from './traits.js';
import { slotOfGenome } from './merit-state.js';
import { noteSplit, splitKeysAllow } from './split-gate.js';
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
    if (world.config.meritEnabled) {
        creditMating(world, mother);
        creditMating(world, father);
    }
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
 * and starts a pregnancy when one wins the lifecycle draw. Only the ready females search, each
 * choosing the strongest male in reach (`findMale`) and being the mother whatever her slot. Uses the hash built this
 * tick.
 * @param {World} world the world
 * @param {BirthPolicy} policy the policy
 * @returns {void}
 */
export function mate(world, policy) {
    const { alive } = world;
    const { mateChanceScale } = world.config;
    const { reproductionBonus } = world.config.seasons[world.season[0]];
    const chance = Math.min(1, reproductionBonus / mateChanceScale);
    for (let a = 0; a < alive.length; a++) {
        if (alive[a] === 1 && readyToMate(world, a)) {
            const b = femaleChoice(world, a, chance);
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

/** The most of the mother's energy a merit-scaled gift may take. */
const GIFT_CAP = 0.9;

/**
 * The energy a birth moves from `mother` to the child. A mating gives `childEnergyShare` of her energy, a split half.
 * With `meritEnabled` and a non-zero `meritBirthBoost` the gift is scaled by `1 + boost x (2m - 1)`
 * (`m = merit / (merit + meritHalf)`, her merit decayed to now without restamping it) and capped at 0.9 of her energy;
 * otherwise it is the unscaled gift, exactly.
 * @param {World} world the world
 * @param {number} mother the mother or splitter
 * @param {boolean} isMate true for a mating birth
 * @returns {number}
 */
export function giftOf(world, mother, isMate) {
    const { meritEnabled, meritBirthBoost, meritHalf } = world.config;
    const energy = world.energy[mother];
    const gift = energy * (isMate ? childShareOf(world, mother) : 0.5);
    if (!meritEnabled || meritBirthBoost === 0) {
        return gift;
    }
    const merit = meritPeek(world, mother);
    const factor = 1 + meritBirthBoost * ((2 * merit) / (merit + meritHalf) - 1);
    return Math.min(gift * factor, energy * GIFT_CAP);
}

/**
 * Allocates a child of `mother`, runs the brain hook, moves its energy in, places it and pushes `AgentBorn`.
 * A mating birth gives `childEnergyShare` of the mother's energy, and is blocked when that (scaled by merit, see
 * `giftOf`) is below `childEnergyMin`; a split gives half, scaled the same way. Either needs a free slot.
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
    const gift = giftOf(world, mother, isMate);
    if (isMate && gift < childEnergyMin) {
        pushBlocked(world, mother, BLOCKED_CAUSE.ENERGY);
        return -1;
    }
    const child = allocAgent(world);
    world.genomeId[child] = world.nextId++;
    world.lineageId[child] = world.lineageId[mother];
    world.parentA[child] = world.genomeId[mother];
    world.parentB[child] = isMate ? world.fatherId[mother] : world.genomeId[mother];
    world.parentSlotA[child] = mother;
    world.parentSlotB[child] = isMate ? slotOfGenome(world, world.fatherId[mother]) : mother;
    world.spec[child] = childSpec(world, mother);
    drawSex(world, child);
    recordBirth(world, mother);
    if (!isMate) {
        noteSplit(world, mother);
    }
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
 * `advancePregnancies` with merit at the cap: counts every pregnancy down, collects those now due in slot order, and
 * when fewer slots are free than pregnancies due, attempts them best merit first (ties to the lower slot). A pregnancy
 * left without a slot waits at 1, as without merit.
 * @param {World} world the world
 * @param {BirthPolicy} policy the policy
 * @returns {void}
 */
function advanceRanked(world, policy) {
    const { alive, pregnancy, capSlots } = world;
    const maxAgents = world.config.maxAgents;
    let due = 0;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1 && pregnancy[slot] > 0) {
            pregnancy[slot] -= 1;
            if (pregnancy[slot] === 0) {
                capSlots[due++] = slot;
            }
        }
    }
    const ranked = world.population + due > maxAgents;
    if (ranked) {
        stampKeys(world, due);
    }
    for (let i = 0; i < due; i++) {
        const slot = ranked ? pickBest(world, due, i) : capSlots[i];
        if (world.population >= maxAgents) {
            pregnancy[slot] = 1;
        } else {
            giveBirth(world, policy, slot, BORN_CAUSE.MATE);
        }
    }
}

/**
 * Counts every pregnancy down and attempts the birth of each that reaches 0. With `capBirthsEnabled` a pregnancy that
 * falls due in a full world is not attempted: it stays at 1 and tries again next tick (no event, no energy change; the
 * cooldown keeps counting down). It waits until a slot frees, the mother dies, or the energy gate fails the birth.
 * @param {World} world the world
 * @param {BirthPolicy} policy the policy
 * @returns {void}
 */
export function advancePregnancies(world, policy) {
    if (meritCapOn(world)) {
        advanceRanked(world, policy);
        return;
    }
    const { alive, pregnancy } = world;
    const { capBirthsEnabled, maxAgents } = world.config;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1 && pregnancy[slot] > 0) {
            pregnancy[slot] -= 1;
            if (pregnancy[slot] > 0) {
                continue;
            }
            if (capBirthsEnabled && world.population >= maxAgents) {
                pregnancy[slot] = 1;
            } else {
                giveBirth(world, policy, slot, BORN_CAUSE.MATE);
            }
        }
    }
}

/**
 * The merit split gate: open when `meritEnabled` is off or the population is below `meritSplitFloorPop`; otherwise
 * open when `splitDeliberateMin` is 0 or the agent's `deliberateIntake` has reached it, and `splitKeysAllow` (the
 * share minimum, the per-life cap and `preySplit`). Reads only; a closed gate changes nothing, so the agent stays ready.
 * @param {World} world the world
 * @param {number} slot an alive agent
 * @returns {boolean} true when the gate lets the agent split
 */
export function splitGateOpen(world, slot) {
    const { meritEnabled, splitDeliberateMin, meritSplitFloorPop } = world.config;
    if (!meritEnabled || world.population < meritSplitFloorPop) {
        return true;
    }
    return (
        (splitDeliberateMin === 0 || world.deliberateIntake[slot] >= splitDeliberateMin) && splitKeysAllow(world, slot)
    );
}

/**
 * @param {World} world the world
 * @param {number} slot an alive agent
 * @returns {boolean} true when mature, rested, not pregnant, above `splitMinEnergy` and inside its birth budget:
 *   every term of `readyToSplit` but the merit split gate
 */
export function readyBeforeGate(world, slot) {
    const { maturityTicks } = world.config;
    return (
        world.ageTicks[slot] >= maturityTicks &&
        world.pregnancy[slot] === 0 &&
        world.cooldown[slot] === 0 &&
        world.energy[slot] > world.splitMinBySpec[world.spec[slot]] &&
        !birthBudgetSpent(world, slot)
    );
}

/**
 * @param {World} world the world
 * @param {number} slot an alive agent
 * @returns {boolean} true when `readyBeforeGate` and through the merit split gate; sex does not matter
 */
function readyToSplit(world, slot) {
    return readyBeforeGate(world, slot) && splitGateOpen(world, slot);
}

/**
 * `splitAll` with merit at the cap: collects the ready agents in slot order and, when fewer slots are free below the
 * split ceiling than agents are ready, splits the highest merit first (ties to the lower slot). The rest stay ready.
 * @param {World} world the world
 * @param {BirthPolicy} policy the policy
 * @returns {void}
 */
function splitRanked(world, policy) {
    const { alive, capSlots } = world;
    const { splitCooldownMultiplier, maxAgents, splitCapMargin } = world.config;
    const free = maxAgents - splitCapMargin - world.population;
    let ready = 0;
    for (let slot = 0; free > 0 && slot < alive.length; slot++) {
        if (alive[slot] === 1 && readyToSplit(world, slot)) {
            capSlots[ready++] = slot;
        }
    }
    const ranked = ready > free;
    if (ranked) {
        stampKeys(world, ready);
    }
    const count = ranked ? free : ready;
    for (let i = 0; i < count; i++) {
        const slot = ranked ? pickBest(world, ready, i) : capSlots[i];
        giveBirth(world, policy, slot, BORN_CAUSE.SPLIT);
        world.cooldown[slot] = cooldownFor(world, slot, splitCooldownMultiplier);
    }
}

/**
 * Splits every agent that `readyToSplit` in two, whatever its sex. With `capBirthsEnabled` splitting stops for the
 * tick once the population is within `splitCapMargin` of `maxAgents`, leaving those slots to pregnancies.
 * @param {World} world the world
 * @param {BirthPolicy} policy the policy
 * @returns {void}
 */
export function splitAll(world, policy) {
    if (meritCapOn(world)) {
        splitRanked(world, policy);
        return;
    }
    const { alive } = world;
    const { splitCooldownMultiplier, maxAgents, capBirthsEnabled, splitCapMargin } = world.config;
    const splitCeiling = capBirthsEnabled ? maxAgents - splitCapMargin : Infinity;
    for (let slot = 0; slot < alive.length; slot++) {
        if (world.population >= splitCeiling) {
            break;
        }
        if (alive[slot] === 1 && readyToSplit(world, slot) && giveBirth(world, policy, slot, BORN_CAUSE.SPLIT) >= 0) {
            world.cooldown[slot] = cooldownFor(world, slot, splitCooldownMultiplier);
        }
    }
}
