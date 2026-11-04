import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { LOSS_CAUSE } from '../../js/sim/energy.js';
import { resolveContacts } from '../../js/sim/physics.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { allocateWorld } from '../../js/sim/world.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

const SMALL = {
    maxAgents: 64,
    initialAgents: 0,
    minAgents: 0,
    rayCount: 4,
    brainHidden: 3,
    maxFood: 8,
    initialFood: 0,
    fertileZoneMax: 3,
    worldWidth: 1000,
    worldHeight: 1000,
};

/**
 * @returns {any} a world with no agents
 */
function setup() {
    return allocateWorld(createConfig({ ...SIMPLE_WORLD, ...SMALL }));
}

/**
 * @param {any} w
 * @param {number} slot
 * @param {Record<string, number>} fields
 * @returns {number} the slot
 */
function put(w, slot, fields) {
    w.alive[slot] = 1;
    w.population += 1;
    w.size[slot] = 25;
    w.energy[slot] = 100;
    w.temperature[slot] = w.config.temperatureStart;
    for (const [k, v] of Object.entries(fields)) {
        w[k][slot] = v;
    }
    return slot;
}

/**
 * @param {any} w
 * @returns {any} the hash after a rebuild
 */
function rebuilt(w) {
    const hash = createSpatialHash(w.config);
    buildHash(hash, w);
    return hash;
}

describe('agent-agent contact', () => {
    it('agent-agent contact pushes apart without energy loss', () => {
        const w = setup();
        put(w, 0, { x: 400, y: 500, vx: 2 });
        put(w, 1, { x: 420, y: 500, vx: -2 });
        const gap = (/** @type {number} */ a, /** @type {number} */ b) => Math.hypot(w.x[b] - w.x[a], w.y[b] - w.y[a]);
        const before = gap(0, 1);

        resolveContacts(w, rebuilt(w));

        expect(w.contactCount).toBe(1);
        expect(w.energy[0]).toBe(100);
        expect(w.energy[1]).toBe(100);
        expect(w.lastLoss[0]).not.toBe(LOSS_CAUSE.COLLISION);
        expect(w.lastLoss[1]).not.toBe(LOSS_CAUSE.COLLISION);
        expect(gap(0, 1)).toBeGreaterThan(before);
    });
});
