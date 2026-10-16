import { describe, expect, it } from 'vitest';
import { ELO_K, ELO_START, expectedScore, updateElo } from '../../js/evo/elo.js';

describe('expectedScore', () => {
    it('is 0.5 for equal ratings', () => {
        expect(expectedScore(1500, 1500)).toBe(0.5);
    });

    it('is 10/11 at a 400 point lead and 1/11 at a 400 point deficit', () => {
        expect(expectedScore(1900, 1500)).toBeCloseTo(10 / 11, 12);
        expect(expectedScore(1500, 1900)).toBeCloseTo(1 / 11, 12);
    });

    it.each([
        [1613, 1609],
        [1200, 1800],
        [1500, 1501],
    ])('gives expected(%i, %i) + expected(%i, %i) = 1', (a, b) => {
        expect(expectedScore(a, b) + expectedScore(b, a)).toBeCloseTo(1, 12);
    });

    it('matches the Wikipedia example: 1613 vs 1609, 1477, 1388, 1586, 1720 expects 2.867', () => {
        const opponents = [1609, 1477, 1388, 1586, 1720];
        const total = opponents.reduce((sum, rb) => sum + expectedScore(1613, rb), 0);
        expect(total).toBeCloseTo(2.867, 3);
    });
});

describe('updateElo', () => {
    it('uses K 32 and starts at 1500', () => {
        expect(ELO_K).toBe(32);
        expect(ELO_START).toBe(1500);
    });

    it('matches the Wikipedia example: scoring 2.5 against 2.867 moves 1613 to about 1601', () => {
        const expected = [1609, 1477, 1388, 1586, 1720].reduce((sum, rb) => sum + expectedScore(1613, rb), 0);
        expect(Math.round(updateElo(1613, expected, 2.5))).toBe(1601);
    });

    it('moves an even match by K/2 for a win, K/2 down for a loss, and not at all for a draw', () => {
        expect(updateElo(1500, 0.5, 1)).toBe(1516);
        expect(updateElo(1500, 0.5, 0)).toBe(1484);
        expect(updateElo(1500, 0.5, 0.5)).toBe(1500);
    });

    it('takes a custom K', () => {
        expect(updateElo(1500, 0.5, 1, 16)).toBe(1508);
    });
});
