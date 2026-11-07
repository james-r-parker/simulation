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
        expect(admitFx(b, who, 100, AT)).toBe(20);
        expect(b.spent).toBe(60);
        expect(b.dropped[FAMILY.combat]).toBe(80);
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
