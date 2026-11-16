import { describe, expect, it } from 'vitest';
import { MIN_PAIRS, matchedTrials, pairedSeparation, styleVerdict } from '../../js/evo/style-evidence.js';

/**
 * @param {number[]} values a trace measure per trial
 * @returns {{wins: number, trials: number, records: Record<string, any>[]}} band trials with `biteTicks` set
 */
const trials = (values) => ({
    wins: values.length,
    trials: values.length,
    records: values.map((biteTicks) => ({ biteTicks })),
});
/** @template T @param {number} n @param {(i: number) => T} f @returns {T[]} */
const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));

describe('pairedSeparation', () => {
    it('separates bands whose paired difference is consistently above 0', () => {
        const low = trials(range(20, (i) => 2 + (i % 3)));
        const high = trials(range(20, (i) => 12 + (i % 3)));
        const s = pairedSeparation(low, high);
        expect(s.pairs).toBe(20);
        expect(s.meanDifference).toBeCloseTo(10, 12);
        expect(s.separated).toBe(true);
    });

    it('does not separate identical bands, bands that differ by noise, or too few pairs', () => {
        const same = trials(range(20, (i) => i % 5));
        expect(pairedSeparation(same, same).separated).toBe(false);
        const noisy = pairedSeparation(trials(range(20, (i) => i % 4)), trials(range(20, (i) => (i + 1) % 4)));
        expect(noisy.separated).toBe(false);
        const few = pairedSeparation(
            trials(range(MIN_PAIRS - 1, () => 1)),
            trials(range(MIN_PAIRS - 1, (i) => 9 + (i % 2))),
        );
        expect(few.separated).toBe(false);
    });

    it('reads nothing for an empty band, one pair, or trials without the measure', () => {
        expect(pairedSeparation(null, trials([1, 2]))).toMatchObject({
            pairs: 0,
            separated: false,
            meanDifference: null,
        });
        expect(pairedSeparation(trials([1]), trials([4]))).toMatchObject({ pairs: 1, meanDifference: 3, low95: null });
        const bare = { wins: 0, trials: 2, records: [{}, {}] };
        expect(pairedSeparation(bare, bare).pairs).toBe(0);
    });

    it('reads nothing when the high band is the empty one', () => {
        expect(pairedSeparation(trials([1, 2]), null)).toMatchObject({ pairs: 0, separated: false });
    });

    it('reads another measure when asked', () => {
        const a = { wins: 0, trials: 20, records: range(20, () => ({ jawTicks: 1, biteTicks: 5 })) };
        const b = { wins: 0, trials: 20, records: range(20, (i) => ({ jawTicks: 6 + (i % 2), biteTicks: 5 })) };
        expect(pairedSeparation(a, b).separated).toBe(false);
        expect(pairedSeparation(a, b, 'jawTicks').separated).toBe(true);
    });
});

describe('styleVerdict', () => {
    const good = { edgeLow: 0.3, winShareLow: 0.4 };
    const separated = { pairs: 32, meanDifference: 5, low95: 2, high95: 8, separated: true };
    const recruits = { low: true, high: true };

    it('claims viable diversity only when both bands pass, separate and recruit', () => {
        expect(
            styleVerdict({ bands: { low: good, high: good }, separation: separated, recruitment: recruits }),
        ).toEqual({
            viable: true,
            bands: { low: 'ok', high: 'ok' },
            reasons: [],
        });
    });

    it('cannot claim it with an empty band', () => {
        const verdict = styleVerdict({
            bands: { low: good, high: null },
            separation: separated,
            recruitment: recruits,
        });
        expect(verdict.viable).toBe(false);
        expect(verdict.bands).toEqual({ low: 'ok', high: 'empty' });
        expect(verdict.reasons).toContain('high band is empty');
    });

    it('cannot claim it with a band that fails its drill: no edge, no catch, or no reading', () => {
        for (const bad of [
            { edgeLow: -0.1, winShareLow: 0.2 },
            { edgeLow: 0.2, winShareLow: 0 },
            { edgeLow: null, winShareLow: 0.5 },
        ]) {
            const verdict = styleVerdict({
                bands: { low: bad, high: good },
                separation: separated,
                recruitment: recruits,
            });
            expect(verdict.viable).toBe(false);
            expect(verdict.bands.low).toBe('failed');
        }
    });

    it('cannot claim it with a band whose win share low bound was not read', () => {
        const unread = { edgeLow: 0.3, winShareLow: null };
        const verdict = styleVerdict({
            bands: { low: unread, high: good },
            separation: separated,
            recruitment: recruits,
        });
        expect([verdict.viable, verdict.bands.low]).toEqual([false, 'failed']);
    });

    it('cannot claim it without separation on matched trials', () => {
        for (const separation of [null, { ...separated, separated: false }]) {
            const verdict = styleVerdict({ bands: { low: good, high: good }, separation, recruitment: recruits });
            expect(verdict.viable).toBe(false);
            expect(verdict.reasons).toEqual(['the bands do not separate on matched trials']);
        }
    });

    it('cannot claim it when either band failed to recruit or recruitment was not read', () => {
        const verdict = styleVerdict({
            bands: { low: good, high: good },
            separation: separated,
            recruitment: { low: false, high: null },
        });
        expect(verdict.viable).toBe(false);
        expect(verdict.reasons).toEqual([
            'low band: descendant recruitment failed',
            'high band: descendant recruitment not read',
        ]);
    });
});

describe('matchedTrials', () => {
    it('plays the style drill for each filled band on the same bearings and leaves an empty band null', () => {
        const still = {
            name: 'still',
            id: 1,
            spec: 1,
            weights: null,
            act: () => {},
        };
        const out = matchedTrials({ low: still, high: null }, { seed: 4, trials: 2 });
        expect(out.high).toBeNull();
        expect(out.low?.trials).toBe(2);
        expect(out.low?.records).toHaveLength(2);
        expect(out.low?.records[0]).toHaveProperty('biteTicks');
        const again = matchedTrials({ low: still, high: still }, { seed: 4, trials: 2 });
        expect(again.low?.records).toEqual(out.low?.records);
        expect(again.high?.records).toEqual(again.low?.records);
    });
});
