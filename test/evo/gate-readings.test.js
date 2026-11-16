import { describe, expect, it } from 'vitest';
import { wilsonInterval } from '../../js/evo/binomial.js';
import { drillReadings } from '../../js/evo/gate-readings.js';

/**
 * @param {number} wins trials won
 * @param {Record<string, number>} [lossReasons] lost-trial reasons
 * @returns {import('../../js/evo/gate-readings.js').ReadingCell} a cell on 64 trials against random brains at 4 of 256
 */
const cell = (wins, lossReasons = {}) => ({
    winShare: wins / 64,
    wins,
    trials: 64,
    randomWins: 4,
    randomTrials: 256,
    lossReasons,
});

describe('drillReadings', () => {
    it('pools the champions of a drill and reads the edge against the random brains` high bound', () => {
        const rows = [
            { cells: { a: cell(40, { 'never-bit': 24 }), b: null } },
            { cells: { a: cell(30, { 'never-bit': 14, 'bit-lived': 20 }), b: null } },
            { cells: { a: cell(32), b: cell(10) } },
        ];
        const { a, b } = drillReadings(rows, 2, ['a', 'b']);
        const low = wilsonInterval(70, 128).low;
        expect(a.winShareLow).toBeCloseTo(low, 12);
        expect(a.edgeLow).toBeCloseTo(low - wilsonInterval(4, 256).high, 12);
        expect(a.winShareOverReference).toBeCloseTo(low / 0.5, 12);
        expect(a.lossShare['never-bit']).toBeCloseTo(38 / 58, 12);
        expect(a.lossShare['bit-lived']).toBeCloseTo(20 / 58, 12);
        expect(b).toEqual({ winShareLow: null, edgeLow: null, winShareOverReference: null, lossShare: {} });
    });

    it('has no reference reading when the reference won nothing or is absent', () => {
        const none = [{ cells: { a: cell(8) } }, { cells: { a: cell(0) } }];
        expect(drillReadings(none, 1, ['a']).a.winShareOverReference).toBeNull();
        expect(drillReadings([{ cells: { a: cell(8) } }], 1, ['a']).a.winShareOverReference).toBeNull();
    });

    it('reads a drill no row has as all null', () => {
        expect(drillReadings([], 0, ['x']).x.edgeLow).toBeNull();
    });
});
