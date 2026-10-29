// Invasion pulses (world-balance T53): every `invasionInterval` ticks `invasionSize` immigrants of one lineage arrive
// at a world edge. The first is an ordinary immigrant (the policy draws its genome, from the archive when it has
// one); the rest are copies of it, so the pulse is one lineage.

import { BORN_CAUSE, EVENT_STRIDE, EVENT_TYPE, pushEvent } from './events.js';
import { nextFloat, nextInt } from './rng.js';
import { clearOfObstacles, spawnAgent } from './spawn.js';
import { applyGenes } from './traits.js';

/** @typedef {import('./world.js').World} World */

/** How far from the edge, and along it, a pulse spreads. */
const SPREAD = 150;
const EDGES = 4;

/**
 * Moves an agent to a random point in a band along an edge, clear of obstacles; keeps its place after
 * `placementTries` misses.
 * @param {World} world the world
 * @param {number} slot the agent
 * @param {{edge: number, along: number}} where the edge (0 west, 1 east, 2 north, 3 south) and the point along it
 * @returns {void}
 */
function placeAtEdge(world, slot, { edge, along }) {
    const { worldWidth, worldHeight, placementTries } = world.config;
    const r = world.size[slot];
    const rng = world.rng.spawn;
    const horizontal = edge >= 2;
    const length = horizontal ? worldWidth : worldHeight;
    const depth = horizontal ? worldHeight : worldWidth;
    for (let attempt = 0; attempt < placementTries; attempt++) {
        const a = Math.min(length - r, Math.max(r, along + (nextFloat(rng) - 0.5) * SPREAD));
        const inset = r + nextFloat(rng) * SPREAD;
        const d = edge % 2 === 0 ? inset : depth - inset;
        const x = horizontal ? a : d;
        const y = horizontal ? d : a;
        if (clearOfObstacles(world, x, y, r)) {
            world.x[slot] = x;
            world.y[slot] = y;
            return;
        }
    }
}

/**
 * Makes `slot` a copy of `leader`: the same lineage, specialisation and weights, and corrects the follower's
 * `AgentBorn` record (the newest event, pushed by `spawnAgent`) to match.
 * @param {World} world the world
 * @param {number} slot the follower
 * @param {number} leader the first immigrant
 * @returns {void}
 */
function copyGenome(world, slot, leader) {
    const wc = world.layout.weightCount;
    world.weights.copyWithin(slot * wc, leader * wc, (leader + 1) * wc);
    world.lineageId[slot] = world.lineageId[leader];
    world.spec[slot] = world.spec[leader];
    applyGenes(world, slot);
    // spawnAgent pushed this slot's AgentBorn before the copy, with the follower's own lineage and the policy's spec;
    // it is the newest record, and the observer reads lineage and spec from it.
    const o = (world.events.count - 1) * EVENT_STRIDE;
    const d = world.events.data;
    d[o + 4] = world.lineageId[slot];
    d[o + 5] = world.spec[slot];
}

/**
 * On every `invasionInterval` ticks, spawns the pulse at a random edge and pushes `InvasionArrived`. Stops at
 * `maxAgents`. Nothing happens, and nothing is drawn, when the interval is 0.
 * @param {World} world the world
 * @param {any} policy the brain policy
 * @returns {void}
 */
export function invade(world, policy) {
    const { invasionInterval, invasionSize, maxAgents } = world.config;
    const due = invasionInterval > 0 && world.tick > 0 && world.tick % invasionInterval === 0;
    const count = due ? Math.min(invasionSize, maxAgents - world.population) : 0;
    if (count <= 0) {
        return;
    }
    const edge = nextInt(world.rng.spawn, EDGES);
    const length = edge >= 2 ? world.config.worldWidth : world.config.worldHeight;
    const where = { edge, along: nextFloat(world.rng.spawn) * length };
    const leader = spawnAgent(world, policy, BORN_CAUSE.IMMIGRANT);
    placeAtEdge(world, leader, where);
    for (let i = 1; i < count; i++) {
        const slot = spawnAgent(world, policy, BORN_CAUSE.IMMIGRANT);
        copyGenome(world, slot, leader);
        placeAtEdge(world, slot, where);
    }
    const o = pushEvent(world.events, EVENT_TYPE.INVASION_ARRIVED, world.tick);
    const d = world.events.data;
    d[o + 2] = count;
    d[o + 3] = world.lineageId[leader];
    d[o + 4] = world.spec[leader];
    d[o + 5] = edge;
}
