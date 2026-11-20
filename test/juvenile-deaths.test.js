import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { main, runJuvenileDeaths } from '../scripts/juvenile-deaths.mjs';

const root = mkdtempSync(join(tmpdir(), 'juvenile-deaths-'));
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

const RECORDS = [
    { event: 'RunStarted', ticks: 20000 },
    { event: 'AgentBorn', tick: 11000, genomeId: 1, spec: 1, parentA: 0, parentB: 0, cause: 'split' },
    { event: 'AgentDied', tick: 11400, slot: 2, genomeId: 1, foodEnergy: 0 },
    {
        event: 'HunterLedger',
        tick: 11400,
        genomeId: 1,
        ageTicks: 400,
        cause: 'starved',
        birth: 'split-hunter-parent',
        kills: 0,
        carcassEnergy: 0,
        standingEnergy: 1,
        moveEnergy: 2,
        sprintEnergy: 0,
        killEnergy: 0,
        biteGainEnergy: 0,
        biteCostEnergy: 300,
    },
];

describe('juvenile-deaths script', () => {
    it('prints the headline and a row per birth source and cause', () => {
        const path = logOf('a.jsonl', RECORDS);
        /** @type {string[]} */
        const lines = [];
        const split = runJuvenileDeaths([path], (line) => lines.push(line));
        expect(split.juvenileDeaths).toBe(1);
        expect(lines[0]).toContain('share of deaths 1');
        expect(lines.some((line) => line.startsWith('birth split-hunter-parent'))).toBe(true);
        expect(lines.some((line) => line.startsWith('cause starved'))).toBe(true);
    });

    it('reads the options and pools several logs', () => {
        const path = logOf('b.jsonl', RECORDS);
        const split = runJuvenileDeaths([path, path, '--juvenile-ticks', '300'], () => {});
        expect(split.lives).toBe(2);
        expect(split.juvenileDeaths).toBe(0);
    });

    it('refuses a missing log, a bad flag, a log with no run start and a log with no hunter life', () => {
        expect(() => runJuvenileDeaths([], () => {})).toThrow(/usage/);
        expect(() => runJuvenileDeaths(['--nope'], () => {})).toThrow(/unknown flag/);
        expect(() => runJuvenileDeaths(['--burn-in', 'x', 'f'], () => {})).toThrow(/non-negative/);
        expect(() => runJuvenileDeaths([logOf('c.jsonl', [{ event: 'AgentBorn' }])], () => {})).toThrow(/RunStarted/);
        expect(() => runJuvenileDeaths([logOf('d.jsonl', [{ event: 'RunStarted', ticks: 1 }])], () => {})).toThrow(
            /no hunter life/,
        );
    });

    it('main exits 0 on a good log and 1 without one', async () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(await main([logOf('e.jsonl', RECORDS)])).toBe(0);
        expect(await main([])).toBe(1);
        log.mockRestore();
        err.mockRestore();
    });
});
