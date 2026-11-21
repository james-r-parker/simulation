import { describe, expect, it } from 'vitest';
import {
    autoDimAt,
    createNightDim,
    DIM_READ_MS,
    dimLevel,
    NIGHT_EASE_HOURS,
    NIGHT_FROM_HOUR,
    NIGHT_LEVEL,
    NIGHT_TO_HOUR,
} from '../../js/app/night-dim.js';

/**
 * @param {number} hour the local hour
 * @param {number} [minute] the local minute
 * @returns {number} that local time today, ms since the epoch
 */
const at = (hour, minute = 0) => new Date(2026, 10, 20, hour, minute).getTime();

describe('autoDimAt', () => {
    it('is 1 by day and the night level from an hour after 22:00 to an hour before 07:00', () => {
        for (const h of [7, 8, 12, 15.5, 21, 21.99]) {
            expect(autoDimAt(h), `${h}h`).toBe(1);
        }
        for (const h of [23, 23.5, 0, 3, 5, 6]) {
            expect(autoDimAt(h), `${h}h`).toBeCloseTo(NIGHT_LEVEL);
        }
    });

    it('eases down over the hour after 22:00 and up over the hour before 07:00, never below the night level', () => {
        expect(autoDimAt(NIGHT_FROM_HOUR)).toBe(1);
        expect(autoDimAt(NIGHT_FROM_HOUR + NIGHT_EASE_HOURS / 2)).toBeCloseTo((1 + NIGHT_LEVEL) / 2);
        expect(autoDimAt(NIGHT_TO_HOUR - NIGHT_EASE_HOURS / 2)).toBeCloseTo((1 + NIGHT_LEVEL) / 2);
        expect(autoDimAt(NIGHT_TO_HOUR)).toBe(1);
        let lastDown = 1;
        for (let h = 22; h <= 23; h += 0.05) {
            const level = autoDimAt(h);
            expect(level).toBeLessThanOrEqual(lastDown + 1e-12);
            expect(level).toBeGreaterThanOrEqual(NIGHT_LEVEL - 1e-12);
            lastDown = level;
        }
        let lastUp = NIGHT_LEVEL;
        for (let h = 6; h <= 7; h += 0.05) {
            const level = autoDimAt(h);
            expect(level).toBeGreaterThanOrEqual(lastUp - 1e-12);
            lastUp = level;
        }
    });
});

describe('dimLevel', () => {
    it('applies auto in TV mode only and a fixed level always', () => {
        expect(dimLevel({ mode: 'auto', hours: 2, tv: true })).toBeCloseTo(NIGHT_LEVEL);
        expect(dimLevel({ mode: 'auto', hours: 2, tv: false })).toBe(1);
        expect(dimLevel({ mode: 'auto', hours: 12, tv: true })).toBe(1);
        expect(dimLevel({ mode: 0.4, hours: 12, tv: false })).toBe(0.4);
        expect(dimLevel({ mode: 0.4, hours: 2, tv: true })).toBe(0.4);
    });
});

describe('createNightDim', () => {
    /**
     * @param {{wall: number, mode?: 'auto' | number, tv?: boolean}} start the clock, the setting and TV mode
     * @returns {{dim: ReturnType<typeof createNightDim>, set: Record<string, any>, applied: number[], reads: {n: number}}} the dim and what it did
     */
    function make({ wall, mode = 'auto', tv = true }) {
        const set = { wall, mode, tv };
        const applied = /** @type {number[]} */ ([]);
        const reads = { n: 0 };
        const dim = createNightDim({
            now: () => {
                reads.n++;
                return set.wall;
            },
            getMode: () => set.mode,
            isTv: () => set.tv,
            apply: (level) => void applied.push(level),
        });
        return { dim, set, applied, reads };
    }

    it('dims at night in TV mode and leaves a daytime screen alone', () => {
        const day = make({ wall: at(13) });
        day.dim.tick();
        expect(day.applied).toEqual([]);
        expect(day.dim.level()).toBe(1);
        const night = make({ wall: at(2, 30) });
        night.dim.tick();
        expect(night.applied).toHaveLength(1);
        expect(night.applied[0]).toBeCloseTo(NIGHT_LEVEL);
        expect(night.dim.level()).toBeCloseTo(NIGHT_LEVEL);
    });

    it('follows the clock: dims as 22:00 passes and brightens by 07:00', () => {
        const w = make({ wall: at(21, 55) });
        w.dim.tick();
        expect(w.applied).toEqual([]);
        w.set.wall = at(22, 30);
        w.dim.tick();
        expect(w.applied).toHaveLength(1);
        expect(w.applied[0]).toBeLessThan(0.9);
        w.set.wall = at(6, 59);
        w.dim.tick();
        expect(w.applied.at(-1)).toBeGreaterThan(0.9);
        w.set.wall = at(7, 1);
        w.dim.tick();
        expect(w.applied.at(-1)).toBe(1);
        expect(w.dim.level()).toBe(1);
    });

    it('applies a change of TV mode or setting at once, and a fixed level in any mode', () => {
        const w = make({ wall: at(3), tv: false });
        w.dim.tick();
        expect(w.applied).toEqual([]);
        w.set.tv = true;
        w.dim.tick();
        expect(w.applied).toHaveLength(1);
        w.set.mode = 0.8;
        w.dim.tick();
        expect(w.applied.at(-1)).toBe(0.8);
        w.set.tv = false;
        w.dim.tick();
        expect(w.applied.at(-1)).toBe(0.8);
        expect(w.applied).toHaveLength(2);
        w.set.mode = 'auto';
        w.dim.tick();
        expect(w.applied.at(-1)).toBe(1);
    });

    it('reads the clock at most once an interval while nothing changes', () => {
        const w = make({ wall: at(3) });
        w.dim.tick();
        const after = w.reads.n;
        for (let k = 0; k < 100; k++) {
            w.set.wall += 50;
            w.dim.tick();
        }
        expect(w.applied).toHaveLength(1);
        expect(w.reads.n - after).toBe(100);
        w.set.wall += DIM_READ_MS;
        w.dim.tick();
        expect(w.applied).toHaveLength(1);
    });
});
