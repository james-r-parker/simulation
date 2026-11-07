import { describe, expect, it } from 'vitest';
import { writeBodyInputs } from '../../js/sim/body-inputs.js';
import { BODY_INPUT, RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { refugeCentresOf, ringRadius } from '../../js/sim/terrain.js';
import { addAgent, senseWorld } from './helpers/sense-world.js';
import { smallWorld } from './helpers/small-world.js';

describe('refuge inputs', () => {
    /**
     * @param {Record<string, any>} over config overrides
     * @param {number[]} centres ring centres, x and y per ring
     * @returns {{w: ReturnType<typeof senseWorld>, slot: number, read: () => number[]}} an agent at (500, 500) facing +x
     */
    function sensing(over, centres) {
        const w = senseWorld({ ...over });
        const slot = addAgent(w, 500, 500, 25);
        w.refugeCentres = Float64Array.from(centres);
        const at = slot * w.layout.rawInputCount + w.config.rayCount * RAY_CHANNELS;
        const read = () => {
            writeBodyInputs(w, slot);
            return [BODY_INPUT.REFUGE_BEARING_SIN, BODY_INPUT.REFUGE_BEARING_COS, BODY_INPUT.REFUGE_NEAR].map(
                (k) => w.inputs[at + k],
            );
        };
        return { w, slot, read };
    }

    it.each([
        ['ahead', [900, 500], 0, 1],
        ['behind', [100, 500], 0, -1],
        ['to the +y side (sine +1)', [500, 900], 1, 0],
        ['to the -y side (sine -1)', [500, 100], -1, 0],
    ])('reports a ring %s as the bearing sine and cosine', (_name, centre, sin, cos) => {
        const [s, c] = sensing({}, centre).read();
        expect(s).toBeCloseTo(sin, 6);
        expect(c).toBeCloseTo(cos, 6);
    });

    it('measures the bearing from the heading, not from +x', () => {
        const { w, slot, read } = sensing({}, [900, 500]);
        w.angle[slot] = Math.PI / 2;
        const [s, c] = read();
        expect(s).toBeCloseTo(-1, 5);
        expect(c).toBeCloseTo(0, 5);
    });

    it('points at the nearest ring when there are two', () => {
        const [s, c] = sensing({}, [100, 500, 800, 500]).read();
        expect(s).toBeCloseTo(0, 6);
        expect(c).toBeCloseTo(1, 6);
    });

    it('is 1 inside a ring and falls linearly to 0 at refugeSenseRange from the edge', () => {
        const range = 1000;
        const { w, slot, read } = sensing({ refugeSenseRange: range }, [500, 500]);
        expect(read()[2]).toBe(1);
        const radius = ringRadius(w.config);
        w.x[slot] = 500 + radius + range / 4;
        expect(read()[2]).toBeCloseTo(0.75, 5);
        w.x[slot] = 500 + radius + range;
        expect(read()[2]).toBeCloseTo(0, 5);
        w.x[slot] = 500 + radius + 2 * range;
        expect(read()[2]).toBe(0);
    });

    it('is exactly 0 in all three when the world has no refuges', () => {
        const w = senseWorld({ refugeCount: 0 });
        const slot = addAgent(w, 500, 500, 25);
        writeBodyInputs(w, slot);
        const at = slot * w.layout.rawInputCount + w.config.rayCount * RAY_CHANNELS + BODY_INPUT.REFUGE_BEARING_SIN;
        expect(Array.from(w.inputs.subarray(at, at + 3))).toEqual([0, 0, 0]);
    });

    it('caches the real ring centres on the world at creation', () => {
        const w = smallWorld({ refugeCount: 2, worldWidth: 8000, worldHeight: 4000 });
        expect(w.refugeCentres.every((/** @type {number} */ v) => v > 0 && v < 8000)).toBe(true);
        expect(w.refugeCentres).toEqual(refugeCentresOf(w));
        expect(w.refugeCentres.length).toBe(4);
    });
});
