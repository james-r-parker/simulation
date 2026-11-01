import { assertPollen } from './pollination.js';
import { assertMycelium } from './mycelium.js';
import { assertFlora } from './flora-state.js';
// Debug-only world checks that throw on the first broken invariant, run when `config.checkInvariants` is set.

import { HEARD_STRIDE } from './world.js';

/** Names of the invariants, in the order `assertInvariants` checks them. */
export const INVARIANT = Object.freeze({
    FINITE: 'finite',
    IN_WORLD: 'in-world',
    POPULATION: 'population',
    LEDGER: 'ledger',
    TEMPERATURE: 'temperature',
    CALLS: 'calls',
    MERIT: 'merit',
    DOSE: 'dose',
    HERDS: 'herds',
});

/** Relative tolerance on the ledger comparison. */
const LEDGER_TOLERANCE = 1e-6;

const AGENT_SCALARS = ['x', 'y', 'vx', 'vy', 'angle', 'turnRate', 'size', 'energy', 'foodEnergy', 'biteEnergy', 'dose'];
const FOOD_SCALARS = ['foodX', 'foodY', 'foodValue', 'foodRadius'];

/**
 * Builds the violation error with its diagnostic properties.
 * @param {string} invariant an `INVARIANT` name
 * @param {import('./world.js').World} world the world
 * @param {{slot: number, value: number}} at the offending slot (-1 when not slot-specific) and value
 * @param {string} detail what was wrong
 * @returns {Error}
 */
function violation(invariant, world, { slot, value }, detail) {
    const error = new Error(
        `invariant ${invariant} violated at tick ${world.tick}, slot ${slot}, value ${value}: ${detail}`,
    );
    return Object.assign(error, { invariant, tick: world.tick, slot, value });
}

/**
 * @param {import('./world.js').World} world the world
 * @returns {void}
 */
function checkFinite(world) {
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] !== 1) {
            continue;
        }
        for (const name of AGENT_SCALARS) {
            const value = world[name][slot];
            if (!Number.isFinite(value)) {
                throw violation(
                    INVARIANT.FINITE,
                    world,
                    { slot: slot, value: value },
                    `agent array ${name} is not finite`,
                );
            }
        }
    }
    for (let slot = 0; slot < world.foodAlive.length; slot++) {
        if (world.foodAlive[slot] !== 1) {
            continue;
        }
        for (const name of FOOD_SCALARS) {
            const value = world[name][slot];
            if (!Number.isFinite(value)) {
                throw violation(
                    INVARIANT.FINITE,
                    world,
                    { slot: slot, value: value },
                    `food array ${name} is not finite`,
                );
            }
        }
    }
}

/**
 * @param {import('./world.js').World} world the world
 * @returns {void}
 */
function checkInWorld(world) {
    const { worldWidth, worldHeight } = world.config;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] !== 1) {
            continue;
        }
        const { x, y } = world;
        if (!(x[slot] >= 0 && x[slot] <= worldWidth)) {
            throw violation(
                INVARIANT.IN_WORLD,
                world,
                { slot: slot, value: x[slot] },
                `x is outside [0, ${worldWidth}]`,
            );
        }
        if (!(y[slot] >= 0 && y[slot] <= worldHeight)) {
            throw violation(
                INVARIANT.IN_WORLD,
                world,
                { slot: slot, value: y[slot] },
                `y is outside [0, ${worldHeight}]`,
            );
        }
    }
}

/**
 * @param {import('./world.js').World} world the world
 * @returns {number} the energy held by all alive agents
 */
function aliveEnergy(world) {
    let sum = 0;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            sum += world.energy[slot];
        }
    }
    return sum;
}

/**
 * @param {import('./world.js').World} world the world
 * @returns {void}
 */
function checkPopulation(world) {
    let count = 0;
    for (let slot = 0; slot < world.alive.length; slot++) {
        count += world.alive[slot];
    }
    if (count !== world.population) {
        throw violation(
            INVARIANT.POPULATION,
            world,
            { slot: -1, value: count },
            `${count} agents are alive but world.population is ${world.population}`,
        );
    }
}

/**
 * @param {import('./world.js').World} world the world
 * @returns {void}
 */
function checkLedger(world) {
    const sum = aliveEnergy(world);
    const expected = world.ledger[0] - world.ledger[1];
    if (Math.abs(sum - expected) > LEDGER_TOLERANCE * Math.max(1, sum)) {
        throw violation(
            INVARIANT.LEDGER,
            world,
            { slot: -1, value: sum - expected },
            `alive energy ${sum} differs from ledger in - out ${expected}`,
        );
    }
}

/**
 * @param {import('./world.js').World} world the world
 * @returns {void}
 */
function checkTemperature(world) {
    const max = world.config.temperatureMax;
    for (let slot = 0; slot < world.alive.length; slot++) {
        const value = world.temperature[slot];
        if (world.alive[slot] === 1 && !(value >= 0 && value <= max)) {
            throw violation(
                INVARIANT.TEMPERATURE,
                world,
                { slot: slot, value: value },
                `temperature is not finite or is outside [0, ${max}]`,
            );
        }
    }
}

/**
 * @param {import('./world.js').World} world the world
 * @returns {void}
 */
function checkClouds(world) {
    const { maxClouds } = world.config;
    const count = world.cloudCount;
    if (!(count >= 0 && count <= maxClouds)) {
        throw violation(INVARIANT.CALLS, world, { slot: -1, value: count }, `cloudCount is outside [0, ${maxClouds}]`);
    }
    for (let i = 0; i < maxClouds; i++) {
        const ttl = world.cloudTtl[i];
        if (i < count !== ttl > 0) {
            throw violation(INVARIANT.CALLS, world, { slot: -1, value: ttl }, `cloud ${i} has ttl ${ttl}`);
        }
    }
}

/**
 * @param {import('./world.js').World} world the world
 * @param {number} slot an alive slot
 * @param {number} value a timer value
 * @param {number} limit its largest legal value
 * @returns {void}
 */
function checkTimer(world, slot, value, limit) {
    if (value > limit) {
        throw violation(INVARIANT.CALLS, world, { slot, value }, `timer is above its limit ${limit}`);
    }
}

/**
 * @param {import('./world.js').World} world the world
 * @param {number} slot an alive slot
 * @returns {void}
 */
function checkSlotCalls(world, slot) {
    const { callTicks, smokeCooldown } = world.config;
    checkTimer(world, slot, world.alarmTimer[slot], callTicks);
    checkTimer(world, slot, world.huntTimer[slot], callTicks);
    checkTimer(world, slot, world.smokeTimer[slot], smokeCooldown);
    for (let k = 0; k < 2; k++) {
        const loudness = world.heard[slot * HEARD_STRIDE + 3 * k];
        if (!(loudness >= 0 && loudness <= 1)) {
            throw violation(INVARIANT.CALLS, world, { slot, value: loudness }, 'heard loudness is outside [0, 1]');
        }
    }
}

/**
 * @param {import('./world.js').World} world the world
 * @returns {void}
 */
function checkCalls(world) {
    checkClouds(world);
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            checkSlotCalls(world, slot);
        }
    }
}

/**
 * @param {import('./world.js').World} world the world
 * @returns {void}
 */
function checkMerit(world) {
    for (let slot = 0; slot < world.alive.length; slot++) {
        for (const name of ['merit', 'deliberateIntake']) {
            const value = world[name][slot];
            if (world.alive[slot] === 1 && !(Number.isFinite(value) && value >= 0)) {
                throw violation(INVARIANT.MERIT, world, { slot, value }, `${name} is negative or not finite`);
            }
        }
    }
}

/**
 * @param {import('./world.js').World} world the world
 * @returns {void}
 */
function checkDose(world) {
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1 && world.dose[slot] < 0) {
            throw violation(INVARIANT.DOSE, world, { slot, value: world.dose[slot] }, 'dose must be nonnegative');
        }
    }
}

/**
 * Checks live herd state, rock clearance and per-group capacity without allocating scratch memory.
 * @param {import('./world.js').World} world the world
 * @returns {void}
 */
function checkHerdState(world) {
    const counts = world.groupAnimalCount;
    counts.fill(0);
    for (let slot = 0; slot < world.herdAlive.length; slot++) {
        if (world.herdAlive[slot] !== 1) {
            if (world.herdStore[slot] !== 0) {
                throw violation(
                    INVARIANT.HERDS,
                    world,
                    { slot, value: world.herdStore[slot] },
                    'a dead herd slot holds store',
                );
            }
            continue;
        }
        checkHerdAnimal(world, slot, counts);
    }
    for (let group = 0; group < counts.length; group++) {
        if (counts[group] > world.config.herdSize) {
            throw violation(INVARIANT.HERDS, world, { slot: group, value: counts[group] }, 'a group exceeds herdSize');
        }
    }
}

/**
 * @param {import('./world.js').World} world the world
 * @param {number} slot the herd slot
 * @param {Uint16Array} counts scratch counts by group
 * @returns {void}
 */
function checkHerdAnimal(world, slot, counts) {
    for (const name of ['herdX', 'herdY', 'herdVx', 'herdVy', 'herdStore']) {
        if (!Number.isFinite(world[name][slot])) {
            throw violation(INVARIANT.HERDS, world, { slot, value: world[name][slot] }, `${name} is not finite`);
        }
    }
    const x = world.herdX[slot];
    const y = world.herdY[slot];
    const { worldWidth, worldHeight, herdRadius, herdStoreMax } = world.config;
    if (!(x >= herdRadius && x <= worldWidth - herdRadius && y >= herdRadius && y <= worldHeight - herdRadius)) {
        throw violation(INVARIANT.HERDS, world, { slot, value: x }, 'animal circle is outside the world');
    }
    if (world.herdStore[slot] < 0 || world.herdStore[slot] > herdStoreMax) {
        throw violation(INVARIANT.HERDS, world, { slot, value: world.herdStore[slot] }, 'store is outside its bounds');
    }
    const group = world.herdGroup[slot];
    if (group >= counts.length) {
        throw violation(INVARIANT.HERDS, world, { slot, value: group }, 'group index is out of bounds');
    }
    counts[group] += 1;
    checkHerdClearance(world, slot);
}

/** @param {import('./world.js').World} world the world @param {number} slot the herd slot @returns {void} */
function checkHerdClearance(world, slot) {
    for (let rock = 0; rock < world.obsRadius.length; rock++) {
        const reach = world.config.herdRadius + world.obsRadius[rock];
        const dx = world.herdX[slot] - world.obsX[rock];
        const dy = world.herdY[slot] - world.obsY[rock];
        if (dx * dx + dy * dy < reach * reach) {
            throw violation(INVARIANT.HERDS, world, { slot, value: rock }, 'animal overlaps a rock');
        }
    }
}

/**
 * Throws an `Error` (properties `invariant`, `tick`, `slot`, `value`) on the first broken invariant.
 * @param {import('./world.js').World} world the world to check
 * @returns {void}
 */
export function assertInvariants(world) {
    checkFinite(world);
    checkInWorld(world);
    checkPopulation(world);
    checkLedger(world);
    checkTemperature(world);
    checkCalls(world);
    checkMerit(world);
    checkDose(world);
    checkHerdState(world);
    assertFlora(world);
    assertPollen(world);
    assertMycelium(world);
}
