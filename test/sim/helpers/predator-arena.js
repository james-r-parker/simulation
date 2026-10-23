// A two-agent arena for the predator-prey tests: a hunter and a prey in an empty world, driven by hand-written brains.

import { OUTPUT_COUNT, OUTPUT_INDEX, RAY_CHANNELS } from '../../../js/sim/brain-layout.js';
import { createConfig } from '../../../js/sim/config.js';
import { ENERGY_SOURCE, addEnergy } from '../../../js/sim/energy.js';
import { BORN_CAUSE } from '../../../js/sim/events.js';
import { spawnAgent, createWorld } from '../../../js/sim/spawn.js';
import { step } from '../../../js/sim/step.js';
import { FEATURES_OFF } from '../../../scripts/lib/features-on.mjs';

/** The hunter is slot 0 and the specialisation `predator`; the prey is slot 1 and a `forager`. */
export const HUNTER = 0;
export const PREY = 1;

const PREDATOR_SPEC = 1;
const FORAGER_SPEC = 0;
const CH_PREY = 3;
const CH_THREAT = 2;
const TURN_GAIN = 4;

/** An empty 8000 x 4000 world: no obstacles, no food, no floor and no immigrants. */
const ARENA = {
    // the pre-T15d ratio these arena tests assume (the default is now 0.8)
    huntSizeRatio: 1.01,
    worldWidth: 8000,
    worldHeight: 4000,
    maxAgents: 8,
    initialAgents: 0,
    minAgents: 0,
    immigrationInterval: 0,
    obstacleCount: 0,
    initialFood: 0,
    foodSpawnRate: 0,
    fertileZoneMax: 0,
    checkInvariants: true,
};

/** @type {import('../../../js/sim/spawn.js').Policy} */
const POLICY = {
    initSpec: (_world, slot) => (slot === HUNTER ? PREDATOR_SPEC : FORAGER_SPEC),
    initBrain() {},
};

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {number} channel a class channel within a ray
 * @returns {number} the angle (-PI to PI, relative to the heading) of the nearest ray with that class flag, or NaN
 */
function nearestRayAngle(world, slot, channel) {
    const { rayCount } = world.config;
    let best = -1;
    let bestProximity = 0;
    for (let k = 0; k < rayCount; k++) {
        const base = slot * world.layout.inputCount + k * RAY_CHANNELS;
        if (world.inputs[base + channel] > 0 && world.inputs[base] > bestProximity) {
            bestProximity = world.inputs[base];
            best = k;
        }
    }
    if (best < 0) {
        return Number.NaN;
    }
    const angle = (2 * Math.PI * best) / rayCount;
    return angle > Math.PI ? angle - 2 * Math.PI : angle;
}

/**
 * @param {number} angle a heading change wanted, in radians
 * @returns {number} a turn output that steers towards it, -1 to 1
 */
function steer(angle) {
    return Math.max(-1, Math.min(1, TURN_GAIN * angle));
}

/**
 * Writes one slot's outputs: zeroes the row, then sets the given outputs.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {Record<string, number>} values output values keyed by `OUTPUT_INDEX` name
 * @returns {void}
 */
function drive(world, slot, values) {
    const row = slot * OUTPUT_COUNT;
    world.outputs.fill(0, row, row + OUTPUT_COUNT);
    for (const [name, value] of Object.entries(values)) {
        world.outputs[row + OUTPUT_INDEX[/** @type {keyof typeof OUTPUT_INDEX} */ (name)]] = value;
    }
}

/**
 * The hunter's brain: turns towards the nearest "I can bite it" ray hit, thrusts, sprints and bites; with no hit it
 * thrusts straight on.
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function hunterBrain(world) {
    const angle = nearestRayAngle(world, HUNTER, CH_PREY);
    drive(world, HUNTER, {
        THRUST: 1,
        TURN: Number.isNaN(angle) ? 0 : steer(angle),
        SPRINT: 1,
        BITE: 1,
    });
}

/**
 * The prey's flee brain: turns away from the nearest "can bite me" ray hit, thrusts and sprints, and releases smoke
 * when `smoke` is set; with no hit it thrusts straight on.
 * @param {boolean} smoke whether the prey releases smoke
 * @returns {(world: Record<string, any>) => void} a brain for the prey slot
 */
export function fleeBrain(smoke) {
    return (world) => {
        const angle = nearestRayAngle(world, PREY, CH_THREAT);
        const away = Number.isNaN(angle) ? 0 : angle - Math.sign(angle || 1) * Math.PI;
        drive(world, PREY, { THRUST: 1, TURN: steer(away), SPRINT: 1, SMOKE: smoke ? 1 : 0 });
    };
}

/**
 * Builds the arena: the hunter at `(x, y)` heading +x with `hunterEnergy`, the prey `gap` further along +x.
 * @param {{gap: number, hunterEnergy: number, preyHeading?: number, over?: Record<string, any>}} setup the scenario
 * @returns {Record<string, any>} the world
 */
export function createArena({ gap, hunterEnergy, preyHeading = 0, over = {} }) {
    const world = createWorld(createConfig({ ...FEATURES_OFF, ...ARENA, ...over }), POLICY);
    spawnAgent(world, POLICY, BORN_CAUSE.INITIAL);
    spawnAgent(world, POLICY, BORN_CAUSE.INITIAL);
    addEnergy(world, HUNTER, hunterEnergy - world.energy[HUNTER], ENERGY_SOURCE.INITIAL);
    for (const [slot, x, angle] of [
        [HUNTER, 2000, 0],
        [PREY, 2000 + gap, preyHeading],
    ]) {
        world.x[slot] = x;
        world.y[slot] = 2000;
        world.angle[slot] = angle;
    }
    return world;
}

/**
 * The prey's brain when it does nothing: every output 0.
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function stillBrain(world) {
    drive(world, PREY, {});
}

/**
 * Steps the arena with the hunter brain and the given prey brain, until `after` returns true or `ticks` pass.
 * @param {Record<string, any>} world the world
 * @param {{ticks: number, prey: (world: Record<string, any>) => void, after?: (world: Record<string, any>) => boolean}} run
 *   the prey brain, the tick budget and an optional check after each step
 * @returns {number} the number of ticks stepped
 */
export function runArena(world, { ticks, prey, after = () => false }) {
    const brain = (/** @type {Record<string, any>} */ w) => {
        hunterBrain(w);
        prey(w);
    };
    let n = 0;
    while (n < ticks) {
        step(world, POLICY, { brain });
        n += 1;
        if (after(world)) {
            break;
        }
    }
    return n;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {number[]} the nine values of each of the agent's rays, flattened
 */
export function rayValues(world, slot) {
    const start = slot * world.layout.inputCount;
    return Array.from(world.inputs.subarray(start, start + world.config.rayCount * RAY_CHANNELS));
}
