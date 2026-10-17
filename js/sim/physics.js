// Moves agents: steering and thrust, damping, wall and obstacle bounces, and agent-agent contact impulses.

import { OUTPUT_COUNT, OUTPUT_INDEX } from './brain-layout.js';
import { detCos, detSin } from './det-math.js';
import { LOSS_CAUSE, removeEnergy } from './energy.js';
import { thrustEfficiency } from './temperature.js';

const PI = 3.141592653589793;

/**
 * Turns, wraps the heading to [-PI, PI) and adds thrust along the new heading for every alive agent.
 * @param {import('./world.js').World} world the world
 * @returns {void}
 */
export function actAll(world) {
    const { alive, angle, turnRate, vx, vy, outputs, config } = world;
    const { maxTurn, maxThrust, sprintMultiplier } = config;
    for (let i = 0; i < alive.length; i++) {
        if (alive[i] === 1) {
            const o = i * OUTPUT_COUNT;
            turnRate[i] = outputs[o + OUTPUT_INDEX.TURN] * maxTurn * world.turnBySpec[world.spec[i]];
            let a = angle[i] + turnRate[i];
            if (a >= PI) {
                a -= 2 * PI;
            } else if (a < -PI) {
                a += 2 * PI;
            }
            angle[i] = a;
            let thrust = outputs[o + OUTPUT_INDEX.THRUST] * maxThrust * thrustEfficiency(config, world.temperature[i]);
            if (outputs[o + OUTPUT_INDEX.SPRINT] > 0) {
                thrust *= 1 + sprintMultiplier * world.sprintBySpec[world.spec[i]];
            }
            if (world.ateTimer[i] < config.handlingTicks) {
                thrust *= config.handlingThrust;
            }
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
 * Pushes one agent out of one obstacle and reflects its normal velocity, with impact-only damage.
 * @param {import('./world.js').World} world the world
 * @param {number} slot the agent slot
 * @param {number} k the obstacle index
 * @returns {void}
 */
function obstacleBounce(world, slot, k) {
    const { x, y, vx, vy, size, obsX, obsY, obsVx, obsVy, obsRadius } = world;
    const reach = obsRadius[k] + size[slot];
    const dx = x[slot] - obsX[k];
    const dy = y[slot] - obsY[k];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (!(d < reach)) {
        return;
    }
    const nx = d === 0 ? 1 : dx / d;
    const ny = d === 0 ? 0 : dy / d;
    x[slot] = obsX[k] + nx * reach;
    y[slot] = obsY[k] + ny * reach;
    const vn = (vx[slot] - obsVx[k]) * nx + (vy[slot] - obsVy[k]) * ny;
    if (vn < 0) {
        vx[slot] -= 2 * vn * nx;
        vy[slot] -= 2 * vn * ny;
        removeEnergy(world, slot, world.config.obstacleDamage, LOSS_CAUSE.COLLISION);
    }
}

/**
 * Applies damping, the speed cap and movement to one agent.
 * @param {import('./world.js').World} world the world
 * @param {number} slot the agent slot
 * @returns {void}
 */
function moveAgent(world, slot) {
    const { vx, vy, x, y, config } = world;
    const { damping, maxVelocity, sprintMultiplier } = config;
    vx[slot] *= damping;
    vy[slot] *= damping;
    const sprinting = world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.SPRINT] > 0;
    const boost = world.sprintBySpec[world.spec[slot]];
    const cap = sprinting ? maxVelocity * (1 + sprintMultiplier * boost) : maxVelocity;
    const speed = Math.sqrt(vx[slot] * vx[slot] + vy[slot] * vy[slot]);
    if (speed > cap) {
        const s = cap / speed;
        vx[slot] *= s;
        vy[slot] *= s;
    }
    x[slot] += vx[slot];
    y[slot] += vy[slot];
}

/**
 * Damps, caps and moves every alive agent, then bounces it off the walls and obstacles.
 * @param {import('./world.js').World} world the world
 * @returns {void}
 */
export function integrate(world) {
    const { alive, config } = world;
    for (let i = 0; i < alive.length; i++) {
        if (alive[i] === 1) {
            moveAgent(world, i);
            const hitX = wallAxis(world, i, true);
            const hitY = wallAxis(world, i, false);
            if (hitX || hitY) {
                removeEnergy(world, i, config.wallDamage, LOSS_CAUSE.COLLISION);
            }
            for (let k = 0; k < config.obstacleCount; k++) {
                obstacleBounce(world, i, k);
            }
        }
    }
}

/**
 * Unit-normal component along one axis; the normal is `(1, 0)` when the centres coincide.
 * @param {number} delta the centre difference on the axis
 * @param {number} d the centre distance
 * @param {number} fallback the component to use when `d` is 0
 * @returns {number}
 */
function normalPart(delta, d, fallback) {
    return d === 0 ? fallback : delta / d;
}

/**
 * Applies the impulse for one overlapping pair when its members approach.
 * @param {import('./world.js').World} world the world
 * @param {number} i the lower slot
 * @param {number} j the higher slot
 * @param {number} d the centre distance
 * @returns {void}
 */
function applyImpulse(world, i, j, d) {
    const { x, y, vx, vy, size } = world;
    const nx = normalPart(x[j] - x[i], d, 1);
    const ny = normalPart(y[j] - y[i], d, 0);
    const vn = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny;
    if (vn < 0) {
        const mi = size[i] * size[i];
        const mj = size[j] * size[j];
        const jn = (-(1 + world.config.restitution) * vn) / (1 / mi + 1 / mj);
        vx[i] -= (jn * nx) / mi;
        vy[i] -= (jn * ny) / mi;
        vx[j] += (jn * nx) / mj;
        vy[j] += (jn * ny) / mj;
    }
}

/**
 * Moves an overlapping pair apart along the normal, the lighter one further.
 * @param {import('./world.js').World} world the world
 * @param {number} i the lower slot
 * @param {number} j the higher slot
 * @param {number} d the centre distance
 * @returns {void}
 */
function separate(world, i, j, d) {
    const { x, y, size } = world;
    const nx = normalPart(x[j] - x[i], d, 1);
    const ny = normalPart(y[j] - y[i], d, 0);
    const mi = size[i] * size[i];
    const mj = size[j] * size[j];
    const p = size[i] + size[j] - d;
    x[i] += (-nx * p * mj) / (mi + mj);
    y[i] += (-ny * p * mj) / (mi + mj);
    x[j] += (nx * p * mi) / (mi + mj);
    y[j] += (ny * p * mi) / (mi + mj);
}

/**
 * Records, bounces and pushes apart one pair if it overlaps now.
 * @param {import('./world.js').World} world the world
 * @param {number} i the lower slot
 * @param {number} j the higher slot
 * @returns {void}
 */
function resolvePair(world, i, j) {
    const { x, y, size } = world;
    const dx = x[j] - x[i];
    const dy = y[j] - y[i];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (!(d < size[i] + size[j])) {
        return;
    }
    const n = world.contactCount++;
    if (n >= world.config.maxContacts) {
        throw new Error(
            `resolveContacts: tick ${world.tick} has more than maxContacts (${world.config.maxContacts}) contacts`,
        );
    }
    world.contacts[2 * n] = i;
    world.contacts[2 * n + 1] = j;
    applyImpulse(world, i, j, d);
    separate(world, i, j, d);
}

/**
 * Clamped cell coordinate of a bounding-box minimum, as the hash computes it.
 * @param {number} v the coordinate
 * @param {number} cellSize cell edge length
 * @param {number} last the last valid cell index
 * @returns {number}
 */
function cellCoord(v, cellSize, last) {
    const c = Math.floor(v / cellSize);
    return c < 0 ? 0 : c > last ? last : c;
}

/**
 * Whether the pair of entries `a`, `b` is owned by `cell`: the cell of the corner of their boxes' intersection.
 * @param {import('./spatial-hash.js').SpatialHash} hash the hash
 * @param {number} a first entry index
 * @param {number} b second entry index
 * @param {number} cell the cell being scanned
 * @returns {boolean}
 */
function ownsPair(hash, a, b, cell) {
    const col = cellCoord(Math.max(hash.boxX[a], hash.boxX[b]), hash.cellSize, hash.cols - 1);
    const row = cellCoord(Math.max(hash.boxY[a], hash.boxY[b]), hash.cellSize, hash.rows - 1);
    return row * hash.cols + col === cell;
}

/**
 * Resolves the pairs owned by one cell.
 * @param {import('./world.js').World} world the world
 * @param {import('./spatial-hash.js').SpatialHash} hash the hash
 * @param {number} cell the cell index
 * @returns {void}
 */
function resolveCell(world, hash, cell) {
    const { entries, cellStart, maxAgents } = hash;
    const end = cellStart[cell + 1];
    for (let a = cellStart[cell]; a < end && entries[a] < maxAgents; a++) {
        for (let b = a + 1; b < end && entries[b] < maxAgents; b++) {
            if (ownsPair(hash, a, b, cell)) {
                resolvePair(world, entries[a], entries[b]);
            }
        }
    }
}

/**
 * Keeps every alive agent's centre inside the world, with no velocity change and no damage.
 * @param {import('./world.js').World} world the world
 * @returns {void}
 */
function clampAgents(world) {
    const { alive, x, y, size, config } = world;
    for (let i = 0; i < alive.length; i++) {
        if (alive[i] === 1) {
            x[i] = Math.min(Math.max(x[i], size[i]), config.worldWidth - size[i]);
            y[i] = Math.min(Math.max(y[i], size[i]), config.worldHeight - size[i]);
        }
    }
}

/**
 * Resolves every overlapping agent pair once, filling `world.contacts`, then clamps agents into the world.
 * Loop order: cells ascending; within a cell, entry `a` ascending and entry `b` after it (agents come first and
 * in ascending slot order, so `a`'s slot is below `b`'s); a pair is handled only in the cell its boxes' overlap
 * starts in, and each pair is applied before the next is examined.
 * @param {import('./world.js').World} world the world
 * @param {import('./spatial-hash.js').SpatialHash} hash the hash built this tick
 * @returns {void}
 */
export function resolveContacts(world, hash) {
    world.contactCount = 0;
    for (let cell = 0; cell < hash.cols * hash.rows; cell++) {
        resolveCell(world, hash, cell);
    }
    clampAgents(world);
}
