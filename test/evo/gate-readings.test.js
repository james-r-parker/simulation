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

describe('drillReadings loss shares', () => {
    it('reads a reason that did not occur as 0, also when every trial won', () => {
        const won = { cells: { a: cell(64) } };
        expect(drillReadings([won], 1, ['a']).a.lossShare['never-bit']).toBe(0);
        const lost = { cells: { a: cell(32, { 'bit-prey-lived': 32 }) } };
        const share = drillReadings([lost], 1, ['a']).a.lossShare;
        expect(share['never-bit']).toBe(0);
        expect(share['bit-prey-lived']).toBe(1);
    });

    it('reads the kin-spared loss, a subject that wished to bite its sibling, as its own reason', () => {
        const kin = { cells: { a: cell(40, { 'bit-kin': 18, 'never-bit': 6 }) } };
        const share = drillReadings([kin], 1, ['a']).a.lossShare;
        expect(share['bit-kin']).toBeCloseTo(18 / 24, 12);
        expect(drillReadings([{ cells: { a: cell(64) } }], 1, ['a']).a.lossShare['bit-kin']).toBe(0);
    });
});

describe('a cell without lost-trial reasons', () => {
    it('reads as no reasons', () => {
        const bare = { winShare: 0.5, wins: 32, trials: 64, randomWins: 4, randomTrials: 256 };
        expect(drillReadings([{ cells: { a: bare } }], 1, ['a']).a.lossShare['never-bit']).toBe(0);
    });
});

describe('drillReadings of a drill with control arms', () => {
    const armed = (/** @type {number} */ wins, /** @type {number} */ solo, /** @type {number} */ blind) => ({
        ...cell(wins),
        arms: { solo: { wins: solo, trials: 64 }, 'kin-blind': { wins: blind, trials: 64 } },
    });

    it('reads the gain and the kin-blind gap low bounds over the trials pooled across champions', () => {
        const rows = [{ cells: { pack: armed(48, 8, 24) } }, { cells: { pack: armed(40, 4, 20) } }];
        const { pack } = drillReadings(rows, 2, ['pack']);
        const low = wilsonInterval(88, 128).low;
        expect(pack.gainLow).toBeCloseTo(low - wilsonInterval(12, 128).high, 12);
        expect(pack.blindGapLow).toBeCloseTo(low - wilsonInterval(44, 128).high, 12);
        expect(pack.gainLow).toBeGreaterThan(0);
    });

    it('reads a trio no better than its kin-blind control as a gap low bound under 0', () => {
        const { pack } = drillReadings([{ cells: { pack: armed(40, 4, 38) } }], 1, ['pack']);
        expect(/** @type {number} */ (pack.gainLow)).toBeGreaterThan(0);
        expect(/** @type {number} */ (pack.blindGapLow)).toBeLessThan(0);
    });

    it('reads null for both bounds when the arms were played on no trials', () => {
        const empty = { ...cell(10), arms: { solo: { wins: 0, trials: 0 }, 'kin-blind': { wins: 0, trials: 0 } } };
        const { pack } = drillReadings([{ cells: { pack: empty } }], 1, ['pack']);
        expect([pack.gainLow, pack.blindGapLow]).toEqual([null, null]);
    });

    it('reads null when a champion has no arms, and leaves the fields out of a drill that has none', () => {
        const rows = [
            { cells: { pack: armed(48, 8, 24), plain: cell(30) } },
            { cells: { pack: cell(30), plain: null } },
        ];
        const { pack, plain } = drillReadings(rows, 2, ['pack', 'plain']);
        expect(pack.gainLow).toBeTypeOf('number');
        expect('gainLow' in plain).toBe(false);
        const noArms = drillReadings([{ cells: { pack: armed(10, 0, 0) } }, { cells: { pack: cell(30) } }], 1, [
            'pack',
        ]);
        expect(noArms.pack.gainLow).toBeTypeOf('number');
        expect(drillReadings([], 0, ['pack']).pack.gainLow).toBeUndefined();
    });
});
