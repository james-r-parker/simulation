import { describe, expect, it } from 'vitest';
import { HERD, KIND_STRIDE, LOCAL_STRIDE, OX, OY, RANGE, gatherNear } from '../../js/sim/ray-gather.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';
import { addAgent, addCloud, addFood, rebuild, senseWorld } from './helpers/sense-world.js';

const VISION = 300;

/**
 * @param {ReturnType<typeof senseWorld>} w the world
 * @param {number} me the casting slot
 * @returns {number[]} the gathered keys, as listed
 */
function gather(w, me) {
    const hash = rebuild(w);
    w.rayScratch[OX] = w.x[me];
    w.rayScratch[OY] = w.y[me];
    w.rayScratch[RANGE] = VISION;
    const count = gatherNear(w, hash, me);
    return Array.from({ length: count }, (_, n) => w.rayLocal[n * LOCAL_STRIDE + 3]);
}

describe('gatherNear', () => {
    it('lists a near agent, food and cloud once each and never the caster', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        const other = addAgent(w, 600, 500, 20);
        const food = addFood(w, 500, 650, 10);
        const cloud = addCloud(w, 400, 500);
        expect(gather(w, me).sort()).toEqual([food, KIND_STRIDE + other, 4 * KIND_STRIDE + cloud].sort());
    });

    it('lists a live herd body as an obstacle-channel hit kind', () => {
        const w = senseWorld({ herdCount: 1, herdSize: 1 });
        const me = addAgent(w, 500, 500, 20);
        w.herdAlive[0] = 1;
        w.herdX[0] = 650;
        w.herdY[0] = 500;
        expect(gather(w, me)).toEqual([HERD * KIND_STRIDE]);
    });

    it('leaves out a circle whose surface is beyond the range', () => {
        const w = senseWorld();
        const me = addAgent(w, 100, 100, 20);
        addAgent(w, 100 + VISION + 60, 100, 20);
        addFood(w, 100, 100 + VISION + 15, 10);
        expect(gather(w, me)).toEqual([]);
    });

    it('lists a circle spanning several hash cells once', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        const big = addAgent(w, 640, 640, 70);
        expect(gather(w, me)).toEqual([KIND_STRIDE + big]);
    });

    it('keeps listing each circle once after the stamp counter wraps', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        const other = addAgent(w, 600, 500, 20);
        const STAMP = 3;
        w.rayScratch[STAMP] = 2147483000 - 1;
        w.rayStamp.fill(7);
        expect(gather(w, me)).toEqual([KIND_STRIDE + other]);
        expect(w.rayScratch[STAMP]).toBe(1);
        expect(gather(w, me)).toEqual([KIND_STRIDE + other]);
    });

    it('lists the same circles on repeated gathers', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        const other = addAgent(w, 600, 500, 20);
        expect(gather(w, me)).toEqual(gather(w, me));
        expect(gather(w, other)).toEqual([KIND_STRIDE + me]);
    });

    it.each(Array.from({ length: 10 }, (_, i) => i + 1))('covers every circle within range on seed %i', (seed) => {
        const rng = createRng(seed);
        const w = senseWorld({ maxAgents: 12, maxFood: 40 });
        const place = () => 20 + nextFloat(rng) * 960;
        for (let i = 0; i < 12; i++) {
            addAgent(w, place(), place(), 10 + nextFloat(rng) * 40);
        }
        for (let i = 0; i < 40; i++) {
            addFood(w, place(), place(), 5 + nextFloat(rng) * 25);
        }
        const keys = gather(w, 0);
        expect(new Set(keys).size).toBe(keys.length);
        for (let a = 1; a < 12; a++) {
            const near = Math.hypot(w.x[a] - w.x[0], w.y[a] - w.y[0]) - w.size[a] <= VISION - 1;
            expect(!near || keys.includes(KIND_STRIDE + a)).toBe(true);
        }
        for (let f = 0; f < 40; f++) {
            const near = Math.hypot(w.foodX[f] - w.x[0], w.foodY[f] - w.y[0]) - w.foodRadius[f] <= VISION - 1;
            expect(!near || keys.includes(f)).toBe(true);
        }
    });
});
