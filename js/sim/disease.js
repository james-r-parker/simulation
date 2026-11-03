// The contagion (docs/designs/disease.md): a strain is born on one host and records its genome sample, spreads by
// contact to neighbours whose genomes are close to that sample, drains its hosts, and leaves survivors immune.

import { DISEASE_MAX_STRAINS } from './config-disease.js';
import { LOSS_CAUSE, removeEnergy } from './energy.js';
import { EVENT_TYPE, pushEvent } from './events.js';
import { distanceToGenotype, sampleGenotype, SIMILARITY_DIMS } from './genetics.js';
import { firstScannedCell } from './mate-search.js';
import { nextFloat, nextInt } from './rng.js';
import { cellRange } from './spatial-hash.js';

/** @typedef {import('./world.js').World} World */

/** Scratch host counts for `assertDisease`. */
const HOST_COUNTS = new Int32Array(DISEASE_MAX_STRAINS);

/**
 * Infects a slot with a strain and pushes `AGENT_INFECTED`.
 * @param {World} world the world
 * @param {number} slot a susceptible alive agent
 * @param {number} strain the strain slot
 * @param {number} distance the slot's genetic distance to the strain's genotype
 * @returns {void}
 */
function infect(world, slot, strain, distance) {
    world.infection[slot] = strain + 1;
    world.infectionTicks[slot] = world.config.diseaseTicks;
    world.strainInfected[strain] += 1;
    world.strainTotal[strain] += 1;
    const o = pushEvent(world.events, EVENT_TYPE.AGENT_INFECTED, world.tick);
    const d = world.events.data;
    d[o + 2] = slot;
    d[o + 3] = world.genomeId[slot];
    d[o + 4] = strain;
    d[o + 5] = distance;
}

/**
 * Frees a strain with no host: pushes `STRAIN_EXTINCT`, clears its genotype and its immunity bit from every agent.
 * @param {World} world the world
 * @param {number} strain the strain slot
 * @returns {void}
 */
function endStrain(world, strain) {
    const o = pushEvent(world.events, EVENT_TYPE.STRAIN_EXTINCT, world.tick);
    const d = world.events.data;
    d[o + 2] = strain;
    d[o + 3] = world.strainTotal[strain];
    d[o + 4] = world.tick - world.strainBornTick[strain];
    world.strainAlive[strain] = 0;
    world.strainTotal[strain] = 0;
    world.strainFounderLineage[strain] = 0;
    world.strainBornTick[strain] = 0;
    world.strainGenotype.fill(0, strain * SIMILARITY_DIMS, (strain + 1) * SIMILARITY_DIMS);
    const keep = ~(1 << strain) & 0xff;
    const { immuneMask } = world;
    for (let slot = 0; slot < immuneMask.length; slot++) {
        immuneMask[slot] &= keep;
    }
}

/**
 * Clears a slot's infection, ending its strain when it was the last host.
 * @param {World} world the world
 * @param {number} slot an infected slot
 * @returns {void}
 */
function clearInfection(world, slot) {
    const strain = world.infection[slot] - 1;
    world.infection[slot] = 0;
    world.infectionTicks[slot] = 0;
    world.strainInfected[strain] -= 1;
    if (world.strainInfected[strain] === 0) {
        endStrain(world, strain);
    }
}

/**
 * Releases a dying agent's infection before its slot is freed.
 * @param {World} world the world
 * @param {number} slot the dying agent
 * @returns {void}
 */
export function releaseInfection(world, slot) {
    if (world.infection[slot] !== 0) {
        clearInfection(world, slot);
    }
}

/**
 * Lists the alive agents carrying no infection, in slot order, into `world.healthySlots`.
 * @param {World} world the world
 * @returns {number} how many there are
 */
function listHealthy(world) {
    let count = 0;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1 && world.infection[slot] === 0) {
            world.healthySlots[count] = slot;
            count += 1;
        }
    }
    return count;
}

/**
 * When a strain slot is free and at least `diseaseMinHosts` are alive, one `disease` draw against `diseaseSeedRate`;
 * on success a strain emerges on a uniformly drawn healthy alive host, records its genome sample and infects it.
 * @param {World} world the world
 * @returns {number} the new strain's slot, or -1
 */
export function emergeStrain(world) {
    const strain = world.strainAlive.indexOf(0);
    const { population, config } = world;
    if (strain < 0 || population === 0 || population < config.diseaseMinHosts) {
        return -1;
    }
    if (nextFloat(world.rng.disease) >= config.diseaseSeedRate) {
        return -1;
    }
    const healthy = listHealthy(world);
    if (healthy === 0) {
        return -1;
    }
    const host = world.healthySlots[nextInt(world.rng.disease, healthy)];
    world.strainAlive[strain] = 1;
    world.strainFounderLineage[strain] = world.lineageId[host];
    world.strainBornTick[strain] = world.tick;
    sampleGenotype(world, host, world.strainGenotype, strain * SIMILARITY_DIMS);
    const o = pushEvent(world.events, EVENT_TYPE.STRAIN_EMERGED, world.tick);
    const d = world.events.data;
    d[o + 2] = strain;
    d[o + 3] = host;
    d[o + 4] = world.genomeId[host];
    d[o + 5] = world.lineageId[host];
    infect(world, host, strain, 0);
    return strain;
}

/**
 * Whether `b` is an alive, healthy agent not immune to `strain`, within `diseaseRadius` of `a`, centre to centre.
 * @param {World} world the world
 * @param {number} a the infected agent
 * @param {number} b a candidate slot
 * @param {number} strain the strain slot
 * @returns {boolean}
 */
function susceptible(world, a, b, strain) {
    if (b === a || world.alive[b] !== 1 || world.infection[b] !== 0 || (world.immuneMask[b] & (1 << strain)) !== 0) {
        return false;
    }
    const dx = world.x[b] - world.x[a];
    const dy = world.y[b] - world.y[a];
    const r = world.config.diseaseRadius;
    return dx * dx + dy * dy <= r * r;
}

/**
 * Tries each susceptible neighbour of `a` in one hash cell: one `disease` draw against the transmission chance, made
 * only when that chance is above 0.
 * @param {World} world the world
 * @param {number} a the infected agent
 * @param {number} col the cell column
 * @param {number} row the cell row
 * @returns {void}
 */
function spreadInCell(world, a, col, row) {
    const hash = world.hash;
    const cell = row * hash.cols + col;
    const strain = world.infection[a] - 1;
    const { diseaseTransmission, diseaseSpecificity } = world.config;
    for (let e = hash.cellStart[cell]; e < hash.cellStart[cell + 1]; e++) {
        const b = hash.entries[e];
        if (b >= hash.maxAgents || !firstScannedCell(hash, e, col, row) || !susceptible(world, a, b, strain)) {
            continue;
        }
        const distance = distanceToGenotype(world, world.strainGenotype, strain * SIMILARITY_DIMS, b);
        const chance = diseaseTransmission * Math.max(0, 1 - distance / diseaseSpecificity);
        if (chance > 0 && nextFloat(world.rng.disease) < chance) {
            infect(world, b, strain, distance);
        }
    }
}

/**
 * Each agent infected before this tick, in slot order, tries its neighbours in hash order.
 * @param {World} world the world, with the hash built this tick
 * @returns {void}
 */
export function transmit(world) {
    const { alive, infection, infectionTicks, hash } = world;
    const fresh = world.config.diseaseTicks;
    for (let a = 0; a < alive.length; a++) {
        if (alive[a] !== 1 || infection[a] === 0 || infectionTicks[a] === fresh) {
            continue;
        }
        const range = cellRange(hash, world.x[a], world.y[a], world.config.diseaseRadius);
        for (let row = range[1]; row <= range[3]; row++) {
            for (let col = range[0]; col <= range[2]; col++) {
                spreadInCell(world, a, col, row);
            }
        }
    }
}

/**
 * Drains each infected agent by `diseaseDrain` and counts its infection down; at 0 it recovers, immune to the strain.
 * @param {World} world the world
 * @returns {void}
 */
export function advanceInfections(world) {
    const { alive, infection, infectionTicks, immuneMask, config } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] !== 1 || infection[slot] === 0) {
            continue;
        }
        removeEnergy(world, slot, config.diseaseDrain, LOSS_CAUSE.DISEASE);
        infectionTicks[slot] -= 1;
        if (infectionTicks[slot] <= 0) {
            immuneMask[slot] |= 1 << (infection[slot] - 1);
            clearInfection(world, slot);
        }
    }
}

/**
 * The contagion's tick: emerge, transmit, then the course of each infection. Does nothing while `diseaseSeedRate`
 * is 0, so the `disease` stream is never drawn.
 * @param {World} world the world
 * @returns {void}
 */
export function stepDisease(world) {
    if (world.config.diseaseSeedRate <= 0) {
        return;
    }
    emergeStrain(world);
    transmit(world);
    advanceInfections(world);
}

/**
 * Throws on a broken contagion invariant: an infection names an alive strain, each strain's host count matches its
 * hosts, and no agent is infected with and immune to the same strain.
 * @param {World} world the world
 * @returns {void}
 */
export function assertDisease(world) {
    const counts = HOST_COUNTS.fill(0);
    for (let slot = 0; slot < world.alive.length; slot++) {
        const infection = world.infection[slot];
        if (world.alive[slot] !== 1 || infection === 0) {
            continue;
        }
        const strain = infection - 1;
        if (strain >= DISEASE_MAX_STRAINS || world.strainAlive[strain] !== 1) {
            throw new Error(`disease invariant: slot ${slot} carries strain ${strain}, which is not alive`);
        }
        if ((world.immuneMask[slot] & (1 << strain)) !== 0) {
            throw new Error(`disease invariant: slot ${slot} is infected with and immune to strain ${strain}`);
        }
        counts[strain] += 1;
    }
    for (let strain = 0; strain < DISEASE_MAX_STRAINS; strain++) {
        if (counts[strain] !== world.strainInfected[strain]) {
            throw new Error(
                `disease invariant: strain ${strain} counts ${world.strainInfected[strain]} hosts, found ${counts[strain]}`,
            );
        }
    }
}
