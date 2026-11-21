// The body lanes the ray march writes beside the hue (docs/designs/body-genes.md, "Raw lanes"); the classes and the
// proximity are in ray-march.test.js.
import { describe, expect, it } from 'vitest';
import { BODY_SENSE_LANES, BODY_SENSE_SCRATCH, bodySenseBegin, bodySenseOf } from '../../js/sim/body-sense.js';
import { castRays } from '../../js/sim/ray-march.js';
import { addAgent, addFood, rebuild, senseWorld } from './helpers/sense-world.js';

/**
 * @param {ReturnType<typeof senseWorld>} w
 * @param {number} slot
 */
function cast(w, slot) {
    castRays(w, rebuild(w), slot);
}

describe('castRays body lanes', () => {
    /**
     * @param {ReturnType<typeof senseWorld>} w
     * @param {number} slot
     * @param {number} ray
     * @returns {number[]} the ray's size, speed and closing lanes
     */
    const lanes = (w, slot, ray) => {
        const at = slot * w.config.rayCount + ray;
        return [w.raySize[at], w.raySpeed[at], w.rayClosing[at]];
    };

    it('writes the size, speed and closing of an agent hit, as bodySenseOf reads them', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        const them = addAgent(w, 600, 500, 10);
        w.vx[them] = -w.config.maxVelocity;
        cast(w, me);
        const out = new Float64Array(BODY_SENSE_SCRATCH);
        bodySenseBegin(w, me, out);
        bodySenseOf(w, them, out);
        expect(lanes(w, me, 0)).toEqual(Array.from(out.subarray(0, BODY_SENSE_LANES), Math.fround));
        expect(lanes(w, me, 0)[0]).toBeLessThan(0);
        expect(lanes(w, me, 0)[2]).toBeGreaterThan(0);
    });

    it('writes 0 on all three for a food hit, a wall, an obstacle and a ray that hits nothing', () => {
        const w = senseWorld({ rayCount: 8 });
        const me = addAgent(w, 500, 500, 20);
        addFood(w, 600, 500, 20);
        w.obsX[0] = 500;
        w.obsY[0] = 600;
        w.obsRadius[0] = 30;
        cast(w, me);
        for (let ray = 0; ray < 8; ray++) {
            expect(lanes(w, me, ray), `ray ${ray}`).toEqual([0, 0, 0]);
        }
    });

    it('clears the lanes when the body leaves the ray', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        const them = addAgent(w, 600, 500, 40);
        w.vx[them] = 1;
        cast(w, me);
        expect(lanes(w, me, 0)[0]).toBeGreaterThan(0);
        w.y[them] = 900;
        w.x[them] = 900;
        cast(w, me);
        expect(lanes(w, me, 0)).toEqual([0, 0, 0]);
    });
});
