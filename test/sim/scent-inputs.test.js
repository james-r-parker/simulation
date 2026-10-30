import { describe, expect, it } from 'vitest';
import { RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { writeScentInputs } from '../../js/sim/scent-inputs.js';
import { HEARD_STRIDE } from '../../js/sim/world.js';
import { addAgent, senseWorld } from './helpers/sense-world.js';

const COLS = 10;

/**
 * @param {ReturnType<typeof senseWorld>} w the world
 * @param {number} slot the agent
 * @returns {number[]} body inputs 17 to 29
 */
function scent(w, slot) {
    writeScentInputs(w, slot);
    const base = slot * w.layout.rawInputCount + w.config.rayCount * RAY_CHANNELS + 17;
    return Array.from(w.inputs.subarray(base, base + 13));
}

/**
 * @param {ReturnType<typeof senseWorld>} w the world
 * @param {Float32Array} grid a pheromone grid
 * @param {number} x world x
 * @param {number} y world y
 * @param {number} value the value to store in the cell under the point
 * @returns {void}
 */
function setCell(w, grid, x, y, value) {
    grid[Math.floor(y / 100) * COLS + Math.floor(x / 100)] = value;
}

/**
 * The antenna points of an agent at `(x, y)` heading `a`, by plain trigonometry.
 * @param {number} x agent x
 * @param {number} y agent y
 * @param {number} a heading
 * @param {number} spread antennaAngle
 * @param {number} reach antennaReach
 * @returns {{left: number[], right: number[]}}
 */
function antennae(x, y, a, spread, reach) {
    return {
        left: [x + reach * Math.cos(a + spread), y + reach * Math.sin(a + spread)],
        right: [x + reach * Math.cos(a - spread), y + reach * Math.sin(a - spread)],
    };
}

describe('writeScentInputs antennae', () => {
    it('samples the left antenna at heading + antennaAngle and the right at heading - antennaAngle', () => {
        const w = senseWorld({ antennaAngle: 0.8, antennaReach: 150 });
        const me = addAgent(w, 500, 500, 20);
        const { left, right } = antennae(500, 500, 0, 0.8, 150);
        setCell(w, w.danger, left[0], left[1], 0.3);
        setCell(w, w.danger, right[0], right[1], 0.6);
        setCell(w, w.attack, left[0], left[1], 0.2);
        setCell(w, w.attack, right[0], right[1], 0.5);
        setCell(w, w.hunt, left[0], left[1], 0.1);
        setCell(w, w.hunt, right[0], right[1], 0.4);
        setCell(w, w.hunt, 500, 500, 0.9);
        const v = scent(w, me);
        expect(v.slice(0, 7)).toEqual([0.3, 0.6, 0.2, 0.5, 0.9, 0.1, 0.4].map(Math.fround));
    });

    it('turns the antennae with a rotated heading', () => {
        const w = senseWorld({ antennaAngle: 0.8, antennaReach: 150 });
        const me = addAgent(w, 500, 500, 20);
        w.angle[me] = 2.2;
        const { left, right } = antennae(500, 500, 2.2, 0.8, 150);
        setCell(w, w.danger, left[0], left[1], 0.7);
        setCell(w, w.attack, right[0], right[1], 0.25);
        const v = scent(w, me);
        expect([v[0], v[1], v[2], v[3]]).toEqual([0.7, 0, 0, 0.25].map(Math.fround));
    });

    it('follows antennaAngle and antennaReach from the config', () => {
        const w = senseWorld({ antennaAngle: Math.PI / 2, antennaReach: 200 });
        const me = addAgent(w, 500, 500, 20);
        setCell(w, w.danger, 500, 700, 0.5);
        setCell(w, w.danger, 500, 300, 0.25);
        const v = scent(w, me);
        expect([v[0], v[1]]).toEqual([0.5, 0.25]);
    });

    it('clamps an antenna beyond the world edge to the edge cell', () => {
        const w = senseWorld({ antennaAngle: 0.8, antennaReach: 150 });
        const me = addAgent(w, 30, 30, 20);
        w.angle[me] = Math.PI - 1e-9;
        w.danger[0] = 0.6;
        w.danger[COLS] = 0.2;
        const v = scent(w, me);
        expect([v[0], v[1]]).toEqual([0.6, 0.2].map(Math.fround));
    });

    it('clamps samples to 0..1', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        setCell(w, w.hunt, 500, 500, 4);
        expect(scent(w, me)[4]).toBe(1);
    });
});

describe('writeScentInputs heard calls', () => {
    /**
     * @param {ReturnType<typeof senseWorld>} w the world
     * @param {number} slot the hearer
     * @param {number} half 0 for the alarm half, 3 for the hunt half
     * @param {number[]} values loudness, `ux`, `uy`
     * @returns {void}
     */
    function hear(w, slot, half, values) {
        w.heard.set(values, slot * HEARD_STRIDE + half);
    }

    it('copies the loudness and rotates the direction into the hearer frame', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        hear(w, me, 0, [0.5, 0, 1]);
        let v = scent(w, me);
        expect(v.slice(7, 10)).toEqual([0.5, 0, 1]);
        w.angle[me] = Math.PI / 2;
        v = scent(w, me);
        expect(v[7]).toBe(0.5);
        expect(v[8]).toBeCloseTo(1, 6);
        expect(v[9]).toBeCloseTo(0, 6);
        w.angle[me] = Math.PI;
        v = scent(w, me);
        expect(v[8]).toBeCloseTo(0, 6);
        expect(v[9]).toBeCloseTo(-1, 6);
    });

    it('turns a world-frame direction by the heading, ahead = ux cH + uy sH and side = -ux sH + uy cH', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        const heading = 0.6;
        w.angle[me] = heading;
        const ux = Math.fround(Math.cos(1.1));
        const uy = Math.fround(Math.sin(1.1));
        hear(w, me, 3, [0.25, ux, uy]);
        const v = scent(w, me);
        expect(v[10]).toBe(0.25);
        expect(v[11]).toBeCloseTo(Math.cos(1.1 - heading), 5);
        expect(v[12]).toBeCloseTo(Math.sin(1.1 - heading), 5);
    });

    it('keeps the alarm and hunt halves apart', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        hear(w, me, 0, [0.5, 1, 0]);
        hear(w, me, 3, [0.75, 0, -1]);
        expect(scent(w, me).slice(7)).toEqual([0.5, 1, 0, 0.75, 0, -1]);
    });

    it('writes zeros for a call that is not heard', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        w.angle[me] = 1.3;
        w.inputs.fill(9);
        expect(scent(w, me).slice(7)).toEqual([0, 0, 0, 0, 0, 0]);
    });

    it('writes only offsets 17 to 29 of its own row', () => {
        const w = senseWorld();
        const me = addAgent(w, 500, 500, 20);
        const other = addAgent(w, 700, 700, 20);
        w.inputs.fill(9);
        writeScentInputs(w, me);
        const start = me * w.layout.rawInputCount + w.config.rayCount * RAY_CHANNELS + 17;
        const touched = Array.from(w.inputs).flatMap((v, i) => (v !== 9 ? [i] : []));
        expect(touched.every((i) => i >= start && i < start + 13)).toBe(true);
        expect(start + 16).toBe((me + 1) * w.layout.rawInputCount);
        expect(
            w.inputs
                .subarray(other * w.layout.rawInputCount, (other + 1) * w.layout.rawInputCount)
                .every((/** @type {number} */ v) => v === 9),
        ).toBe(true);
    });
});
