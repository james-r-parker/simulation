import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { BORN_CAUSE, EVENT_STRIDE, EVENT_TYPE } from '../../js/sim/events.js';
import { createRng, fork, nextFloat } from '../../js/sim/rng.js';
import { createWorld, placeClear, spawnAgent, spawnFoodItem } from '../../js/sim/spawn.js';
import { TIMER_CAP } from '../../js/sim/world.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { fixedSpecPolicy, testPolicy } from './helpers/test-policy.js';

const SMALL = {
    worldWidth: 1000,
    worldHeight: 1000,
    maxAgents: 12,
    initialAgents: 6,
    minAgents: 0,
    rayCount: 4,
    brainHidden: 3,
    maxFood: 20,
    initialFood: 10,
    obstacleCount: 4,
    obstacleMinRadius: 20,
    obstacleMaxRadius: 60,
    fertileZoneMax: 3,
};

/**
 * @param {Record<string, any>} [over]
 * @returns {ReturnType<typeof createWorld>}
 */
function build(over = {}) {
    return createWorld(createConfig({ ...SMALL, ...over }), testPolicy);
}

/**
 * @param {ReturnType<typeof createWorld>} w
 * @param {number} x
 * @param {number} y
 * @param {number} r
 * @returns {boolean}
 */
function clearOfObstacles(w, x, y, r) {
    for (let i = 0; i < w.obsX.length; i++) {
        if (Math.hypot(x - w.obsX[i], y - w.obsY[i]) < w.obsRadius[i] + r) {
            return false;
        }
    }
    return true;
}

describe('createWorld', () => {
    it('gives the same layout for the same seed', () => {
        expect(hashWorld(build({ seed: 7 }))).toBe(hashWorld(build({ seed: 7 })));
    });

    it('gives a different layout for a different seed', () => {
        expect(hashWorld(build({ seed: 7 }))).not.toBe(hashWorld(build({ seed: 8 })));
    });

    it('creates the six named streams and the spatial hash', () => {
        const w = build();
        expect(Object.keys(w.rng).sort()).toEqual(
            ['brain-init', 'food', 'lifecycle', 'mutation', 'obstacles', 'spawn'].sort(),
        );
        expect(w.hash.cols).toBe(Math.ceil(1000 / w.config.hashCellSize));
    });

    it('spawns the initial food and agents', () => {
        const w = build();
        expect(w.foodCount).toBe(10);
        expect(w.population).toBe(6);
    });
});

describe('placeObstacles', () => {
    it('keeps every obstacle inside the world with a radius in range', () => {
        const w = build();
        for (let i = 0; i < 4; i++) {
            const r = w.obsRadius[i];
            expect(r).toBeGreaterThanOrEqual(20);
            expect(r).toBeLessThanOrEqual(60);
            expect(w.obsX[i]).toBeGreaterThanOrEqual(r);
            expect(w.obsX[i]).toBeLessThanOrEqual(1000 - r);
            expect(w.obsY[i]).toBeGreaterThanOrEqual(r);
            expect(w.obsY[i]).toBeLessThanOrEqual(1000 - r);
            expect(Math.hypot(w.obsVx[i], w.obsVy[i])).toBeLessThanOrEqual(w.config.obstacleMaxSpeed + 1e-6);
        }
    });

    it('draws exactly five values per obstacle from the obstacles stream', () => {
        const w = build({ initialFood: 0, initialAgents: 0 });
        const expected = fork(createRng(w.config.seed), 'obstacles');
        for (let i = 0; i < 4 * 5; i++) {
            nextFloat(expected);
        }
        expect(w.rng.obstacles.s).toEqual(expected.s);
    });
});

describe('spawnFoodItem', () => {
    it('keeps food clear of obstacles with energy within the variance', () => {
        const w = build({ initialFood: 0, maxFood: 400, highFoodChance: 0.5 });
        const c = w.config;
        for (let i = 0; i < 400; i++) {
            const s = spawnFoodItem(w);
            const high = w.foodRadius[s] === c.highFoodRadius;
            const base = high ? c.highFoodEnergy : c.foodEnergy;
            const variance = high ? c.highFoodEnergyVariance : c.foodEnergyVariance;
            expect(clearOfObstacles(w, w.foodX[s], w.foodY[s], w.foodRadius[s])).toBe(true);
            expect(Math.abs(w.foodValue[s] - base)).toBeLessThanOrEqual(variance);
            expect(w.foodAge[s]).toBe(0);
        }
        expect(w.foodCount).toBe(400);
    });

    it('takes the lowest free slot', () => {
        const w = build({ initialFood: 3 });
        w.foodAlive[1] = 0;
        w.foodCount -= 1;
        expect(spawnFoodItem(w)).toBe(1);
        expect(spawnFoodItem(w)).toBe(3);
    });

    it('lands inside the fertile zone when the chance is 1', () => {
        const w = build({ initialFood: 0, fertileZoneSpawnChance: 1, fertileZoneRadius: 50, obstacleCount: 0 });
        w.zoneAlive[1] = 1;
        w.zoneX[1] = 500;
        w.zoneY[1] = 500;
        w.zoneFertility[1] = 1;
        w.zoneAlive[2] = 1;
        w.zoneX[2] = 500;
        w.zoneY[2] = 500;
        w.zoneFertility[2] = 1;
        for (let i = 0; i < 15; i++) {
            const s = spawnFoodItem(w);
            expect(Math.hypot(w.foodX[s] - 500, w.foodY[s] - 500)).toBeLessThanOrEqual(50 + 1e-3);
        }
    });

    it('clamps zone food into the world', () => {
        const w = build({ initialFood: 0, fertileZoneSpawnChance: 1, fertileZoneRadius: 200, obstacleCount: 0 });
        w.zoneAlive[0] = 1;
        w.zoneFertility[0] = 1;
        for (let i = 0; i < 15; i++) {
            const s = spawnFoodItem(w);
            expect(w.foodX[s]).toBeGreaterThanOrEqual(w.foodRadius[s]);
            expect(w.foodY[s]).toBeGreaterThanOrEqual(w.foodRadius[s]);
        }
        w.zoneX[0] = 1000;
        w.zoneY[0] = 1000;
        for (let i = 0; i < 5; i++) {
            const s = spawnFoodItem(w);
            expect(w.foodX[s]).toBeLessThanOrEqual(1000 - w.foodRadius[s]);
            expect(w.foodY[s]).toBeLessThanOrEqual(1000 - w.foodRadius[s]);
        }
    });

    it('skips the zone roll when it is not chosen', () => {
        const w = build({ initialFood: 0, fertileZoneSpawnChance: 0, obstacleCount: 0 });
        w.zoneAlive[0] = 1;
        w.zoneFertility[0] = 1;
        w.zoneX[0] = 10;
        w.zoneY[0] = 10;
        expect(() => spawnFoodItem(w)).not.toThrow();
    });

    it('throws when the zone is covered by an obstacle', () => {
        const w = build({ initialFood: 0, fertileZoneSpawnChance: 1, fertileZoneRadius: 10, obstacleCount: 1 });
        w.obsX[0] = 500;
        w.obsY[0] = 500;
        w.obsRadius[0] = 400;
        w.zoneAlive[0] = 1;
        w.zoneFertility[0] = 1;
        w.zoneX[0] = 500;
        w.zoneY[0] = 500;
        expect(() => spawnFoodItem(w)).toThrow(/tick 0.*radius/);
    });

    it('throws when maxFood is reached', () => {
        const w = build({ initialFood: 20 });
        expect(() => spawnFoodItem(w)).toThrow(/maxFood/);
    });
});

describe('spawnAgent', () => {
    it('starts every cause at temperatureStart, including in a reused slot', () => {
        const w = build({ temperatureStart: 42, initialAgents: 1 });
        expect(w.temperature[0]).toBe(42);
        w.temperature[3] = 7;
        const slot = spawnAgent(w, testPolicy, BORN_CAUSE.FLOOR);
        expect(slot).toBe(1);
        w.alive[3] = 0;
        w.temperature.fill(9, 2);
        expect(spawnAgent(w, testPolicy, BORN_CAUSE.IMMIGRANT)).toBe(2);
        expect(w.temperature[2]).toBe(42);
    });

    it('numbers agents 1..n in order with lineage equal to genome', () => {
        const w = build();
        for (let s = 0; s < 6; s++) {
            expect(w.genomeId[s]).toBe(s + 1);
            expect(w.lineageId[s]).toBe(s + 1);
            expect(w.parentA[s]).toBe(0);
            expect(w.parentB[s]).toBe(0);
        }
        expect(w.nextId).toBe(7);
    });

    it('places agents clear of obstacles at initial energy with full timers', () => {
        const w = build();
        const c = w.config;
        for (let s = 0; s < 6; s++) {
            expect(clearOfObstacles(w, w.x[s], w.y[s], w.size[s])).toBe(true);
            expect(w.energy[s]).toBe(c.initialEnergy);
            expect(w.ateTimer[s]).toBe(TIMER_CAP);
            expect(w.bittenTimer[s]).toBe(TIMER_CAP);
            expect(w.temperature[s]).toBe(c.temperatureStart);
            expect(w.vx[s]).toBe(0);
            expect(w.vy[s]).toBe(0);
            expect(Math.abs(w.angle[s])).toBeLessThanOrEqual(Math.PI);
        }
        expect(w.ledger[0]).toBe(6 * c.initialEnergy);
        expect(w.ledger[1]).toBe(0);
    });

    it('pushes AgentBorn with the cause and fields', () => {
        const w = build();
        expect(w.events.count).toBe(6);
        for (let s = 0; s < 6; s++) {
            const f = Array.from(w.events.data.slice(s * EVENT_STRIDE, (s + 1) * EVENT_STRIDE));
            expect(f.slice(0, 9)).toEqual([
                EVENT_TYPE.AGENT_BORN,
                0,
                s,
                s + 1,
                s + 1,
                w.spec[s],
                0,
                0,
                BORN_CAUSE.INITIAL,
            ]);
        }
    });

    it('honours policy.initSpec', () => {
        const w = createWorld(createConfig(SMALL), fixedSpecPolicy(3));
        for (let s = 0; s < 6; s++) {
            expect(w.spec[s]).toBe(3);
        }
    });

    it.each([
        ['floor', BORN_CAUSE.FLOOR],
        ['immigrant', BORN_CAUSE.IMMIGRANT],
    ])('books %s energy and records the cause', (_name, cause) => {
        const w = build({ initialAgents: 0 });
        const slot = spawnAgent(w, testPolicy, cause);
        expect(w.events.data[8]).toBe(cause);
        expect(w.ledger[0]).toBe(w.config.initialEnergy);
        expect(w.alive[slot]).toBe(1);
    });

    it('rejects causes that are not spawn causes', () => {
        const w = build({ initialAgents: 0 });
        expect(() => spawnAgent(w, testPolicy, BORN_CAUSE.MATE)).toThrow(/cause/);
    });

    it('throws when the population is at maxAgents', () => {
        const w = build({ initialAgents: 12 });
        expect(() => spawnAgent(w, testPolicy, BORN_CAUSE.FLOOR)).toThrow(/maxAgents/);
    });
});

describe('placeClear', () => {
    it('throws naming the tick and radius when obstacles fill the world', () => {
        const w = build({ initialAgents: 0, initialFood: 0, obstacleCount: 1, placementTries: 5 });
        w.obsX[0] = 500;
        w.obsY[0] = 500;
        w.obsRadius[0] = 5000;
        expect(() => placeClear(w, w.rng.spawn, 30)).toThrow(/tick 0.*radius 30.*5 tries/);
    });

    it('writes the first clear point to world.point', () => {
        const w = build({ initialAgents: 0, initialFood: 0, obstacleCount: 0 });
        placeClear(w, w.rng.spawn, 25);
        expect(w.point[0]).toBeGreaterThanOrEqual(25);
        expect(w.point[1]).toBeLessThanOrEqual(975);
    });
});
