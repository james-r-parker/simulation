import { describe, expect, it } from 'vitest';
import { ledgerRecords, splitHunterIncome } from '../../js/evo/hunter-income-split.js';

/**
 * @param {number} kills kills
 * @param {number} carcass carcass energy
 * @param {number} kill kill energy
 * @param {number} bite bite gain
 * @returns {import('../../js/evo/hunter-income-split.js').LedgerRecord} a record
 */
const life = (kills, carcass, kill, bite) => ({
    kills,
    carcassEnergy: carcass,
    killEnergy: kill,
    biteGainEnergy: bite,
});

describe('splitHunterIncome', () => {
    it('gives the shares of kill, bite and carcass energy in all income', () => {
        const split = splitHunterIncome([life(2, 100, 50, 50), life(0, 200, 0, 0)]);
        expect(split).toMatchObject({ lives: 2, zeroKillLives: 1, income: 400 });
        expect(split.killShare).toBeCloseTo(0.125, 12);
        expect(split.biteShare).toBeCloseTo(0.125, 12);
        expect(split.carcassShare).toBeCloseTo(0.75, 12);
    });

    it('gives the share of carcass energy eaten by zero-kill lives, and its share of all income', () => {
        const split = splitHunterIncome([life(2, 100, 50, 50), life(0, 200, 0, 0)]);
        expect(split.zeroKillCarcassShare).toBeCloseTo(200 / 300, 12);
        expect(split.zeroKillCarcassOfIncome).toBeCloseTo(0.5, 12);
    });

    it('is 0 everywhere for no records or no income, not NaN', () => {
        expect(splitHunterIncome([])).toMatchObject({ lives: 0, income: 0, carcassShare: 0, zeroKillCarcassShare: 0 });
        expect(splitHunterIncome([life(0, 0, 0, 0)]).zeroKillCarcassOfIncome).toBe(0);
    });

    it('credits all carcass energy to hunters when every life killed', () => {
        expect(splitHunterIncome([life(1, 10, 5, 5)]).zeroKillCarcassShare).toBe(0);
    });
});

describe('ledgerRecords', () => {
    it('keeps the HunterLedger lines of a log and skips the rest', () => {
        const text = [
            JSON.stringify({ level: 'debug', event: 'HunterLedger', ...life(1, 2, 3, 4) }),
            JSON.stringify({ level: 'debug', event: 'AgentDied', note: 'HunterLedger' }),
            JSON.stringify({ level: 'info', event: 'Other' }),
            '',
        ].join('\n');
        expect(ledgerRecords(text)).toHaveLength(1);
        expect(ledgerRecords(text)[0].carcassEnergy).toBe(2);
    });
});
