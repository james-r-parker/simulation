import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { integrate } from '../../js/sim/physics.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';
import { allocateWorld } from '../../js/sim/world.js';
import { FEATURES_OFF } from '../../scripts/lib/features-on.mjs';

/**
 * @param {number} x the agent's x
 * @param {number} y the agent's y
 * @returns {any} a one-agent world with a radius-50 obstacle at (500, 500), the agent at rest with radius 25
 */
function worldWith(x, y) {
    const config = createConfig({
        ...FEATURES_OFF,
        maxAgents: 4,
        initialAgents: 0,
        minAgents: 0,
        rayCount: 4,
        brainHidden: 3,
        maxFood: 8,
        initialFood: 0,
        obstacleCount: 1,
        fertileZoneMax: 3,
        worldWidth: 1000,
        worldHeight: 1000,
    });
    const w = allocateWorld(config);
    w.obsX[0] = 500;
    w.obsY[0] = 500;
    w.obsRadius[0] = 50;
    w.alive[0] = 1;
    w.population = 1;
    w.size[0] = 25;
    w.energy[0] = 100;
    w.x[0] = x;
    w.y[0] = y;
    return w;
}

describe('integrate obstacle contact by axis gap', () => {
    it('leaves an agent whose x gap is exactly the reach untouched', () => {
        const w = worldWith(575, 500);
        integrate(w);
        expect([w.x[0], w.y[0]]).toEqual([575, 500]);
    });

    it('pushes out an agent just inside the reach along one axis', () => {
        const w = worldWith(500, 574.5);
        integrate(w);
        expect(w.y[0]).toBeCloseTo(575, 4);
    });

    it('leaves a diagonal agent alone when each axis gap is inside the reach but the distance is not', () => {
        const w = worldWith(500 + 60, 500 + 60);
        integrate(w);
        expect([w.x[0], w.y[0]]).toEqual([560, 560]);
    });

    it('moves an agent out exactly when it overlaps, over random positions', () => {
        const rng = createRng(11);
        for (let i = 0; i < 300; i++) {
            const x = 400 + nextFloat(rng) * 200;
            const y = 400 + nextFloat(rng) * 200;
            const w = worldWith(x, y);
            const sx = w.x[0];
            const sy = w.y[0];
            integrate(w);
            const overlaps = Math.hypot(sx - 500, sy - 500) < 75;
            expect(w.x[0] !== sx || w.y[0] !== sy).toBe(overlaps);
        }
    });
});
