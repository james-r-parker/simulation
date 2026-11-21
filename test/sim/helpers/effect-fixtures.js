// Fixture effects for the effect tests: one of each form (a step table, a share, a stored timer that ends together, a
// stored timer that loses a stack at a time), and a small world that holds their rows.

import { createEffects } from '../../../js/sim/effects.js';
import { SHARE } from '../../../js/sim/effect-refs.js';
import { smallWorld } from './small-world.js';

/** A step effect that halves `maxThrust` at level 1 and closes `EAT`. */
export const CHILL = {
    name: 'chill',
    family: 'body',
    maxStacks: 1,
    level: 'step',
    read: (/** @type {any} */ world, /** @type {number} */ slot) => world.fixture.chill[slot],
    scales: [{ lane: 'maxThrust', levels: [1, 0.5] }],
    gates: ['EAT'],
    drains: [],
    applier: null,
    visible: true,
};

/** A share effect: `maxThrust` and `maxTurn` fall by a share of the level. */
export const FAT = {
    name: 'fat',
    family: 'body',
    maxStacks: 1,
    level: 'share',
    read: (/** @type {any} */ world, /** @type {number} */ slot) => {
        SHARE[0] = world.fixture.fat[slot];
    },
    scales: [
        { lane: 'maxThrust', perStack: -0.5 },
        { lane: 'maxTurn', perStack: { key: 'fatSlowShare', scale: -1 } },
    ],
    gates: [],
    drains: [],
    applier: null,
    visible: true,
};

/** A stored effect that ends together: `rallyTicks` after its latest stack. */
export const RALLY = {
    name: 'rally',
    family: 'social',
    maxStacks: 3,
    level: 'stacks',
    fades: { kind: 'ticks', key: 'fixtureTicks' },
    scales: [{ lane: 'maxThrust', perStack: 0.1 }],
    gates: ['BITE'],
    drains: [{ perTick: 0.25, cause: 'COST' }],
    applier: 'fixture',
    visible: true,
};

/** A stored effect that loses one stack each `fixtureEvery` ticks. */
export const HOARSE = {
    name: 'hoarse',
    family: 'social',
    maxStacks: 4,
    level: 'stacks',
    fades: { kind: 'every', key: 'fixtureEvery' },
    scales: [],
    gates: [],
    drains: [],
    applier: 'fixture',
    visible: false,
};

export const SYSTEM = createEffects(/** @type {any} */ ([CHILL, FAT, RALLY, HOARSE]));

/**
 * @param {Record<string, any>} over fields of an effect, over `CHILL`
 * @returns {any} the effect, untyped so a test can break its shape
 */
export const chill = (over) => ({ ...CHILL, ...over });
export const [CHILL_I, FAT_I, RALLY_I, HOARSE_I] = [0, 1, 2, 3];

/**
 * @returns {Record<string, any>} a world with two agents and the fixture effects' rows
 */
export function fixtureWorld() {
    const world = smallWorld({ maxAgents: 4 });
    const config = { ...world.config, fixtureTicks: 5, fixtureEvery: 3 };
    Object.assign(world, { config });
    SYSTEM.allocRows(world);
    world.fixture = { chill: new Float64Array(4), fat: new Float64Array(4) };
    for (let slot = 0; slot < 2; slot++) {
        world.alive[slot] = 1;
        world.lanes.maxThrust[slot] = 2;
        world.lanes.maxTurn[slot] = 0.5;
        world.lanes.maxEnergy[slot] = 100;
        world.energy[slot] = 50;
        world.population += 1;
    }
    return world;
}
