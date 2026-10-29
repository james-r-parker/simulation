import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { actAll, integrate, resolveContacts } from '../../js/sim/physics.js';
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
    damping: 1,
};

/**
 * @param {Record<string, number>} [extra]
 * @returns {any} a world with no agents and no damping
 */
function setup(extra = {}) {
    return allocateWorld(createConfig({ ...SIMPLE_WORLD, ...SMALL, ...extra }));
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

describe('actAll heading', () => {
    it('adds thrust along a heading that is neither axis', () => {
        const w = setup();
        put(w, 0, { angle: 0.5 });
        w.outputs.set([1, 0, 0, 0, 0], 0);
        actAll(w);
        expect(w.vx[0]).toBeCloseTo(w.config.maxThrust * Math.cos(0.5), 6);
        expect(w.vy[0]).toBeCloseTo(w.config.maxThrust * Math.sin(0.5), 6);
        expect(OUTPUT_COUNT).toBe(11);
    });
});

describe('integrate walls at exact contact', () => {
    it('does not bounce or damage an agent that stops exactly touching the near wall', () => {
        const w = setup();
        put(w, 0, { x: 26, y: 500, vx: -1 });
        integrate(w);
        expect([w.x[0], w.vx[0], w.energy[0]]).toEqual([25, -1, 100]);
    });

    it('does not bounce or damage an agent that stops exactly touching the far wall', () => {
        const w = setup();
        put(w, 0, { x: 974, y: 500, vx: 1 });
        integrate(w);
        expect([w.x[0], w.vx[0], w.energy[0]]).toEqual([975, 1, 100]);
    });

    it('pushes a stationary agent out of either wall without damage', () => {
        const w = setup();
        put(w, 0, { x: 10, y: 990 });
        put(w, 1, { x: 990, y: 10 });
        integrate(w);
        expect([w.x[0], w.y[0], w.energy[0]]).toEqual([25, 975, 100]);
        expect([w.x[1], w.y[1], w.energy[1]]).toEqual([975, 25, 100]);
    });

    it('leaves dead slots untouched', () => {
        const w = setup();
        w.x[3] = 5;
        w.vx[3] = 2;
        w.size[3] = 20;
        integrate(w);
        expect([w.x[3], w.vx[3]]).toEqual([5, 2]);
    });

    it('scales both velocity components when capping the speed', () => {
        const w = setup();
        put(w, 0, { x: 500, y: 500, vx: 6, vy: 8 });
        integrate(w);
        expect(w.vx[0]).toBeCloseTo(4.8, 5);
        expect(w.vy[0]).toBeCloseTo(6.4, 5);
        expect(w.x[0]).toBeCloseTo(504.8, 4);
        expect(w.y[0]).toBeCloseTo(506.4, 4);
    });
});

describe('integrate obstacles exactly', () => {
    /**
     * @param {Record<string, number>} agent
     * @returns {any}
     */
    function withObstacle(agent) {
        const w = setup();
        w.obsX[0] = 500;
        w.obsY[0] = 500;
        w.obsRadius[0] = 50;
        put(w, 0, agent);
        return w;
    }

    it('ignores an agent exactly touching the obstacle', () => {
        const w = withObstacle({ x: 576, y: 500, vx: -1 });
        integrate(w);
        expect([w.x[0], w.vx[0], w.energy[0]]).toEqual([575, -1, 100]);
    });

    it('does not move a distant agent', () => {
        const w = withObstacle({ x: 800, y: 700 });
        integrate(w);
        expect([w.x[0], w.y[0]]).toEqual([800, 700]);
    });

    it('does not damage a stationary agent that overlaps the obstacle', () => {
        const w = withObstacle({ x: 560, y: 500 });
        integrate(w);
        expect([w.x[0], w.vx[0], w.energy[0]]).toEqual([575, 0, 100]);
    });

    it('reflects the velocity along the diagonal normal', () => {
        const w = withObstacle({ x: 540, y: 529, vx: -1, vy: -2 });
        integrate(w);
        const d = Math.hypot(39, 27);
        const [nx, ny] = [39 / d, 27 / d];
        const vn = -1 * nx + -2 * ny;
        expect(w.x[0]).toBeCloseTo(500 + nx * 75, 3);
        expect(w.y[0]).toBeCloseTo(500 + ny * 75, 3);
        expect(w.vx[0]).toBeCloseTo(-1 - 2 * vn * nx, 4);
        expect(w.vy[0]).toBeCloseTo(-2 - 2 * vn * ny, 4);
        expect(w.energy[0]).toBe(100 - w.config.obstacleDamage);
    });

    it('pushes a coincident agent out along +x only', () => {
        const w = withObstacle({ x: 500, y: 500 });
        integrate(w);
        expect([w.x[0], w.y[0]]).toEqual([575, 500]);
    });
});

describe('resolveContacts exactly', () => {
    /** @returns {any} sizes 20 and 30 overlapping on a 3-4-5 diagonal, closing fast */
    function pair() {
        const w = setup();
        put(w, 0, { x: 100, y: 100, size: 20, vx: 2, vy: 1 });
        put(w, 1, { x: 124, y: 132, size: 30, vx: -1, vy: -3 });
        return w;
    }

    it('applies the restitution impulse along the normal only', () => {
        const w = pair();
        resolveContacts(w, rebuilt(w));
        const [nx, ny] = [0.6, 0.8];
        const [mi, mj] = [400, 900];
        const dvx = w.vx[1] - w.vx[0];
        const dvy = w.vy[1] - w.vy[0];
        expect(dvx * nx + dvy * ny).toBeCloseTo(0.5 * 5, 4);
        expect(dvx * ny - dvy * nx).toBeCloseTo(-3 * 0.8 + 4 * 0.6, 4);
        expect(mi * w.vx[0] + mj * w.vx[1]).toBeCloseTo(mi * 2 + mj * -1, 2);
        expect(mi * w.vy[0] + mj * w.vy[1]).toBeCloseTo(mi - 3 * mj, 2);
        const tangent = (/** @type {number} */ s) => -w.vx[s] * ny + w.vy[s] * nx;
        expect(tangent(0)).toBeCloseTo(-2 * 0.8 + 1 * 0.6, 4);
        expect(tangent(1)).toBeCloseTo(1 * 0.8 - 3 * 0.6, 4);
    });

    it('separates the pair to exactly touching, the lighter agent moving further', () => {
        const w = pair();
        resolveContacts(w, rebuilt(w));
        expect(w.x[0]).toBeCloseTo(100 - 0.6 * 10 * (900 / 1300), 4);
        expect(w.y[0]).toBeCloseTo(100 - 0.8 * 10 * (900 / 1300), 4);
        expect(w.x[1]).toBeCloseTo(124 + 0.6 * 10 * (400 / 1300), 4);
        expect(w.y[1]).toBeCloseTo(132 + 0.8 * 10 * (400 / 1300), 4);
        expect(Math.hypot(w.x[1] - w.x[0], w.y[1] - w.y[0])).toBeCloseTo(50, 4);
    });

    it('ignores a pair whose boxes overlap but whose circles do not', () => {
        const w = setup();
        put(w, 0, { x: 100, y: 100, size: 20 });
        put(w, 1, { x: 130, y: 130, size: 20 });
        resolveContacts(w, rebuilt(w));
        expect(w.contactCount).toBe(0);
        expect([w.x[1], w.y[1]]).toEqual([130, 130]);
    });

    it('ignores a pair that is exactly touching', () => {
        const w = setup();
        put(w, 0, { x: 100, y: 100, size: 20, vx: 1 });
        put(w, 1, { x: 150, y: 100, size: 30, vx: -1 });
        resolveContacts(w, rebuilt(w));
        expect(w.contactCount).toBe(0);
        expect([w.vx[0], w.vx[1]]).toEqual([1, -1]);
    });

    it('accepts exactly maxContacts contacts', () => {
        const w = setup({ maxContacts: 1 });
        put(w, 0, { x: 100, y: 100 });
        put(w, 1, { x: 120, y: 100 });
        resolveContacts(w, rebuilt(w));
        expect(w.contactCount).toBe(1);
    });

    it('throws on the first contact beyond maxContacts', () => {
        const w = setup({ maxContacts: 1 });
        put(w, 0, { x: 100, y: 100 });
        put(w, 1, { x: 120, y: 100 });
        put(w, 2, { x: 500, y: 500 });
        put(w, 3, { x: 520, y: 500 });
        expect(() => resolveContacts(w, rebuilt(w))).toThrow(/maxContacts/);
    });

    it('names maxContacts in the overflow error', () => {
        const w = setup({ maxContacts: 1 });
        put(w, 0, { x: 100, y: 100 });
        put(w, 1, { x: 120, y: 100 });
        put(w, 2, { x: 110, y: 120 });
        expect(() => resolveContacts(w, rebuilt(w))).toThrow(/more than maxContacts \(1\) contacts/);
    });

    it('resolves pairs whose boxes lie outside the world above and below', () => {
        const w = setup();
        put(w, 0, { x: 100, y: -50 });
        put(w, 1, { x: 100, y: -40 });
        put(w, 2, { x: 100, y: 1100 });
        put(w, 3, { x: 100, y: 1110 });
        resolveContacts(w, rebuilt(w));
        expect(w.contactCount).toBe(2);
    });

    it('clamps centres that lie past the far x wall and the near y wall', () => {
        const w = setup();
        put(w, 0, { x: 1100, y: -5 });
        resolveContacts(w, rebuilt(w));
        expect([w.x[0], w.y[0]]).toEqual([975, 25]);
    });

    it('leaves dead slots unclamped', () => {
        const w = setup();
        w.x[2] = -5;
        w.size[2] = 10;
        resolveContacts(w, rebuilt(w));
        expect(w.x[2]).toBe(-5);
    });
});
