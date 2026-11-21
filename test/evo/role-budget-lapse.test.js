import { describe, expect, it } from 'vitest';
import { INTENT_WINDOW } from '../../js/sim/merit-state.js';
import { createLapse, lapseTicks, noteLapse } from '../../js/evo/role-budget-lapse.js';

/**
 * Plays a hunter on a line against `ticks` ticks of a script.
 * @param {{speed: (tick: number) => number, gap: (tick: number) => number, sight: number}} script the hunter's speed towards the
 *   prey and the centre gap each tick, and the sight
 * @param {number} ticks the ticks to play
 * @returns {ReturnType<typeof createLapse>} the tracker
 */
function play({ speed, gap, sight }, ticks) {
    const lapse = createLapse();
    for (let tick = 0; tick < ticks; tick++) {
        const h = { x: 0, y: 0, vx: speed(tick), vy: 0 };
        noteLapse(lapse, { h, p: { x: gap(tick), y: 0 }, tick, maxVelocity: 8, sight });
    }
    return lapse;
}

describe('lapseTicks', () => {
    it('is the run for a hunter that never closes: no chase opened, so no give-up is seen', () => {
        const lapse = play({ speed: () => 1, gap: () => 100, sight: 500 }, 100);
        expect(lapse.opened).toBe(-1);
        expect(lapseTicks(lapse, 100)).toBe(100);
    });

    it('is the run for a hunter that keeps closing on a prey it sees: the chase never lapses', () => {
        const lapse = play({ speed: () => 4, gap: () => 100, sight: 500 }, 250);
        expect(lapse.opened).toBe(5);
        expect(lapseTicks(lapse, 250)).toBe(250);
    });

    it('lapses INTENT_WINDOW ticks after the last open tick when the hunter stops closing (a quit)', () => {
        const lapse = play({ speed: (t) => (t < 10 ? 4 : 0), gap: () => 100, sight: 500 }, 250);
        // open while 6 of the last 10 ticks closed: through tick 13; the lapse is the first tick more than the window on
        expect(lapse.lastOpen).toBe(13);
        expect(lapseTicks(lapse, 250)).toBe(13 + INTENT_WINDOW + 1 + 1);
    });

    it('lapses INTENT_WINDOW ticks after the prey leaves the rays (lost), however fast the hunter goes', () => {
        const lapse = play({ speed: () => 4, gap: (t) => (t < 10 ? 30 : 1000), sight: 50 }, 250);
        expect(lapse.lastOpen).toBe(9 + INTENT_WINDOW);
        expect(lapseTicks(lapse, 250)).toBe(9 + INTENT_WINDOW + INTENT_WINDOW + 1 + 1);
    });

    it('ignores ticks after the lapse', () => {
        const lapse = play({ speed: (t) => (t < 10 ? 4 : 0), gap: () => 100, sight: 500 }, 60);
        const ended = lapse.ended;
        noteLapse(lapse, {
            h: { x: 0, y: 0, vx: 8, vy: 0 },
            p: { x: 100, y: 0 },
            tick: 61,
            maxVelocity: 8,
            sight: 500,
        });
        expect(lapse.ended).toBe(ended);
    });
});
