// Debug-only world checks that throw on the first broken invariant, run when `config.checkInvariants` is set.

/** Names of the invariants, in the order `assertInvariants` checks them. */
export const INVARIANT = Object.freeze({
    FINITE: 'finite',
    IN_WORLD: 'in-world',
    POPULATION: 'population',
    LEDGER: 'ledger',
    TEMPERATURE: 'temperature',
});

/** Relative tolerance on the ledger comparison. */
const LEDGER_TOLERANCE = 1e-6;

const AGENT_SCALARS = ['x', 'y', 'vx', 'vy', 'angle', 'turnRate', 'size', 'energy', 'foodEnergy', 'biteEnergy'];
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
}
