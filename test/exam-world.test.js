import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildReport } from '../js/evo/report.js';
import { createConfig } from '../js/sim/config.js';
import { drillShares, readKeepReport, readWorldReport } from '../scripts/lib/exam-world.mjs';

const root = mkdtempSync(join(tmpdir(), 'exam-world-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/**
 * @param {string} name file name
 * @param {unknown} content JSON content
 * @returns {string} the path
 */
function write(name, content) {
    const path = join(root, name);
    writeFileSync(path, JSON.stringify(content));
    return path;
}

describe('readWorldReport', () => {
    it('reads no report as none, a valid one as itself and refuses another file', () => {
        expect(readWorldReport(null)).toBeNull();
        const report = buildReport({
            policy: 'map-elites-v6',
            fitnessName: 'v6',
            config: createConfig({}),
            ticks: 10,
            seeds: [1, 2],
            sha: 'x',
            perSeed: [{}, {}],
        });
        expect(readWorldReport(write('report.json', report))?.policy).toBe('map-elites-v6');
        expect(() => readWorldReport(write('not-a-report.json', { policy: 1 }))).toThrow();
    });
});

describe('readKeepReport', () => {
    it('reads the seed count and the keep rule of eval:compare --keep-rule --json', () => {
        expect(readKeepReport(null)).toBeNull();
        const path = write('keep.json', { seedCount: 64, rows: [], keepRule: { worse: true, guards: [] } });
        expect(readKeepReport(path)).toEqual({ seedCount: 64, keepRule: { worse: true, guards: [] } });
    });

    it('refuses a file without them', () => {
        expect(() => readKeepReport(write('plain.json', { seedCount: 64 }))).toThrow(/not a keep-rule report/);
        expect(() => readKeepReport(write('noseeds.json', { keepRule: { worse: false } }))).toThrow(/not a keep-rule/);
    });
});

describe('drillShares', () => {
    const cell = (/** @type {number} */ wins, /** @type {number} */ trials) => ({
        winShare: wins / trials,
        wins,
        trials,
        randomWins: 1,
        randomTrials: 10,
    });

    it('pools the win share over the champions that ran each drill, null for a drill none ran', () => {
        const rows = [
            { cells: { 'food-ahead': cell(8, 10), 'prey-ahead': null } },
            { cells: { 'food-ahead': cell(6, 10), 'prey-ahead': null } },
            { cells: { 'food-ahead': cell(1, 10), 'prey-ahead': null } },
        ];
        const shares = drillShares(rows, 2, ['food-ahead', 'prey-ahead']);
        expect(shares.drills['food-ahead'].winShare).toBe(0.7);
        expect(shares.drills['food-ahead'].edgeLow).toBeGreaterThan(0);
        expect(shares.drills['prey-ahead']).toEqual({ winShare: null, edgeLow: null });
    });
});
