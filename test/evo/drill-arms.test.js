import { describe, expect, it } from 'vitest';
import { wilsonInterval } from '../../js/evo/binomial.js';
import { ARM_NAMES, armReading, pooledArmReading } from '../../js/evo/drill-arms.js';

const arms = (/** @type {number} */ soloWins, /** @type {number} */ blindWins, trials = 64) => ({
    [ARM_NAMES.SOLO]: { wins: soloWins, trials },
    [ARM_NAMES.BLIND]: { wins: blindWins, trials },
});

describe('armReading', () => {
    it('reads the gain as the trio share minus the solo share, and both low bounds from the Wilson bounds', () => {
        const reading = /** @type {NonNullable<ReturnType<typeof armReading>>} */ (
            armReading({ wins: 48, trials: 64 }, arms(8, 24))
        );
        expect(reading.soloShare).toBe(0.125);
        expect(reading.blindShare).toBe(0.375);
        expect(reading.gain).toBeCloseTo(0.75 - 0.125, 12);
        const low = wilsonInterval(48, 64).low;
        expect(reading.gainLow).toBeCloseTo(low - wilsonInterval(8, 64).high, 12);
        expect(reading.blindGapLow).toBeCloseTo(low - wilsonInterval(24, 64).high, 12);
        expect(reading.gainLow).toBeGreaterThan(0);
        expect(reading.blindGapLow).toBeGreaterThan(0);
    });

    it('reads a trio no better than its kin-blind control as a gap low bound under 0, however much it beats the solo', () => {
        const reading = /** @type {NonNullable<ReturnType<typeof armReading>>} */ (
            armReading({ wins: 40, trials: 64 }, arms(4, 38))
        );
        expect(reading.gainLow).toBeGreaterThan(0);
        expect(reading.blindGapLow).toBeLessThan(0);
    });

    it('reads a trio no better than a lone hunter as a gain low bound under 0', () => {
        const reading = /** @type {NonNullable<ReturnType<typeof armReading>>} */ (
            armReading({ wins: 20, trials: 64 }, arms(22, 0))
        );
        expect(reading.gain).toBeLessThan(0);
        expect(reading.gainLow).toBeLessThan(0);
    });

    it('reads nothing when an arm is missing or was not played', () => {
        expect(armReading({ wins: 5, trials: 8 }, { [ARM_NAMES.SOLO]: { wins: 1, trials: 8 } })).toBeNull();
        expect(armReading({ wins: 5, trials: 8 }, arms(1, 1, 0))).toBeNull();
        expect(armReading({ wins: 0, trials: 0 }, arms(1, 1, 8))).toBeNull();
    });
});

describe('pooledArmReading', () => {
    it('pools the trials of the champions before it reads', () => {
        const cells = [
            { trio: { wins: 30, trials: 32 }, arms: arms(2, 10, 32) },
            { trio: { wins: 26, trials: 32 }, arms: arms(6, 14, 32) },
        ];
        expect(pooledArmReading(cells)).toEqual(armReading({ wins: 56, trials: 64 }, arms(8, 24, 64)));
    });

    it('reads nothing without champions, and counts a champion with no arms as no trials of them', () => {
        expect(pooledArmReading([])).toBeNull();
        expect(pooledArmReading([{ trio: { wins: 3, trials: 8 }, arms: {} }])).toBeNull();
    });
});
