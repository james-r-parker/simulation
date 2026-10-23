import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { LOSS_CAUSE } from '../../js/sim/energy.js';
import { actAll, integrate, resolveContacts } from '../../js/sim/physics.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { allocateWorld } from '../../js/sim/world.js';
import { FEATURES_OFF } from '../../scripts/lib/features-on.mjs';

const PI = Math.PI;
const SMALL = {
    maxAgents: 64,
    initialAgents: 0,
    minAgents: 0,
    rayCount: 4,
    brainHidden: 3,
    maxFood: 8,
    initialFood: 0,
    obstacleCount: 0,
    fertileZoneMax: 3,
    worldWidth: 1000,
    worldHeight: 1000,
};

/**
 * @param {Record<string, number>} [extra]
 * @returns {any} a world with no agents
 */
function setup(extra = {}) {
    return allocateWorld(createConfig({ ...FEATURES_OFF, ...SMALL, ...extra }));
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
 * @param {number} slot
 * @param {number[]} out
 */
function setOut(w, slot, out) {
    w.outputs.set(out, slot * OUTPUT_COUNT);
}

/**
 * @param {any} w
 * @returns {string[]} contact pairs as "i,j"
 */
function contactPairs(w) {
    const pairs = [];
    for (let n = 0; n < w.contactCount; n++) {
        pairs.push(`${w.contacts[2 * n]},${w.contacts[2 * n + 1]}`);
    }
    return pairs;
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

describe('actAll', () => {
    it('turns by output times maxTurn', () => {
        const w = setup();
        put(w, 0, { angle: 0.5 });
        setOut(w, 0, [0, 0.5, 0, 0, 0]);
        actAll(w);
        expect(w.turnRate[0]).toBeCloseTo(0.5 * w.config.maxTurn, 6);
        expect(w.angle[0]).toBeCloseTo(0.5 + 0.5 * w.config.maxTurn, 6);
    });

    it('wraps the heading past PI and below -PI', () => {
        const w = setup();
        put(w, 0, { angle: 3.1 });
        put(w, 1, { angle: -3.1 });
        setOut(w, 0, [0, 1, 0, 0, 0]);
        setOut(w, 1, [0, -1, 0, 0, 0]);
        actAll(w);
        expect(w.angle[0]).toBeCloseTo(3.1 + w.config.maxTurn - 2 * PI, 5);
        expect(w.angle[1]).toBeCloseTo(-3.1 - w.config.maxTurn + 2 * PI, 5);
    });

    it('adds thrust along the new heading', () => {
        const w = setup();
        put(w, 0, { angle: PI / 2 });
        setOut(w, 0, [1, 0, 0, 0, 0]);
        actAll(w);
        expect(w.vx[0]).toBeCloseTo(0, 6);
        expect(w.vy[0]).toBeCloseTo(w.config.maxThrust, 6);
    });

    it('slows an agent handling a meal by handlingThrust (T50)', () => {
        const w = setup({ handlingTicks: 10, handlingThrust: 0.25 });
        put(w, 0, { angle: PI / 2 });
        w.ateTimer[0] = 3;
        setOut(w, 0, [1, 0, 0, 0, 0]);
        actAll(w);
        expect(w.vy[0]).toBeCloseTo(w.config.maxThrust * 0.25, 6);
    });

    it('applies full thrust once the handling ticks have passed', () => {
        const w = setup({ handlingTicks: 10, handlingThrust: 0.25 });
        put(w, 0, { angle: PI / 2 });
        w.ateTimer[0] = 10;
        setOut(w, 0, [1, 0, 0, 0, 0]);
        actAll(w);
        expect(w.vy[0]).toBeCloseTo(w.config.maxThrust, 6);
    });

    it('multiplies thrust while sprinting', () => {
        const w = setup();
        put(w, 0, { angle: 0 });
        setOut(w, 0, [1, 0, 1, 0, 0]);
        actAll(w);
        expect(w.vx[0]).toBeCloseTo(w.config.maxThrust * (1 + w.config.sprintMultiplier), 6);
    });

    it('skips dead slots', () => {
        const w = setup();
        setOut(w, 3, [1, 1, 1, 0, 0]);
        actAll(w);
        expect([w.vx[3], w.angle[3]]).toEqual([0, 0]);
    });
});

describe('integrate', () => {
    it('damps and moves', () => {
        const w = setup();
        put(w, 0, { x: 500, y: 500, vx: 2, vy: -4 });
        integrate(w);
        expect(w.vx[0]).toBeCloseTo(2 * w.config.damping, 6);
        expect(w.x[0]).toBeCloseTo(500 + 2 * w.config.damping, 4);
        expect(w.y[0]).toBeCloseTo(500 - 4 * w.config.damping, 4);
    });

    it('caps speed at maxVelocity and at the sprint cap while sprinting', () => {
        const w = setup();
        put(w, 0, { x: 500, y: 500, vx: 100 });
        put(w, 1, { x: 500, y: 600, vx: 100 });
        setOut(w, 1, [0, 0, 1, 0, 0]);
        integrate(w);
        expect(w.vx[0]).toBeCloseTo(w.config.maxVelocity, 5);
        expect(w.vx[1]).toBeCloseTo(w.config.maxVelocity * (1 + w.config.sprintMultiplier), 5);
    });

    it('bounces off a wall and damages once, with cause collision', () => {
        const w = setup();
        put(w, 0, { x: 26, y: 500, vx: -3 });
        integrate(w);
        expect(w.x[0]).toBe(25);
        expect(w.vx[0]).toBeGreaterThan(0);
        expect(w.energy[0]).toBe(100 - w.config.wallDamage);
        expect(w.lastLoss[0]).toBe(LOSS_CAUSE.COLLISION);
    });

    it('does not damage an agent touching a wall and moving away', () => {
        const w = setup();
        put(w, 0, { x: 20, y: 500, vx: 3 });
        integrate(w);
        expect(w.x[0]).toBeGreaterThan(20);
        expect(w.energy[0]).toBe(100);
    });

    it('damages once when two walls are hit in one tick', () => {
        const w = setup();
        put(w, 0, { x: 976, y: 976, vx: 3, vy: 3 });
        integrate(w);
        expect([w.x[0], w.y[0]]).toEqual([975, 975]);
        expect(w.vx[0]).toBeLessThan(0);
        expect(w.vy[0]).toBeLessThan(0);
        expect(w.energy[0]).toBe(100 - w.config.wallDamage);
    });

    it('does not damage an agent at the far wall moving away from it', () => {
        const w = setup();
        put(w, 0, { x: 990, y: 500, vx: -1 });
        integrate(w);
        expect(w.energy[0]).toBe(100);
    });

    it('bounces off the other wall of each axis', () => {
        const w = setup();
        put(w, 0, { x: 500, y: 24, vy: -1 });
        integrate(w);
        expect(w.y[0]).toBe(25);
        expect(w.vy[0]).toBeGreaterThan(0);
    });
});

describe('integrate with obstacles', () => {
    /**
     * @param {Record<string, number>} agent
     * @returns {any}
     */
    function withObstacle(agent) {
        const w = setup({ obstacleCount: 1 });
        w.obsX[0] = 500;
        w.obsY[0] = 500;
        w.obsRadius[0] = 50;
        put(w, 0, agent);
        return w;
    }

    it('pushes the agent out, reflects it and damages on impact', () => {
        const w = withObstacle({ x: 560, y: 500, vx: -4 });
        integrate(w);
        expect(w.x[0]).toBeCloseTo(575, 4);
        expect(w.vx[0]).toBeGreaterThan(0);
        expect(w.energy[0]).toBe(100 - w.config.obstacleDamage);
        expect(w.lastLoss[0]).toBe(LOSS_CAUSE.COLLISION);
    });

    it('does not damage an agent moving away from the obstacle', () => {
        const w = withObstacle({ x: 560, y: 500, vx: 4 });
        integrate(w);
        expect(w.x[0]).toBeCloseTo(575, 4);
        expect(w.energy[0]).toBe(100);
    });

    it('uses the obstacle velocity for the normal speed', () => {
        const w = withObstacle({ x: 560, y: 500, vx: 0.5 });
        w.obsVx[0] = 4;
        integrate(w);
        expect(w.energy[0]).toBe(100 - w.config.obstacleDamage);
    });

    it('uses the +x normal when the centres coincide', () => {
        const w = withObstacle({ x: 500, y: 500 });
        integrate(w);
        expect(w.x[0]).toBeCloseTo(575, 4);
    });

    it('leaves a distant agent alone', () => {
        const w = withObstacle({ x: 800, y: 800 });
        integrate(w);
        expect(w.energy[0]).toBe(100);
    });
});

describe('resolveContacts', () => {
    it('resolves a pair that shares several cells exactly once', () => {
        const w = setup();
        put(w, 0, { x: 120, y: 120 });
        put(w, 1, { x: 140, y: 130 });
        const hash = rebuilt(w);
        resolveContacts(w, hash);
        expect(contactPairs(w)).toEqual(['0,1']);
    });

    it('ignores pairs that do not overlap', () => {
        const w = setup();
        put(w, 0, { x: 100, y: 100 });
        put(w, 1, { x: 200, y: 100 });
        resolveContacts(w, rebuilt(w));
        expect(w.contactCount).toBe(0);
    });

    it('conserves momentum through the impulse', () => {
        const w = setup();
        put(w, 0, { x: 100, y: 100, vx: 3, vy: 1 });
        put(w, 1, { x: 140, y: 110, vx: -2, vy: 0.5, size: 40 });
        const mass = (/** @type {number} */ s) => w.size[s] * w.size[s];
        const momentum = () => [0, 1].map((s) => [mass(s) * w.vx[s], mass(s) * w.vy[s]]);
        const before = momentum();
        resolveContacts(w, rebuilt(w));
        const after = momentum();
        for (let axis = 0; axis < 2; axis++) {
            const sumBefore = before[0][axis] + before[1][axis];
            const sumAfter = after[0][axis] + after[1][axis];
            expect(Math.abs(sumAfter - sumBefore)).toBeLessThanOrEqual(1e-6 * Math.max(1, Math.abs(sumBefore)));
        }
        expect(w.vx[0]).toBeLessThan(3);
        expect(w.vx[1]).toBeGreaterThan(-2);
    });

    it('leaves velocities alone when the pair is separating', () => {
        const w = setup();
        put(w, 0, { x: 100, y: 100, vx: -1 });
        put(w, 1, { x: 140, y: 100, vx: 1 });
        resolveContacts(w, rebuilt(w));
        expect([w.vx[0], w.vx[1]]).toEqual([-1, 1]);
        expect(w.contactCount).toBe(1);
    });

    it('separates the pair so it no longer overlaps, the lighter agent moving further', () => {
        const w = setup();
        put(w, 0, { x: 100, y: 100, size: 20 });
        put(w, 1, { x: 130, y: 100, size: 40 });
        resolveContacts(w, rebuilt(w));
        const d = Math.hypot(w.x[1] - w.x[0], w.y[1] - w.y[0]);
        expect(d).toBeGreaterThanOrEqual(60 - 1e-3);
        expect(100 - w.x[0]).toBeGreaterThan(w.x[1] - 130);
    });

    it('pushes coincident agents apart along +x', () => {
        const w = setup();
        put(w, 0, { x: 300, y: 300 });
        put(w, 1, { x: 300, y: 300 });
        resolveContacts(w, rebuilt(w));
        expect(w.x[0]).toBeLessThan(w.x[1]);
        expect(w.y[0]).toBe(w.y[1]);
    });

    it('clamps centres into the world without damage or velocity change', () => {
        const w = setup();
        put(w, 0, { x: 5, y: 995, vx: -2, vy: 2 });
        const hash = rebuilt(w);
        resolveContacts(w, hash);
        expect([w.x[0], w.y[0]]).toEqual([25, 975]);
        expect([w.vx[0], w.vy[0]]).toEqual([-2, 2]);
        expect(w.energy[0]).toBe(100);
    });

    it('throws naming the tick when contacts exceed maxContacts', () => {
        const w = setup({ maxContacts: 1 });
        w.tick = 42;
        put(w, 0, { x: 100, y: 100 });
        put(w, 1, { x: 120, y: 100 });
        put(w, 2, { x: 110, y: 120 });
        expect(() => resolveContacts(w, rebuilt(w))).toThrow(/tick 42/);
    });

    it('resets the contact count each call', () => {
        const w = setup();
        put(w, 0, { x: 100, y: 100 });
        put(w, 1, { x: 120, y: 100 });
        const hash = rebuilt(w);
        resolveContacts(w, hash);
        w.x[1] = 900;
        resolveContacts(w, hash);
        expect(w.contactCount).toBeLessThanOrEqual(1);
    });

    it('resolves pairs whose boxes lie outside the world on either side', () => {
        const w = setup();
        put(w, 0, { x: -50, y: 100 });
        put(w, 1, { x: -40, y: 100 });
        put(w, 2, { x: 1100, y: 100 });
        put(w, 3, { x: 1110, y: 100 });
        resolveContacts(w, rebuilt(w));
        expect(contactPairs(w)).toEqual(['0,1', '2,3']);
    });

    it('ignores food entries in the hash', () => {
        const w = setup();
        put(w, 0, { x: 100, y: 100 });
        w.foodAlive[0] = 1;
        w.foodX[0] = 105;
        w.foodY[0] = 100;
        w.foodRadius[0] = 20;
        resolveContacts(w, rebuilt(w));
        expect(w.contactCount).toBe(0);
    });
});

describe('resolveContacts against brute force', () => {
    /**
     * @param {any} w
     * @returns {Set<string>} overlapping pairs
     */
    function bruteForce(w) {
        const pairs = new Set();
        for (let i = 0; i < SMALL.maxAgents; i++) {
            for (let j = i + 1; j < SMALL.maxAgents; j++) {
                const d = Math.hypot(w.x[j] - w.x[i], w.y[j] - w.y[i]);
                if (w.alive[i] && w.alive[j] && d < w.size[i] + w.size[j]) {
                    pairs.add(`${i},${j}`);
                }
            }
        }
        return pairs;
    }

    /**
     * @param {Set<string>} pairs
     * @returns {boolean} whether no agent is in two pairs
     */
    function isolated(pairs) {
        const seen = new Set();
        for (const pair of pairs) {
            for (const slot of pair.split(',')) {
                if (seen.has(slot)) {
                    return false;
                }
                seen.add(slot);
            }
        }
        return true;
    }

    it('lists each overlap once and, where pairs are independent, every brute-force pair', () => {
        let checked = 0;
        for (let seed = 1; seed <= 50; seed++) {
            const w = setup();
            const rng = createRng(seed);
            const count = 10 + Math.floor(nextFloat(rng) * 50);
            for (let i = 0; i < count; i++) {
                const x = 40 + nextFloat(rng) * 920;
                const y = 40 + nextFloat(rng) * 920;
                put(w, i, { x, y, size: 20 + nextFloat(rng) * 30 });
            }
            const initial = bruteForce(w);
            resolveContacts(w, rebuilt(w));
            const found = contactPairs(w);
            expect(new Set(found).size).toBe(found.length);
            if (isolated(initial)) {
                for (const pair of initial) {
                    expect(found).toContain(pair);
                }
                checked += initial.size > 0 ? 1 : 0;
            }
        }
        expect(checked).toBeGreaterThanOrEqual(5);
    });
});

describe('actAll temperature', () => {
    it.each([
        [10, 0.3],
        [35, 0.7],
        [50, 1],
        [75, 0.8],
        [90, 0.4],
    ])('scales thrust at temperature %f by %f, sprint included', (t, efficiency) => {
        // The earlier heat efficiencies, pinned so this checks the formula rather than the tuned defaults.
        const w = setup({ temperatureEfficiencyHeatModerate: 0.8, temperatureEfficiencyHeatSevere: 0.4 });
        put(w, 0, { angle: 0, temperature: t });
        put(w, 1, { angle: 0, temperature: t });
        setOut(w, 0, [1, 0, 0, 0, 0]);
        setOut(w, 1, [1, 0, 1, 0, 0]);
        actAll(w);
        const { maxThrust, sprintMultiplier } = w.config;
        expect(w.vx[0]).toBeCloseTo(maxThrust * efficiency, 6);
        expect(w.vx[1]).toBeCloseTo(maxThrust * efficiency * (1 + sprintMultiplier), 6);
    });

    it('gives the earlier numbers when every efficiency is 1', () => {
        const w = setup({
            temperatureEfficiencyColdSevere: 1,
            temperatureEfficiencyColdModerate: 1,
            temperatureEfficiencyHeatModerate: 1,
            temperatureEfficiencyHeatSevere: 1,
        });
        put(w, 0, { angle: 0, temperature: 5 });
        put(w, 1, { angle: 0, temperature: 95 });
        setOut(w, 0, [0.5, 0, 0, 0, 0]);
        setOut(w, 1, [0.5, 0, 0, 0, 0]);
        actAll(w);
        expect(w.vx[0]).toBeCloseTo(0.5 * w.config.maxThrust, 6);
        expect(w.vx[1]).toBeCloseTo(0.5 * w.config.maxThrust, 6);
    });
});
