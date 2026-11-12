// Moves agents: steering and thrust, damping, wall and obstacle bounces, and agent-agent contact impulses. The damping,
// speed cap and move, the rock bounce geometry and the contact pass run in the WASM kernels (wasm/src/physics.rs); the
// steering, thrust, trampling, walls and every energy rule stay here.

import { isSick } from './toxin.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from './brain-layout.js';
import { detCos, detSin } from './det-math.js';
import { LOSS_CAUSE, removeEnergy } from './energy.js';
import { thrustEfficiency } from './temperature.js';
import { trampleHerds } from './trample.js';
import { assertArenaHash } from './wasm-hash.js';
import { bounceRocksKernel, moveAgentsKernel, resolveContactsKernel } from './wasm-physics.js';

const PI = 3.141592653589793;

/**
 * eat-choice G1b: a forager holding its mouth open to graze moves at `grazeThrust` of its thrust; a hunter never does.
 * @param {import('./world.js').World} world the world
 * @param {number} i the agent slot
 * @returns {number} the thrust multiplier, 1 when the agent does not graze or `grazeThrust` is 1
 */
function grazeFactor(world, i) {
    const { grazeThrust } = world.config;
    if (grazeThrust === 1 || world.huntBySpec[world.spec[i]] === 1) {
        return 1;
    }
    return world.outputs[i * OUTPUT_COUNT + OUTPUT_INDEX.BITE] > 0 ? grazeThrust : 1;
}

/**
 * eat-choice G2: a full store weighs an agent down, so thrust and turn rate are multiplied by
 * `1 - fatSlowShare x energy / maxEnergyBySpec[spec]`; a full store slows every store size the same.
 * @param {import('./world.js').World} world the world
 * @param {number} i the agent slot
 * @returns {number} the multiplier, 1 when `fatSlowShare` is 0
 */
function fatFactor(world, i) {
    const { fatSlowShare } = world.config;
    if (fatSlowShare === 0) {
        return 1;
    }
    return 1 - (fatSlowShare * world.energy[i]) / world.maxEnergyBySpec[world.spec[i]];
}

/**
 * The thrust an agent adds this tick: its output times `maxThrust` and its temperature's efficiency, then the graze,
 * sprint, rest, handling, sickness and fat multipliers.
 * @param {import('./world.js').World} world the world
 * @param {number} i the agent slot
 * @param {number} fat the agent's `fatFactor`
 * @returns {number} the thrust
 */
function thrustOf(world, i, fat) {
    const { outputs, config } = world;
    const o = i * OUTPUT_COUNT;
    let thrust = outputs[o + OUTPUT_INDEX.THRUST] * config.maxThrust * thrustEfficiency(config, world.temperature[i]);
    thrust *= grazeFactor(world, i);
    if (outputs[o + OUTPUT_INDEX.SPRINT] > 0) {
        thrust *= 1 + config.sprintMultiplier * world.sprintBySpec[world.spec[i]];
    }
    if (config.predatorRestTicks > 0 && world.restTimer[i] > 0) {
        world.restTimer[i] -= 1; // realistic-keepers T2: a hunter lies up after a kill
        thrust = 0;
    }
    if (world.ateTimer[i] < config.handlingTicks) {
        thrust *= config.handlingThrust;
    }
    if (isSick(world, i)) {
        thrust *= config.sickThrust;
    }
    return thrust * fat;
}

/**
 * Turns, wraps the heading to [-PI, PI) and adds thrust along the new heading for every alive agent.
 * @param {import('./world.js').World} world the world
 * @returns {void}
 */
export function actAll(world) {
    const { alive, angle, turnRate, vx, vy, outputs, config } = world;
    for (let i = 0; i < alive.length; i++) {
        if (alive[i] === 1) {
            const fat = fatFactor(world, i);
            const turn = outputs[i * OUTPUT_COUNT + OUTPUT_INDEX.TURN] * config.maxTurn;
            turnRate[i] = turn * world.turnBySpec[world.spec[i]] * fat;
            let a = angle[i] + turnRate[i];
            if (a >= PI) {
                a -= 2 * PI;
            } else if (a < -PI) {
                a += 2 * PI;
            }
            angle[i] = a;
            const thrust = thrustOf(world, i, fat);
            vx[i] += thrust * detCos(a);
            vy[i] += thrust * detSin(a);
        }
    }
}

/**
 * Bounces one agent off the two walls of one axis.
 * @param {import('./world.js').World} world the world
 * @param {number} slot the agent slot
 * @param {boolean} horizontal true for the x axis, false for y
 * @returns {boolean} true when the agent hit a wall moving into it
 */
function wallAxis(world, slot, horizontal) {
    const pos = horizontal ? world.x : world.y;
    const vel = horizontal ? world.vx : world.vy;
    const limit = horizontal ? world.config.worldWidth : world.config.worldHeight;
    const r = world.size[slot];
    let hit = false;
    if (pos[slot] < r) {
        pos[slot] = r;
        if (vel[slot] < 0) {
            vel[slot] = -vel[slot];
            hit = true;
        }
    } else if (pos[slot] > limit - r) {
        pos[slot] = limit - r;
        if (vel[slot] > 0) {
            vel[slot] = -vel[slot];
            hit = true;
        }
    }
    return hit;
}

/**
 * Bounces one agent off every rock in index order (the geometry in the kernel); each impact moving into a rock costs
 * `obstacleDamage`, applied before the scan resumes, so the next rock sees the agent's new size. The box test keeps the
 * size the scan began with, as the JS loop did.
 * @param {import('./world.js').World} world the world
 * @param {number} slot the agent slot
 * @returns {void}
 */
function bounceObstacles(world, slot) {
    const own = world.size[slot];
    for (let k = bounceRocksKernel(world, slot, own, 0); k >= 0; k = bounceRocksKernel(world, slot, own, k + 1)) {
        removeEnergy(world, slot, world.config.obstacleDamage, LOSS_CAUSE.COLLISION);
    }
}

/**
 * Damps, caps and moves every alive agent, then bounces each off the herds, walls and obstacles. The moves all run
 * first, in one kernel call: an agent's move reads only its own velocity, and the bounces of the agents before it
 * write only their own state, so the order of every value is the per-agent order.
 * @param {import('./world.js').World} world the world
 * @returns {void}
 */
export function integrate(world) {
    const { alive, config } = world;
    moveAgentsKernel(world);
    for (let i = 0; i < alive.length; i++) {
        if (alive[i] === 1) {
            trampleHerds(world, i);
            const hitX = wallAxis(world, i, true);
            const hitY = wallAxis(world, i, false);
            if (hitX || hitY) {
                removeEnergy(world, i, config.wallDamage, LOSS_CAUSE.COLLISION);
            }
            bounceObstacles(world, i);
        }
    }
}

/**
 * Resolves every overlapping agent pair once, filling `world.contacts`, then clamps agents into the world.
 * Loop order: cells ascending; within a cell, entry `a` ascending and entry `b` after it (agents come first and
 * in ascending slot order, so `a`'s slot is below `b`'s); a pair is handled only in the cell its boxes' overlap
 * starts in, and each pair is applied before the next is examined. Runs in the kernel (`resolve_contacts`) over the
 * arena hash.
 * @param {import('./world.js').World} world the world
 * @param {import('./spatial-hash.js').SpatialHash} hash the hash built this tick: the world's own, or one bound to it
 * @returns {void}
 * @throws {Error} when the tick has more than `maxContacts` contacts
 */
export function resolveContacts(world, hash) {
    assertArenaHash(world, hash, 'resolveContacts');
    const count = resolveContactsKernel(world);
    if (count < 0) {
        throw new Error(
            `resolveContacts: tick ${world.tick} has more than maxContacts (${world.config.maxContacts}) contacts`,
        );
    }
    world.contactCount = count;
}
