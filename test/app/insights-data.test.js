import { describe, expect, it } from 'vitest';
import {
    createInsightsData,
    FLOW_SEASONS,
    grouped,
    noteInsightStats,
    readyInsights,
    worldView,
} from '../../js/app/insights-data.js';
import { ready } from './helpers/interface-setup.js';

const SEASON = ready.info.seasonLength;

/** @param {Record<string, any>} [more] fields over a stats fixture @returns {Record<string, any>} a stats message */
function stats(more = {}) {
    return {
        tick: 100,
        ticksPerSecond: 58.4,
        requestedTicksPerSecond: 120,
        season: 1,
        seasonProgress: 0.25,
        population: 1234,
        bySpec: [900, 300, 20, 10, 4],
        predators: 300,
        foodEnergy: 52000,
        meanTemperature: 41,
        birthsByCause: [0, 5, 2, 0, 1],
        deathsByCause: [3, 4, 0, 1, 0, 0, 0],
        ...more,
    };
}

/** @returns {ReturnType<typeof createInsightsData>} data for the fixture world */
function started() {
    const data = createInsightsData();
    readyInsights(data, ready);
    return data;
}

describe('worldView', () => {
    it('is empty before a world and before the first stats', () => {
        expect(worldView(createInsightsData())).toEqual({ readings: [], population: [], births: [], deaths: [] });
        const data = started();
        expect(worldView(data).readings).toEqual([]);
        expect(worldView(data).population.map((r) => r.cells)).toEqual([
            ['forager', '0'],
            ['predator', '0'],
            ['reproducer', '0'],
            ['scout', '0'],
            ['defender', '0'],
        ]);
    });

    it('reads the readings from the newest stats', () => {
        const data = started();
        noteInsightStats(data, stats());
        const readings = Object.fromEntries(worldView(data).readings);
        expect(readings).toEqual({
            season: 'Summer, year 1 (25%)',
            'mean body temperature': '41.00 (optimal)',
            'food energy': '52,000',
            'hunters alive': '300',
            population: '1,234',
            tick: '100',
            'sim speed': 'x2',
            'ticks per second': '58',
        });
        expect(worldView(data).population.map((r) => r.cells)).toContainEqual(['predator', '300']);
    });

    it('reads a message without the optional readings as zero', () => {
        const data = started();
        noteInsightStats(data, { tick: 0, ticksPerSecond: 60 });
        const readings = Object.fromEntries(worldView(data).readings);
        expect(readings['food energy']).toBe('0');
        expect(readings['mean body temperature']).toBe('0.00 (cold stress)');
        expect(readings['sim speed']).toBe('x0');
    });

    it('leaves the band off when the world gives no temperature thresholds', () => {
        const data = createInsightsData();
        readyInsights(data, { ...ready, info: { ...ready.info, temperatureOptimalMin: undefined } });
        noteInsightStats(data, stats());
        expect(Object.fromEntries(worldView(data).readings)['mean body temperature']).toBe('41.00');
    });
});

describe('births and deaths per season', () => {
    it('sums each message into the season it came in and leaves out the starting population', () => {
        const data = started();
        noteInsightStats(data, stats({ tick: 10 }));
        noteInsightStats(data, stats({ tick: 20 }));
        const { births, deaths } = worldView(data);
        expect(births.map((r) => r.cells)).toEqual([
            ['mate', '10', '-', '-', '-'],
            ['split', '4', '-', '-', '-'],
            ['floor', '0', '-', '-', '-'],
            ['immigrant', '2', '-', '-', '-'],
        ]);
        expect(deaths[0].cells).toEqual(['starved', '6', '-', '-', '-']);
        expect(deaths.map((r) => r.cells[0])).toContain('old age');
    });

    it('starts a new column each season and forgets the seasons beyond the fourth', () => {
        const data = started();
        for (let season = 0; season < FLOW_SEASONS + 1; season++) {
            noteInsightStats(data, stats({ tick: season * SEASON + 1, birthsByCause: [0, season + 1, 0, 0, 0] }));
        }
        expect(worldView(data).births[0].cells).toEqual(['mate', '5', '4', '3', '2']);
    });

    it('empties every bucket a long gap skipped', () => {
        const data = started();
        noteInsightStats(data, stats({ tick: 1 }));
        noteInsightStats(data, stats({ tick: 9 * SEASON, birthsByCause: [0, 1, 0, 0, 0] }));
        expect(worldView(data).births[0].cells).toEqual(['mate', '1', '0', '0', '0']);
    });

    it('keeps the newest season when an earlier tick arrives, and copes with missing cause lists', () => {
        const data = started();
        noteInsightStats(data, stats({ tick: 2 * SEASON }));
        noteInsightStats(data, { tick: 5, ticksPerSecond: 1 });
        expect(data.season).toBe(2);
        expect(worldView(data).births[0].cells).toEqual(['mate', '5', '0', '0', '-']);
    });

    it('copes with a world that has no layout or season length', () => {
        const data = createInsightsData();
        readyInsights(data, {});
        noteInsightStats(data, { tick: 5, ticksPerSecond: 1 });
        expect(worldView(data)).toEqual({ readings: expect.any(Array), population: [], births: [], deaths: [] });
    });
});

describe('grouped', () => {
    it('puts separators in the thousands', () => {
        expect(grouped(1234567.4)).toBe('1,234,567');
        expect(grouped(12)).toBe('12');
    });
});
