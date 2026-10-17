import { describe, expect, it } from 'vitest';
import {
    createQuality,
    DOWN_AFTER_MS,
    MAX_UP_WAIT_MS,
    QUALITY_LEVELS,
    stepQuality,
    supportsFloatTargets,
    UP_AFTER_MS,
} from '../../../js/app/renderer/quality.js';

const slow = { frames: 200, frameMs: { p95: 7 }, refreshMs: 4.17 };
const fast = { frames: 200, frameMs: { p95: 2 }, refreshMs: 4.17 };
const ok = { frames: 200, frameMs: { p95: 4.5 }, refreshMs: 4.17 };

/**
 * @param {ReturnType<typeof createQuality>} q the state
 * @param {typeof slow} report the report to repeat
 * @param {number} fromMs start
 * @param {number} forMs duration
 * @returns {number} the time after the run
 */
function hold(q, report, fromMs, forMs) {
    let t = fromMs;
    for (; t <= fromMs + forMs; t += 500) {
        stepQuality(q, report, t);
        if (q.changed) {
            return t;
        }
    }
    return t;
}

describe('quality levels', () => {
    it('level 0 is everything, 1 halves bloom and motes, 2 turns both off', () => {
        expect(QUALITY_LEVELS[0]).toEqual({ bloom: true, bloomScale: 1, motes: 1 });
        expect(QUALITY_LEVELS[1]).toEqual({ bloom: true, bloomScale: 0.5, motes: 0.5 });
        expect(QUALITY_LEVELS[2].bloom).toBe(false);
        expect(QUALITY_LEVELS[2].motes).toBe(0);
    });
});

describe('stepQuality', () => {
    it('steps down after 5 s with p95 over 1.5 x the budget, not before', () => {
        const q = createQuality();
        stepQuality(q, slow, 0);
        stepQuality(q, slow, DOWN_AFTER_MS - 1);
        expect(q.level).toBe(0);
        stepQuality(q, slow, DOWN_AFTER_MS);
        expect(q.level).toBe(1);
        expect(q.changed).toBe(true);
    });

    it('restarts the 5 s when a good report interrupts', () => {
        const q = createQuality();
        stepQuality(q, slow, 0);
        stepQuality(q, ok, 3000);
        stepQuality(q, slow, 4000);
        stepQuality(q, slow, 8000);
        expect(q.level).toBe(0);
        stepQuality(q, slow, 9000);
        expect(q.level).toBe(1);
    });

    it('steps up after 30 s under 0.6 x the budget', () => {
        const q = createQuality();
        q.level = 2;
        stepQuality(q, fast, 0);
        stepQuality(q, fast, UP_AFTER_MS - 1);
        expect(q.level).toBe(2);
        stepQuality(q, fast, UP_AFTER_MS);
        expect(q.level).toBe(1);
    });

    it('stops at the first and last level', () => {
        const q = createQuality();
        for (let t = 0; t < 60000; t += 500) {
            stepQuality(q, slow, t);
        }
        expect(q.level).toBe(2);
        for (let t = 0; t < 400000; t += 500) {
            stepQuality(q, fast, 100000 + t);
        }
        expect(q.level).toBe(0);
    });

    it('ignores reports with too few frames and a hidden tab, restarting the timers', () => {
        const q = createQuality();
        stepQuality(q, slow, 0);
        stepQuality(q, { ...slow, frames: 10 }, 4000);
        stepQuality(q, slow, 5000);
        expect(q.level).toBe(0);
        stepQuality(q, slow, 6000, false);
        stepQuality(q, slow, 20000, false);
        stepQuality(q, slow, 21000);
        expect(q.level).toBe(0);
    });

    it('holds a pinned level whatever the frames do', () => {
        const q = createQuality({ pinned: 1 });
        expect(q.level).toBe(1);
        for (let t = 0; t < 60000; t += 500) {
            stepQuality(q, slow, t);
        }
        expect(q.level).toBe(1);
        expect(createQuality({ pinned: 0 }).level).toBe(0);
        expect(createQuality({ pinned: 9 }).level).toBe(2);
    });

    it('holds level 2 when float render targets are missing, and a pin cannot lower it', () => {
        const q = createQuality({ floatTargets: false });
        expect(q.level).toBe(2);
        for (let t = 0; t < 100000; t += 500) {
            stepQuality(q, fast, t);
        }
        expect(q.level).toBe(2);
        expect(createQuality({ pinned: 0, floatTargets: false }).level).toBe(2);
    });

    it('doubles the wait before stepping up from the second reversal within 10 minutes, to at most 10 minutes', () => {
        const q = createQuality();
        let t = hold(q, slow, 0, 10000);
        expect(q.upWait).toBe(UP_AFTER_MS);
        t = hold(q, fast, t, UP_AFTER_MS + 1000);
        expect(q.level).toBe(0);
        expect(q.upWait).toBe(UP_AFTER_MS);
        t = hold(q, slow, t, 10000);
        expect(q.level).toBe(1);
        expect(q.upWait).toBe(2 * UP_AFTER_MS);
        t = hold(q, fast, t, 2 * UP_AFTER_MS + 1000);
        expect(q.level).toBe(0);
        expect(q.upWait).toBe(4 * UP_AFTER_MS);
        for (let i = 0; i < 6; i++) {
            t = hold(q, slow, t, 10000);
            t = hold(q, fast, t, MAX_UP_WAIT_MS + 1000);
        }
        expect(q.upWait).toBe(MAX_UP_WAIT_MS);
    });

    it('goes back to the base wait when a reversal comes more than 10 minutes after the last', () => {
        const q = createQuality();
        let t = hold(q, slow, 0, 10000);
        t = hold(q, fast, t, UP_AFTER_MS + 1000);
        t = hold(q, slow, t, 10000);
        expect(q.upWait).toBe(2 * UP_AFTER_MS);
        t = hold(q, ok, t, 700000);
        hold(q, fast, t, 2 * UP_AFTER_MS + 1000);
        expect(q.level).toBe(0);
        expect(q.upWait).toBe(UP_AFTER_MS);
    });
});

describe('supportsFloatTargets', () => {
    it('needs either float colour-buffer extension', () => {
        const has = (/** @type {string[]} */ names) => ({ has: (/** @type {string} */ n) => names.includes(n) });
        expect(supportsFloatTargets(has(['EXT_color_buffer_float']))).toBe(true);
        expect(supportsFloatTargets(has(['EXT_color_buffer_half_float']))).toBe(true);
        expect(supportsFloatTargets(has(['OES_texture_float']))).toBe(false);
    });
});
