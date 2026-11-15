import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { JINK_RANGE, evaderBrain, pursuerBrain, wrap } from '../../js/evo/chase-oracles.js';
import { arenaConfig, stageArena } from '../../js/evo/chase-arena.js';

const FORAGER = 0;
const PREDATOR = 1;

/**
 * @param {{x: number, y: number, angle?: number}} evader where the evader stands
 * @returns {Record<string, any>} a world with the pursuer at (4000, 4000) heading +x and the evader as given
 */
function pair(evader) {
    return stageArena(arenaConfig(), [
        { spec: PREDATOR, x: 4000, y: 4000, angle: 0 },
        { spec: FORAGER, angle: 0, ...evader },
    ]).world;
}
const out = (/** @type {Record<string, any>} */ w, /** @type {number} */ slot, /** @type {number} */ o) =>
    w.outputs[slot * OUTPUT_COUNT + o];

describe('wrap', () => {
    it('wraps into [-PI, PI)', () => {
        expect(wrap(3 * Math.PI)).toBeCloseTo(-Math.PI, 9);
        expect(wrap(-0.5)).toBeCloseTo(-0.5, 9);
        expect(wrap(2 * Math.PI + 0.25)).toBeCloseTo(0.25, 9);
    });
});

describe('pursuerBrain', () => {
    it('turns towards an evader on its positive side, thrusts, sprints and bites', () => {
        const w = pair({ x: 4100, y: 4100 });
        pursuerBrain({ pursuer: 0, evader: 1, sprint: true })(w);
        expect(out(w, 0, OUTPUT_INDEX.TURN)).toBeGreaterThan(0);
        expect([OUTPUT_INDEX.THRUST, OUTPUT_INDEX.SPRINT, OUTPUT_INDEX.BITE].map((o) => out(w, 0, o))).toEqual([
            1, 1, 1,
        ]);
        const other = pair({ x: 4100, y: 3900 });
        pursuerBrain({ pursuer: 0, evader: 1, sprint: false })(other);
        expect(out(other, 0, OUTPUT_INDEX.TURN)).toBeLessThan(0);
        expect(out(other, 0, OUTPUT_INDEX.SPRINT)).toBe(0);
    });
});

describe('evaderBrain', () => {
    it('runs directly away outside the jink range and never bites', () => {
        const facing = pair({ x: 4000 + 2 * JINK_RANGE, y: 4000, angle: Math.PI });
        evaderBrain({ pursuer: 0, evader: 1, sprint: true })(facing);
        expect(Math.abs(out(facing, 1, OUTPUT_INDEX.TURN))).toBe(1); // facing the pursuer, it turns about
        expect(out(facing, 1, OUTPUT_INDEX.BITE)).toBe(0);
        const away = pair({ x: 4000 + 2 * JINK_RANGE, y: 4000, angle: 0 });
        evaderBrain({ pursuer: 0, evader: 1, sprint: true })(away);
        expect(out(away, 1, OUTPUT_INDEX.TURN)).toBeCloseTo(0, 6);
    });

    it('breaks square across the pursuer on the side it stands once inside the range', () => {
        const upper = pair({ x: 4040, y: 4030, angle: 0 });
        evaderBrain({ pursuer: 0, evader: 1, sprint: true })(upper);
        expect(out(upper, 1, OUTPUT_INDEX.TURN)).toBe(1); // the pursuer heads +x and the evader is at +y
        const lower = pair({ x: 4040, y: 3970, angle: 0 });
        evaderBrain({ pursuer: 0, evader: 1, sprint: true })(lower);
        expect(out(lower, 1, OUTPUT_INDEX.TURN)).toBe(-1);
    });

    it('a jink range of 0 never breaks', () => {
        const w = pair({ x: 4040, y: 4030, angle: Math.atan2(30, 40) });
        evaderBrain({ pursuer: 0, evader: 1, sprint: true, jinkRange: 0 })(w);
        expect(out(w, 1, OUTPUT_INDEX.TURN)).toBeCloseTo(0, 5);
        evaderBrain({ pursuer: 0, evader: 1, sprint: true })(w);
        expect(out(w, 1, OUTPUT_INDEX.TURN)).toBe(1);
    });
});
