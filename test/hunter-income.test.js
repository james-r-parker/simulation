import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { main, runHunterIncome } from '../scripts/hunter-income.mjs';

const root = mkdtempSync(join(tmpdir(), 'hunter-income-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/**
 * @param {string} name file name
 * @param {Record<string, any>[]} records log records
 * @returns {string} the path
 */
function logOf(name, records) {
    const path = join(root, name);
    writeFileSync(path, records.map((r) => JSON.stringify(r)).join('\n'));
    return path;
}

describe('hunter-income', () => {
    it('splits the HunterLedger records of a log and prints each share', () => {
        const path = logOf('a.jsonl', [
            { event: 'HunterLedger', kills: 0, carcassEnergy: 30, killEnergy: 0, biteGainEnergy: 10 },
            { event: 'HunterLedger', kills: 1, carcassEnergy: 10, killEnergy: 40, biteGainEnergy: 10 },
        ]);
        /** @type {string[]} */
        const lines = [];
        const split = runHunterIncome([path], (line) => lines.push(line));
        expect(split.carcassShare).toBeCloseTo(0.4, 12);
        expect(split.zeroKillCarcassShare).toBeCloseTo(0.75, 12);
        expect(lines.some((line) => line.startsWith('carcassShare') && line.endsWith('0.400'))).toBe(true);
    });

    it('main exits 0 on a good log and 1 on a bad one', async () => {
        const good = logOf('c.jsonl', [
            { event: 'HunterLedger', kills: 1, carcassEnergy: 1, killEnergy: 1, biteGainEnergy: 1 },
        ]);
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(await main([good])).toBe(0);
        expect(await main([])).toBe(1);
        log.mockRestore();
        err.mockRestore();
    });

    it('refuses a log with no ledger record, and a missing argument', () => {
        expect(() => runHunterIncome([logOf('b.jsonl', [{ event: 'Other' }])])).toThrow(/--level debug/);
        expect(() => runHunterIncome([])).toThrow(/usage/);
    });
});
