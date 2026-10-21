import { describe, expect, it } from 'vitest';
import { familyName } from '../../../js/app/renderer/colors.js';
import { calendarOf, statusLine, trendWord } from '../../../js/app/ui/status-line.js';

const WORLD = { seasonNames: ['spring', 'summer', 'autumn', 'winter'], seasonLength: 1000, seed: 7 };

describe('trendWord', () => {
    it('says growing above +5%, shrinking below -5% and steady between', () => {
        expect(trendWord(106, 100)).toBe('growing');
        expect(trendWord(105, 100)).toBe('steady');
        expect(trendWord(95, 100)).toBe('steady');
        expect(trendWord(94, 100)).toBe('shrinking');
        expect(trendWord(100, 100)).toBe('steady');
    });

    it('says steady when there is nothing to compare with', () => {
        expect(trendWord(50, null)).toBe('steady');
        expect(trendWord(50, 0)).toBe('steady');
    });
});

describe('calendarOf', () => {
    it('counts the year from the tick, names the season and reads the generation', () => {
        const stats = { tick: 9000, season: 1, generationMax: 41 };
        expect(calendarOf(stats, WORLD)).toEqual({ year: 3, season: 'Summer', generation: 41 });
        expect(calendarOf({ tick: 0, season: 0 }, WORLD)).toEqual({ year: 1, season: 'Spring', generation: 0 });
        expect(calendarOf({ tick: 3999, season: 3 }, WORLD).year).toBe(1);
        expect(calendarOf({ tick: 4000, season: 0 }, WORLD).year).toBe(2);
    });
});

describe('statusLine', () => {
    const stats = {
        tick: 9000,
        season: 1,
        population: 270,
        lineages: { top: [{ id: 4, share: 0.31 }] },
    };

    it('reads as one sentence with the season, year, population, trend and leader', () => {
        expect(statusLine({ stats, trend: 'growing', world: WORLD })).toBe(
            `Summer, year 3: 270 blobs and growing, ${familyName(7, 4)} leads with 31%`,
        );
    });

    it('leaves out the leader when no family is listed', () => {
        const line = statusLine({ stats: { ...stats, lineages: { top: [] } }, trend: 'steady', world: WORLD });
        expect(line).toBe('Summer, year 3: 270 blobs and steady');
    });

    it('says a world is starting before any stats arrive', () => {
        expect(statusLine({ stats: null, trend: 'steady', world: WORLD })).toBe('Starting a new world');
        expect(statusLine({ stats, trend: 'steady', world: null })).toBe('Starting a new world');
    });

    it('reports the replay while the worker seeks to a tick', () => {
        const line = statusLine({ stats: { ...stats, tick: 1500, seekTarget: 3000 }, trend: 'steady', world: WORLD });
        expect(line).toBe('Replaying to tick 3000: 50%');
    });
});
