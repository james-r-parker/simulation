import { describe, expect, it } from 'vitest';
import {
    createQuality,
    DOWN_AFTER_MS,
    LOOK_ALL,
    LOOK_ITEMS,
    LOOK_OFF,
    lookFor,
    lookItems,
    parseLook,
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
        expect(QUALITY_LEVELS[0]).toMatchObject({ bloom: true, bloomScale: 1, motes: 1 });
        expect(QUALITY_LEVELS[1]).toMatchObject({ bloom: true, bloomScale: 0.5, motes: 0.5 });
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

    it('starts at level 2 on a software renderer, and a pin still wins', () => {
        expect(createQuality({ software: true }).level).toBe(2);
        expect(createQuality({ software: true }).floor).toBe(0);
        expect(createQuality({ software: true, pinned: 0 }).level).toBe(0);
        expect(createQuality({ software: true, pinned: 1 }).level).toBe(1);
        expect(createQuality({ software: false }).level).toBe(0);
    });

    it('lets the rule step a software renderer up once it is fast', () => {
        const q = createQuality({ software: true });
        for (let t = 0; t <= UP_AFTER_MS + 1000; t += 500) {
            stepQuality(q, fast, t);
        }
        expect(q.level).toBe(1);
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

/** The Phase 6 quality-tier table: each item's tier at levels 0, 1 and 2. */
const TIERS = {
    rocks: [0, 1, 2],
    aurora: [0, 1, LOOK_OFF],
    terrain: [0, 1, LOOK_OFF],
    motion: [0, 1, LOOK_OFF],
    threads: [0, 1, LOOK_OFF],
    decay: [0, 1, 2],
    finish: [0, 1, LOOK_OFF],
    flora: [0, 1, LOOK_OFF],
};

describe('lookFor', () => {
    it('gives every item its tier-table column at every level with the full mask', () => {
        for (let level = 0; level < QUALITY_LEVELS.length; level++) {
            const look = lookFor(level, LOOK_ALL);
            for (const item of LOOK_ITEMS) {
                expect(look[/** @type {keyof typeof look} */ (item)], `${item} at level ${level}`).toBe(
                    TIERS[/** @type {keyof typeof TIERS} */ (item)][level],
                );
            }
        }
    });

    it('turns off exactly the items the mask leaves out, at every level and every single-item mask', () => {
        for (let level = 0; level < QUALITY_LEVELS.length; level++) {
            LOOK_ITEMS.forEach((item, bit) => {
                const look = lookFor(level, 1 << bit);
                const drawn = lookItems(look);
                const levelDraws = lookItems(lookFor(level, LOOK_ALL)).includes(item);
                expect(drawn).toEqual(levelDraws ? [item] : []);
            });
        }
    });

    it('draws nothing with the empty mask', () => {
        for (let level = 0; level < QUALITY_LEVELS.length; level++) {
            expect(lookItems(lookFor(level, 0))).toEqual([]);
        }
    });

    it('never adds an item from one level to the next, under every mask', () => {
        for (let mask = 0; mask <= LOOK_ALL; mask++) {
            for (let level = 1; level < QUALITY_LEVELS.length; level++) {
                const before = lookItems(lookFor(level - 1, mask));
                for (const item of lookItems(lookFor(level, mask))) {
                    expect(before).toContain(item);
                }
            }
        }
    });

    it('leaves the level table unchanged', () => {
        lookFor(0, 0);
        expect(lookItems(QUALITY_LEVELS[0].look)).toEqual([...LOOK_ITEMS]);
    });
});

describe('parseLook', () => {
    it('reads all, none and comma lists', () => {
        expect(parseLook('all')).toBe(LOOK_ALL);
        expect(parseLook('none')).toBe(0);
        expect(parseLook('aurora,decay')).toBe((1 << 1) | (1 << 5));
        expect(parseLook('aurora, decay')).toBe((1 << 1) | (1 << 5));
    });

    it('rejects an unknown or empty name', () => {
        expect(parseLook('flora')).toBe(1 << LOOK_ITEMS.indexOf('flora'));
        expect(parseLook('aurora,glitter')).toBeNull();
        expect(parseLook('')).toBeNull();
        expect(parseLook('rocks,')).toBeNull();
    });
});
