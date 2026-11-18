import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ELITE, placeOf, seedArchive } from '../js/evo/archive.js';
import { encodeArchive } from '../js/evo/archive-codec.js';
import { createTrainerArchive } from '../js/evo/trainer.js';
import { WELFORD_STRIDE, welfordAdd } from '../js/evo/welford.js';
import { brainLayout } from '../js/sim/brain-layout.js';
import { createConfig } from '../js/sim/config.js';
import { loadRun } from '../scripts/lib/exam-readings.mjs';
import { runExam } from '../scripts/train-exam.mjs';
import { makeChampionFile } from './evo/helpers/champion-file.js';

const root = mkdtempSync(join(tmpdir(), 'train-exam-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const config = createConfig({});
const layout = brainLayout(config);

/**
 * @param {string} name the run directory name
 * @param {{crossplay?: Record<string, any>}} [extra] a `crossplay.json` to write
 * @returns {string} a run directory: a tested forager and two style bands of predators, and a manifest whose passed
 *   stage's gate reads `food-ahead`
 */
function runDir(name, { crossplay } = {}) {
    const dir = join(root, name);
    mkdirSync(dir, { recursive: true });
    const archive = createTrainerArchive(config);
    const elites = [
        { spec: 0, cell: 3, id: 10 },
        { spec: 1, cell: 3, id: 20 },
        { spec: 1, cell: 60, id: 21 },
    ];
    for (const { spec, cell, id } of elites) {
        const weights = new Float32Array(layout.weightCount).fill(0.05 * (id % 7));
        seedArchive(archive, { spec, cell, id, sigma: 0.1, weights });
        welfordAdd(archive.stats, placeOf(spec, cell, ELITE) * WELFORD_STRIDE, 5);
    }
    const json = { ...encodeArchive(archive, config), generation: 4 };
    writeFileSync(join(dir, 'archive-3.json'), `${JSON.stringify(json)}\n`);
    const stages = [{ name: 's', passedAt: 4, gate: [{ read: 'drill.food-ahead.edgeLow' }] }];
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ stages }));
    if (crossplay !== undefined) {
        writeFileSync(join(dir, 'crossplay.json'), JSON.stringify(crossplay));
    }
    return dir;
}

describe('loadRun', () => {
    it('reads the last archive, and refuses a directory without one', () => {
        const dir = runDir('load');
        expect(loadRun(dir).generation).toBe(4);
        expect(loadRun(dir).crossplay).toBeNull();
        const empty = join(root, 'empty');
        mkdirSync(empty);
        expect(() => loadRun(empty)).toThrow(/holds no archive-<g>\.json/);
    });
});

describe('runExam', () => {
    it('prints ten rows, writes exam.json and logs an ExamRow per row', async () => {
        const crossplay = { hunterProgress: { low: 0.2 }, preyProgress: { low: 0.1 }, cycleShare: 0.05 };
        const dir = runDir('exam', { crossplay });
        const leaguePath = join(root, 'league.json');
        writeFileSync(leaguePath, JSON.stringify({ version: 1, champions: [] }));
        const lines = /** @type {string[]} */ ([]);
        const logDir = join(root, 'logs');
        const result = await runExam(
            { run: dir, replicates: [], trials: 2, workers: 1 },
            { logDir, print: (line) => lines.push(line), league: { path: leaguePath, root, ticks: 20 } },
        );
        expect(result.rows.map((r) => r.row)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        const byRow = Object.fromEntries(result.rows.map((r) => [r.row, r]));
        expect(byRow[1].verdict).toBe('pass');
        expect(byRow[2].verdict).toBe('reported');
        expect(byRow[4].verdict).toBe('pass');
        expect(byRow[5].verdict).toBe('not run');
        expect(byRow[6].verdict).toBe('not run');
        expect(byRow[9].verdict).toBe('not run');
        expect(result.good).toBe(false);
        expect(lines).toHaveLength(11);
        const written = JSON.parse(readFileSync(join(dir, 'exam.json'), 'utf8'));
        expect(written.rows).toHaveLength(10);
        expect(written.trials).toBe(2);
        const text = readFileSync(join(logDir, 'exam-exam.jsonl'), 'utf8').trim().split('\n');
        expect(text.map((l) => JSON.parse(l)).filter((r) => r.event === 'ExamRow')).toHaveLength(10);
    });

    it('plays the exported champions against the admitted league, and reads a replicate for row 9', async () => {
        const dir = runDir('league');
        const replicate = runDir('league-replicate');
        writeFileSync(join(root, 'champion.json'), JSON.stringify(makeChampionFile('admitted', 1)));
        const leaguePath = join(root, 'league-with.json');
        const champions = [{ file: 'champion.json', name: 'admitted', elo: 1000 }];
        writeFileSync(leaguePath, JSON.stringify({ version: 1, champions }));
        const result = await runExam(
            { run: dir, replicates: [replicate], trials: 2, workers: 1 },
            { logDir: join(root, 'logs'), league: { path: leaguePath, root, ticks: 20 } },
        );
        const league = result.rows[4];
        expect(league.verdict).toBe('reported');
        expect(league.numbers.champions.length).toBeGreaterThan(0);
        expect(league.numbers.champions[0]).toHaveProperty('elo');
        expect(result.rows[8].numbers.runs).toBe(2);
    });
});
