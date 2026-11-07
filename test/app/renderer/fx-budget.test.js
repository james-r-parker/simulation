import { describe, expect, it } from 'vitest';
import {
    admitFx,
    BAND,
    beginFxFrame,
    countFor,
    createFxBudget,
    FAMILY,
    FAMILY_RATE,
    FRAME_CAP,
    FX_FAMILIES,
    FX_MIN_MS,
    fxStats,
    inFxView,
    lifeFor,
    LOG_EVERY_MS,
    logFxBudget,
    RANK,
    setFxLook,
    setFxQuality,
    VIEW_MARGIN,
    zoomBand,
    adaptFxBudget,
    MAX_SCALE,
    MIN_SCALE,
    TARGET_LOAD,
} from '../../../js/app/renderer/fx-budget.js';
import { LOOK_OFF } from '../../../js/app/renderer/quality.js';

const VIEW = { left: 0, right: 1000, top: 1000, bottom: 0 };
const AT = { x: 500, y: 500 };

/**
 * @param {Partial<{tick: number, dtMs: number, zoom: number}>} [over] frame fields
 * @returns {{tick: number, dtMs: number, zoom: number, view: typeof VIEW}} a frame
 */
function frame(over = {}) {
    return { tick: 0, dtMs: 16, zoom: 4, view: VIEW, ...over };
}

describe('zoomBand', () => {
    it('is far under 6 px, mid under 20 px, close from 20 px', () => {
        expect(zoomBand(0.59)).toBe(BAND.FAR);
        expect(zoomBand(0.6)).toBe(BAND.MID);
        expect(zoomBand(1.99)).toBe(BAND.MID);
        expect(zoomBand(2)).toBe(BAND.CLOSE);
        expect(zoomBand(1, 30)).toBe(BAND.CLOSE);
    });
});

describe('admitFx', () => {
    it('grants within the frame cap, which lower ranks may spend more of', () => {
        const b = createFxBudget();
        beginFxFrame(b, frame());
        const who = { family: FAMILY.combat, rank: RANK.kill };
        expect(admitFx(b, who, 40, AT)).toBe(40);
        expect(admitFx(b, { family: FAMILY.feeding, rank: RANK.eat }, 40, AT)).toBe(0);
        expect(admitFx(b, who, 100, AT)).toBe(FAMILY_RATE[FAMILY.combat] - 40);
        expect(b.spent).toBe(FAMILY_RATE[FAMILY.combat]);
        expect(b.dropped[FAMILY.combat]).toBe(140 - FAMILY_RATE[FAMILY.combat]);
        expect(b.dropped[FAMILY.feeding]).toBe(40);
    });

    it("a family's bucket holds one second and refills with frame time", () => {
        const b = createFxBudget();
        const who = { family: FAMILY.weather, rank: RANK.kill };
        let total = 0;
        for (let i = 0; i < 10; i++) {
            beginFxFrame(b, frame({ dtMs: 0 }));
            total += admitFx(b, who, 10, AT);
        }
        expect(total).toBe(FAMILY_RATE[FAMILY.weather]);
        beginFxFrame(b, frame({ dtMs: 500 }));
        expect(admitFx(b, who, 100, AT)).toBe(FAMILY_RATE[FAMILY.weather] / 2);
    });

    it('culls off view beyond the margin, and spawns nothing for a family switched off', () => {
        const b = createFxBudget();
        beginFxFrame(b, frame());
        const who = { family: FAMILY.combat, rank: 0 };
        expect(inFxView(b, -VIEW_MARGIN + 1, 500)).toBe(true);
        expect(admitFx(b, who, 5, { x: -VIEW_MARGIN - 1, y: 500 })).toBe(0);
        expect(b.culled[FAMILY.combat]).toBe(5);
        setFxLook(b, { combat: LOOK_OFF });
        expect(admitFx(b, who, 5, AT)).toBe(0);
        expect(b.dropped[FAMILY.combat]).toBe(0);
    });

    it('the frame cap follows the quality level', () => {
        const b = createFxBudget();
        setFxQuality(b, 2);
        beginFxFrame(b, frame());
        expect(admitFx(b, { family: FAMILY.combat, rank: 0 }, 100, AT)).toBe(FRAME_CAP[2]);
        setFxQuality(b, 9);
        expect(b.level).toBe(2);
    });
});

describe('countFor and lifeFor', () => {
    it('one lead instance far or at tier 2, half at mid or tier 1, a quarter at both', () => {
        const b = createFxBudget();
        setFxLook(b, { combat: 0, feeding: 1, calls: 2 });
        b.band = BAND.CLOSE;
        expect(countFor(b, FAMILY.combat, 7)).toBe(7);
        expect(countFor(b, FAMILY.feeding, 7)).toBe(4);
        expect(countFor(b, FAMILY.calls, 7)).toBe(1);
        b.band = BAND.MID;
        expect(countFor(b, FAMILY.combat, 7)).toBe(4);
        expect(countFor(b, FAMILY.feeding, 7)).toBe(2);
        b.band = BAND.FAR;
        expect(countFor(b, FAMILY.combat, 7)).toBe(1);
        expect(countFor(b, FAMILY.combat, 0)).toBe(0);
    });

    it('raises a life to the wall-time floor at x16', () => {
        const b = createFxBudget();
        beginFxFrame(b, frame({ tick: 0 }));
        for (let i = 1; i <= 200; i++) {
            beginFxFrame(b, frame({ tick: i * 4, dtMs: 1000 / 60 }));
        }
        expect(b.ticksPerMs).toBeCloseTo(0.24, 2);
        expect(lifeFor(b, 12)).toBeCloseTo(FX_MIN_MS * b.ticksPerMs);
        expect(lifeFor(b, 120)).toBe(120);
    });
});

describe('logFxBudget and fxStats', () => {
    it('logs drops and pool overwrites at most once per window', () => {
        const b = createFxBudget();
        /** @type {any[]} */
        const records = [];
        const log = (/** @type {any} */ _level, /** @type {string} */ event, /** @type {any} */ fields) =>
            records.push({ event, ...fields });
        beginFxFrame(b, frame());
        admitFx(b, { family: FAMILY.combat, rank: 0 }, 500, AT);
        expect(logFxBudget(b, { nowMs: LOG_EVERY_MS, overwrote: 3, capacity: 2048 }, log)).toBe(true);
        expect(logFxBudget(b, { nowMs: LOG_EVERY_MS + 1, overwrote: 9, capacity: 2048 }, log)).toBe(false);
        expect(logFxBudget(b, { nowMs: 2 * LOG_EVERY_MS, overwrote: 3, capacity: 2048 }, log)).toBe(false);
        expect(records.map((r) => r.event)).toEqual(['FxBudgetDropped', 'FxPoolSaturated']);
        expect(records[0].dropped).toBe(500 - FAMILY_RATE[FAMILY.combat]);
        expect(records[0].families).toEqual({ combat: 500 - FAMILY_RATE[FAMILY.combat] });
    });

    it('reports counts by family name', () => {
        const b = createFxBudget();
        const stats = fxStats(b);
        expect(Object.keys(stats)).toEqual([...FX_FAMILIES]);
        expect(stats.combat).toEqual({ spawned: 0, dropped: 0, culled: 0 });
    });
});

describe('adaptFxBudget', () => {
    /**
     * @param {any} b the budget
     * @param {{drawMs: number, gpuMs: number}} times the per-frame costs
     * @param {number} frames frames to run at 4.1 ms
     * @returns {number} the scale reached
     */
    function run(b, times, frames) {
        for (let i = 0; i < frames; i++) {
            adaptFxBudget(b, { ...times, intervalMs: 4.1, dtMs: 4.1 });
        }
        return b.scale;
    }

    it('scales the cap and the buckets up on a fast machine, toward TARGET_LOAD over the load', () => {
        const b = createFxBudget();
        const scale = run(b, { drawMs: 0.7, gpuMs: 1.1 }, 5000);
        expect(scale).toBeCloseTo(TARGET_LOAD / (1.1 / 4.1), 1);
        beginFxFrame(b, frame({ dtMs: 1000 }));
        const cap = Math.floor(FRAME_CAP[0] * scale);
        const tokens = Math.floor(FAMILY_RATE[FAMILY.combat] * scale);
        expect(admitFx(b, { family: FAMILY.combat, rank: 0 }, 1000, AT)).toBe(Math.min(cap, tokens));
        expect(b.tokens[FAMILY.feeding]).toBeCloseTo(FAMILY_RATE[FAMILY.feeding] * scale, 3);
    });

    it('sheds effects on a loaded machine, never below MIN_SCALE nor above MAX_SCALE', () => {
        const slow = createFxBudget();
        expect(run(slow, { drawMs: 6, gpuMs: 8 }, 5000)).toBeCloseTo(MIN_SCALE, 2);
        const idle = createFxBudget();
        expect(run(idle, { drawMs: 0.01, gpuMs: -1 }, 5000)).toBeCloseTo(MAX_SCALE, 2);
    });

    it('moves gradually and ignores frames with no measurement', () => {
        const b = createFxBudget();
        adaptFxBudget(b, { drawMs: 0.1, gpuMs: 0.1, intervalMs: 4, dtMs: 16 });
        expect(b.scale).toBeGreaterThan(1);
        expect(b.scale).toBeLessThan(1.1);
        const before = b.scale;
        adaptFxBudget(b, { drawMs: -1, gpuMs: -1, intervalMs: 0, dtMs: 16 });
        expect(b.scale).toBe(before);
    });
});

describe('logFxBudget: the scale', () => {
    it('logs FxBudgetScale once the scale has moved by SCALE_LOG_STEP', () => {
        const b = createFxBudget();
        /** @type {any[]} */
        const records = [];
        const log = (/** @type {any} */ _l, /** @type {string} */ event, /** @type {any} */ f) =>
            records.push({ event, ...f });
        b.scale = 1.2;
        logFxBudget(b, { nowMs: LOG_EVERY_MS, overwrote: 0, capacity: 2048 }, log);
        expect(records).toEqual([]);
        b.scale = 2;
        expect(logFxBudget(b, { nowMs: 2 * LOG_EVERY_MS, overwrote: 0, capacity: 2048 }, log)).toBe(true);
        expect(records).toEqual([{ event: 'FxBudgetScale', from: 1, to: 2, load: -1 }]);
    });
});
