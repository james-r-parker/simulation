// honest-budgets Phase 3: a wall or rock impact costs impactDamage x (speed into the surface - impactDeadband) when that
// is above 0, so a body that brushes or rests against a surface pays nothing and a hard hit pays by its speed.
import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { LOSS_CAUSE } from '../../js/sim/energy.js';
import { integrate } from '../../js/sim/physics.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';
import { bounceRocksKernel, rockImpactSpeed } from '../../js/sim/wasm-physics.js';
import { allocateWorld } from '../../js/sim/world.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

/** The impact rule on, the contact damages off, as in the screen's impact arms. */
const IMPACT = { impactDamage: 10, impactDeadband: 2, wallDamage: 0, obstacleDamage: 0 };

/**
 * @param {Record<string, number>} [extra] config overrides
 * @returns {any} an empty 1000 x 1000 world with a radius-50 rock at (500, 500)
 */
function setup(extra = {}) {
    const w = allocateWorld(
        createConfig({
            ...SIMPLE_WORLD,
            maxAgents: 4,
            initialAgents: 0,
            minAgents: 0,
            rayCount: 4,
            brainHidden: 3,
            maxFood: 8,
            initialFood: 0,
            fertileZoneMax: 3,
            worldWidth: 1000,
            worldHeight: 1000,
            ...IMPACT,
            ...extra,
        }),
    );
    w.obsX[0] = 500;
    w.obsY[0] = 500;
    w.obsRadius[0] = 50;
    return w;
}

/**
 * @param {any} w the world
 * @param {Record<string, number>} fields the agent's fields
 * @returns {number} slot 0, alive with radius 25 and energy 1000
 */
function put(w, fields) {
    w.alive[0] = 1;
    w.population += 1;
    w.size[0] = 25;
    w.energy[0] = 1000;
    w.temperature[0] = w.config.temperatureStart;
    for (const [k, v] of Object.entries(fields)) {
        w[k][0] = v;
    }
    return 0;
}

/**
 * One integrate of a head-on hit at velocity `vx` (before damping), into the left wall or into the rock from its left.
 * @param {'wall' | 'rock'} surface the surface
 * @param {number} vx the velocity toward it, positive
 * @param {Record<string, number>} [extra] config overrides
 * @returns {{ cost: number, speed: number, cause: number }} the energy lost, the speed after the bounce (the speed
 *   into the surface, since a head-on bounce keeps it) and the loss cause
 */
function hit(surface, vx, extra = {}) {
    const w = setup(extra);
    if (surface === 'wall') {
        put(w, { x: 26, y: 200, vx: -vx });
    } else {
        put(w, { x: 426, y: 500, vx });
    }
    integrate(w);
    return { cost: 1000 - w.energy[0], speed: Math.abs(w.vx[0]), cause: w.lastLoss[0] };
}

describe('impact damage', () => {
    it.each(['wall', 'rock'])('charges nothing for a %s hit under the deadband', (surface) => {
        const { cost, speed } = hit(/** @type {'wall' | 'rock'} */ (surface), 1.5);
        expect(speed).toBeGreaterThan(0);
        expect(speed).toBeLessThan(2);
        expect(cost).toBe(0);
    });

    it.each(['wall', 'rock'])('charges impactDamage x (speed - deadband) for a %s hit above it', (surface) => {
        const { cost, speed, cause } = hit(/** @type {'wall' | 'rock'} */ (surface), 6);
        expect(cost).toBeCloseTo(10 * (speed - 2), 3);
        expect(cause).toBe(LOSS_CAUSE.COLLISION);
    });

    it('scales the damage with the speed into the surface', () => {
        for (const surface of /** @type {const} */ (['wall', 'rock'])) {
            const costs = [3, 4, 5, 6, 7].map((v) => hit(surface, v));
            for (const { cost, speed } of costs) {
                expect(cost / (speed - 2)).toBeCloseTo(10, 3);
            }
            for (let n = 1; n < costs.length; n++) {
                expect(costs[n].cost).toBeGreaterThan(costs[n - 1].cost);
            }
        }
    });

    it('charges a wall and a rock the same for the same head-on speed', () => {
        for (const v of [3, 5, 7]) {
            const wall = hit('wall', v);
            const rock = hit('rock', v);
            expect(rock.speed).toBeCloseTo(wall.speed, 5);
            expect(rock.cost).toBeCloseTo(wall.cost, 3);
        }
    });

    it('charges each wall axis hit by its own speed', () => {
        const w = setup();
        put(w, { x: 976, y: 976, vx: 6, vy: 4 });
        integrate(w);
        const expected = 10 * (Math.abs(w.vx[0]) - 2) + 10 * (Math.abs(w.vy[0]) - 2);
        expect(1000 - w.energy[0]).toBeCloseTo(expected, 3);
    });

    it('charges nothing to a body resting against a rock across 100 ticks', () => {
        /**
         * @param {number} deadband the impactDeadband
         * @returns {{ lost: number, strikes: number, farthest: number }} the energy lost, the ticks that ended on the
         *   rock's face (an impact pushes the body out to it) and the farthest the body got from the face after its first 10 ticks
         */
        const press = (deadband) => {
            const w = setup({ impactDeadband: deadband });
            put(w, { y: 500 });
            w.x[0] = 450 - w.size[0]; // on the rock's face
            let strikes = 0;
            let farthest = 0;
            for (let t = 0; t < 100; t++) {
                w.vx[0] += 0.3; // a steady push into the rock, as a blob thrusting at it
                integrate(w);
                const gap = 450 - w.size[0] - w.x[0];
                strikes += Math.abs(gap) < 1e-3 ? 1 : 0;
                farthest = t >= 10 ? Math.max(farthest, gap) : farthest; // once its size has settled
            }
            return { lost: 1000 - w.energy[0], strikes, farthest };
        };
        const resting = press(2);
        expect(resting.strikes).toBeGreaterThan(5);
        expect(resting.farthest).toBeLessThan(5);
        expect(resting.lost).toBe(0);
        // The same pushes do strike the rock: with no deadband they cost.
        expect(press(0).lost).toBeGreaterThan(0);
    });

    it('charges nothing at the default impactDamage 0', () => {
        expect(hit('wall', 7, { impactDamage: 0 }).cost).toBe(0);
        expect(hit('rock', 7, { impactDamage: 0 }).cost).toBe(0);
    });

    it('keeps the contact damages beside the impact cost', () => {
        const { cost, speed } = hit('rock', 6, { obstacleDamage: 5 });
        expect(cost).toBeCloseTo(5 + 10 * (speed - 2), 3);
    });
});

describe('the rock impact speed', () => {
    it('is the speed along the rock normal into it computed in JS, for any approach', () => {
        const rng = createRng(7);
        let impacts = 0;
        for (let n = 0; n < 200; n++) {
            const w = setup();
            const angle = nextFloat(rng) * 2 * Math.PI;
            const reach = 50 + 24 * nextFloat(rng);
            put(w, {
                x: 500 + reach * Math.cos(angle),
                y: 500 + reach * Math.sin(angle),
                vx: 16 * nextFloat(rng) - 8,
                vy: 16 * nextFloat(rng) - 8,
            });
            const [x, y, vx, vy] = [w.x[0], w.y[0], w.vx[0], w.vy[0]];
            const d = Math.sqrt((x - 500) * (x - 500) + (y - 500) * (y - 500));
            const vn = vx * ((x - 500) / d) + vy * ((y - 500) / d);
            const k = bounceRocksKernel(w, 0, 25, 0);
            expect(k).toBe(vn < 0 ? 0 : -1);
            expect(rockImpactSpeed(w, 0)).toBe(vn < 0 ? -vn : 0);
            impacts += k === 0 ? 1 : 0;
        }
        expect(impacts).toBeGreaterThan(50);
    });
});
