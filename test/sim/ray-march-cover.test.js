import { describe, expect, it } from 'vitest';
import { RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { COVER_TOTALS } from '../../js/sim/cover.js';
import { castRays } from '../../js/sim/ray-march.js';
import { addAgent, addFood, rebuild, senseWorld } from './helpers/sense-world.js';

const VISION = 300;

/**
 * @param {ReturnType<typeof senseWorld>} w the world
 * @param {number} slot the casting agent
 * @returns {number} the proximity its ray 0 reports
 */
function proximity(w, slot) {
    castRays(w, rebuild(w), slot);
    return w.inputs[slot * w.layout.rawInputCount];
}

/**
 * @param {Record<string, any>} over config overrides
 * @returns {{w: ReturnType<typeof senseWorld>, me: number, hidden: number}} a caster facing an agent 100 px ahead
 */
function scene(over) {
    const w = senseWorld(over);
    const me = addAgent(w, 500, 500, 20);
    const hidden = addAgent(w, 600, 500, 20);
    return { w, me, hidden };
}

describe('castRays with coverConceals', () => {
    it('skips an agent inside a ring when the caster is outside every ring', () => {
        const { w, me, hidden } = scene({ coverConceals: true });
        w.coverRing[hidden] = 1;
        expect(proximity(w, me)).toBe(0);
        expect(w.inputs.subarray(me * w.layout.rawInputCount, me * w.layout.rawInputCount + RAY_CHANNELS)).toEqual(
            new Float32Array(RAY_CHANNELS),
        );
    });

    it('sees the agent from inside the same ring', () => {
        const { w, me, hidden } = scene({ coverConceals: true });
        w.coverRing[hidden] = 1;
        w.coverRing[me] = 1;
        expect(proximity(w, me)).toBeCloseTo(1 - 80 / VISION, 6);
    });

    it('skips the agent from inside a different ring', () => {
        const { w, me, hidden } = scene({ coverConceals: true });
        w.coverRing[hidden] = 1;
        w.coverRing[me] = 2;
        expect(proximity(w, me)).toBe(0);
    });

    it('sees an agent outside every ring as before', () => {
        const { w, me } = scene({ coverConceals: true });
        expect(proximity(w, me)).toBeCloseTo(1 - 80 / VISION, 6);
    });

    it('finds the agent behind the concealed one, and the food behind it', () => {
        const { w, me, hidden } = scene({ coverConceals: true });
        w.coverRing[hidden] = 1;
        const behind = addAgent(w, 700, 500, 20);
        expect(proximity(w, me)).toBeCloseTo(1 - 180 / VISION, 6);
        w.alive[behind] = 0;
        addFood(w, 750, 500, 20);
        expect(proximity(w, me)).toBeCloseTo(1 - 230 / VISION, 6);
    });

    it('counts each concealed hit', () => {
        const { w, me, hidden } = scene({ coverConceals: true });
        w.coverRing[hidden] = 1;
        castRays(w, rebuild(w), me);
        expect(w.coverTotals[COVER_TOTALS.CONCEALED_HITS]).toBe(1);
    });

    it('leaves the rays as they were with the switch off, whatever the ring bytes say', () => {
        const { w, me, hidden } = scene({});
        w.coverRing[hidden] = 1;
        expect(proximity(w, me)).toBeCloseTo(1 - 80 / VISION, 6);
        expect(w.coverTotals[COVER_TOTALS.CONCEALED_HITS]).toBe(0);
    });
});
