import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { detCos, detSin } from '../../js/sim/det-math.js';
import { createRng, fork, nextFloat } from '../../js/sim/rng.js';
import { createWorld, placeClear, spawnFoodItem } from '../../js/sim/spawn.js';
import { testPolicy } from './helpers/test-policy.js';

const TWO_PI = 6.283185307179586;
const SEED = 99;

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {ReturnType<typeof createWorld>} an empty 1000x1000 world with no obstacles
 */
function empty(over = {}) {
    return createWorld(
        createConfig({
            seed: SEED,
            worldWidth: 1000,
            worldHeight: 1000,
            maxAgents: 4,
            initialAgents: 0,
            minAgents: 0,
            rayCount: 4,
            brainHidden: 3,
            maxFood: 10,
            foodEnergy: 70,
            initialFood: 0,
            obstacleCount: 0,
            fertileZoneMax: 4,
            fertileZoneRadius: 50,
            ...over,
        }),
        testPolicy,
    );
}

/**
 * @param {string} name the stream name
 * @param {number} n how many floats
 * @returns {number[]} the first n floats of a fresh copy of the named stream
 */
function peek(name, n) {
    const rng = fork(createRng(SEED), name);
    return Array.from({ length: n }, () => nextFloat(rng));
}

/**
 * @param {ReturnType<typeof createWorld>} w the world
 * @param {number} zone the zone index
 * @param {number} x centre x
 * @param {number} y centre y
 * @param {number} fertility the fertility
 * @param {number} [alive] the alive flag
 * @returns {void}
 */
function setZone(w, zone, x, y, fertility, alive = 1) {
    w.zoneAlive[zone] = alive;
    w.zoneX[zone] = x;
    w.zoneY[zone] = y;
    w.zoneFertility[zone] = fertility;
}

describe('placeObstacles draws', () => {
    it('derives radius, position and velocity from the obstacles stream in order', () => {
        const c = { obstacleCount: 3, obstacleMinRadius: 20, obstacleMaxRadius: 60, obstacleMaxSpeed: 2 };
        const w = empty(c);
        const u = peek('obstacles', 15);
        for (let i = 0; i < 3; i++) {
            const [a, b, d, e, f] = u.slice(i * 5, i * 5 + 5);
            const radius = 20 + a * 40;
            const heading = e * TWO_PI;
            const speed = f * 2;
            expect(w.obsRadius[i]).toBeCloseTo(radius, 3);
            expect(w.obsX[i]).toBeCloseTo(radius + b * (1000 - 2 * radius), 3);
            expect(w.obsY[i]).toBeCloseTo(radius + d * (1000 - 2 * radius), 3);
            expect(w.obsVx[i]).toBeCloseTo(speed * detCos(heading), 5);
            expect(w.obsVy[i]).toBeCloseTo(speed * detSin(heading), 5);
        }
    });
});

describe('placeClear sampling', () => {
    /**
     * @param {number} radius circle radius
     * @param {number} n points
     * @returns {number[][]} the first n candidate points of seed 5 in a 1000x1000 world
     */
    function candidates(radius, n) {
        const rng = createRng(5);
        return Array.from({ length: n }, () => [
            radius + nextFloat(rng) * (1000 - 2 * radius),
            radius + nextFloat(rng) * (1000 - 2 * radius),
        ]);
    }

    /**
     * @param {any} w the world
     * @param {number} x obstacle x
     * @param {number} y obstacle y
     * @param {number} r obstacle radius
     * @returns {void}
     */
    function setObstacle(w, x, y, r) {
        w.obsX = new Float64Array([x]);
        w.obsY = new Float64Array([y]);
        w.obsRadius = new Float64Array([r]);
    }

    it('samples x then y over the inset world and keeps the first clear point', () => {
        const w = empty();
        const rng = createRng(5);
        placeClear(w, rng, 30);
        const [[x, y]] = candidates(30, 1);
        expect([w.point[0], w.point[1]]).toEqual([x, y]);
    });

    it('rejects a blocked point and returns the next one', () => {
        const w = empty();
        const [[x1, y1], [x2, y2]] = candidates(10, 2);
        setObstacle(w, x1, y1, 30);
        const rng = createRng(5);
        placeClear(w, rng, 10);
        expect([w.point[0], w.point[1]]).toEqual([x2, y2]);
        const after = createRng(5);
        for (let i = 0; i < 4; i++) {
            nextFloat(after);
        }
        expect(Array.from(rng.s)).toEqual(Array.from(after.s));
    });

    it('measures distance on both axes', () => {
        const [[x, y]] = candidates(0, 1);
        const alongX = empty();
        setObstacle(alongX, x + 30, y, 20);
        placeClear(alongX, createRng(5), 0);
        expect([alongX.point[0], alongX.point[1]]).toEqual([x, y]);
        const alongY = empty();
        setObstacle(alongY, x, y + 30, 20);
        placeClear(alongY, createRng(5), 0);
        expect([alongY.point[0], alongY.point[1]]).toEqual([x, y]);
    });

    it('treats a point exactly touching an obstacle as clear', () => {
        const [[x, y]] = candidates(0, 1);
        const w = empty();
        const obsY = y + 25;
        setObstacle(w, x, obsY, Math.abs(y - obsY));
        placeClear(w, createRng(5), 0);
        expect([w.point[0], w.point[1]]).toEqual([x, y]);
    });

    it('stops after exactly placementTries attempts with the documented message', () => {
        const w = empty({ placementTries: 5 });
        setObstacle(w, 500, 500, 5000);
        const rng = createRng(5);
        expect(() => placeClear(w, createRng(5), 30)).toThrow(Error);
        expect(() => placeClear(w, rng, 30)).toThrow(
            'placement failed at tick 0: no point clear of obstacles for radius 30 in 5 tries',
        );
        const after = createRng(5);
        for (let i = 0; i < 10; i++) {
            nextFloat(after);
        }
        expect(Array.from(rng.s)).toEqual(Array.from(after.s));
    });
});

describe('spawnFoodItem draws', () => {
    it('with no fertile zone draws chance, position and variance without a zone roll', () => {
        const w = empty({ fertileZoneSpawnChance: 1 });
        const [hi, px, py, v] = peek('food', 4);
        const s = spawnFoodItem(w);
        expect(hi).toBeGreaterThan(0.1);
        expect(w.foodRadius[s]).toBe(20);
        expect(w.foodX[s]).toBeCloseTo(20 + px * 960, 3);
        expect(w.foodY[s]).toBeCloseTo(20 + py * 960, 3);
        expect(w.foodValue[s]).toBeCloseTo(70 + (2 * v - 1) * 20, 9);
    });

    it('takes the high branch when the roll is below highFoodChance and not when it equals it', () => {
        const [hi, , px, py, v] = peek('food', 5);
        const high = empty({ highFoodChance: 1, fertileZoneSpawnChance: 0 });
        setZone(high, 0, 500, 500, 1);
        const s = spawnFoodItem(high);
        expect(high.foodRadius[s]).toBe(30);
        expect(high.foodX[s]).toBeCloseTo(30 + px * 940, 3);
        expect(high.foodY[s]).toBeCloseTo(30 + py * 940, 3);
        expect(high.foodValue[s]).toBeCloseTo(140 + (2 * v - 1) * 50, 9);
        const edge = empty({ highFoodChance: hi, fertileZoneSpawnChance: 0 });
        expect(edge.foodRadius[spawnFoodItem(edge)]).toBe(20);
    });

    it('skips the zone when the roll is not below fertileZoneSpawnChance', () => {
        const [, roll, px, py] = peek('food', 4);
        const w = empty({ fertileZoneSpawnChance: roll });
        setZone(w, 0, 900, 900, 1);
        const s = spawnFoodItem(w);
        expect(w.foodX[s]).toBeCloseTo(20 + px * 960, 3);
        expect(w.foodY[s]).toBeCloseTo(20 + py * 960, 3);
    });

    it('picks the zone by roulette over alive zones and places inside it', () => {
        const [, , target, ru, tu, v] = peek('food', 6);
        expect(target).toBeGreaterThan(0);
        expect(target).toBeLessThan(0.8);
        const w = empty({ fertileZoneSpawnChance: 1 });
        const rest = 1 - target;
        setZone(w, 0, 100, 100, 5, 0);
        setZone(w, 1, 200, 200, 2 * target);
        setZone(w, 2, 600, 400, rest);
        setZone(w, 3, 800, 800, rest);
        const s = spawnFoodItem(w);
        const r = 50 * Math.sqrt(ru);
        const theta = tu * TWO_PI;
        expect(w.foodX[s]).toBeCloseTo(600 + r * detCos(theta), 3);
        expect(w.foodY[s]).toBeCloseTo(400 + r * detSin(theta), 3);
        expect(w.foodValue[s]).toBeCloseTo(70 + (2 * v - 1) * 20, 9);
    });

    it('places uniformly after exactly placementTries zone attempts when an obstacle covers the zone', () => {
        const w = empty({ fertileZoneSpawnChance: 1, placementTries: 5, obstacleCount: 1 });
        w.obsX[0] = 500;
        w.obsY[0] = 500;
        w.obsRadius[0] = 400;
        setZone(w, 0, 500, 500, 1);
        const s = spawnFoodItem(w);
        // 3 draws (kind, chance, zone) and 5 zone attempts of 2 draws, then uniform samples until one is clear
        const after = fork(createRng(SEED), 'food');
        for (let i = 0; i < 13; i++) {
            nextFloat(after);
        }
        let x;
        let y;
        do {
            x = 20 + nextFloat(after) * 960;
            y = 20 + nextFloat(after) * 960;
        } while (Math.hypot(x - 500, y - 500) < 420);
        expect(w.foodX[s]).toBeCloseTo(x, 3);
        expect(w.foodY[s]).toBeCloseTo(y, 3);
        nextFloat(after);
        expect(Array.from(w.rng.food.s)).toEqual(Array.from(after.s));
    });

    it('names the tick and maxFood when no slot is free', () => {
        const w = empty({ maxFood: 2, initialFood: 2 });
        expect(() => spawnFoodItem(w)).toThrow(
            'spawnFoodItem: no free food slot at tick 0; foodCount is at maxFood (2)',
        );
    });
});
