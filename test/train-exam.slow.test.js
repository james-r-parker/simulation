import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ELITE, placeOf, seedArchive } from '../js/evo/archive.js';
import { encodeArchive } from '../js/evo/archive-codec.js';
import { createTrainerArchive } from '../js/evo/trainer.js';
import { WELFORD_STRIDE, welfordAdd } from '../js/evo/welford.js';
import { brainLayout } from '../js/sim/brain-layout.js';
import { buildReport } from '../js/evo/report.js';
import { createConfig } from '../js/sim/config.js';
import { loadRun } from '../scripts/lib/exam-readings.mjs';
import { main, runExam } from '../scripts/train-exam.mjs';
import { makeChampionFile } from './evo/helpers/champion-file.js';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

const root = mkdtempSync(join(tmpdir(), 'train-exam-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const NO_WORLD = { worldBefore: null, worldAfter: null, keepRuleReport: null, descendants: null };
const config = createConfig({});
const layout = brainLayout(config);

/**
 * @param {string} name the run directory name
 * @param {{crossplay?: Record<string, any>, bare?: boolean}} [extra] a `crossplay.json` to write, and whether the run is bare (no manifest, generation or second predator band)
 * @returns {string} a run directory: a tested forager and two style bands of predators, and a manifest whose passed
 *   stage's gate reads `food-ahead`
 */
function runDir(name, { crossplay, bare = false } = {}) {
    const dir = join(root, name);
    mkdirSync(dir, { recursive: true });
    const archive = createTrainerArchive(config);
    const elites = [
        { spec: 0, cell: 3, id: 10 },
        { spec: 1, cell: 3, id: 20 },
        ...(bare ? [] : [{ spec: 1, cell: 60, id: 21 }]),
    ];
    for (const { spec, cell, id } of elites) {
        const weights = new Float32Array(layout.weightCount).fill(0.05 * (id % 7));
        seedArchive(archive, { spec, cell, id, sigma: 0.1, weights });
        welfordAdd(archive.stats, placeOf(spec, cell, ELITE) * WELFORD_STRIDE, 5);
    }
    const json = { ...encodeArchive(archive, config), ...(bare ? {} : { generation: 4 }) };
    writeFileSync(join(dir, 'archive-3.json'), `${JSON.stringify(json)}\n`);
    const stages = [{ name: 's', passedAt: 4, gate: [{ read: 'drill.food-ahead.edgeLow' }] }];
    if (!bare) {
        writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ stages }));
    }
    if (crossplay !== undefined) {
        writeFileSync(join(dir, 'crossplay.json'), JSON.stringify(crossplay));
    }
    return dir;
}

/**
 * @param {string} name the test's own league file name
 * @returns {string} the path of a league file that admits no champion
 */
function emptyLeague(name) {
    const path = join(root, `league-${name}.json`);
    writeFileSync(path, JSON.stringify({ version: 1, champions: [] }));
    return path;
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

describe('runExam', { timeout: scaleTimeout(60_000) }, () => {
    it('prints ten rows, writes exam.json and logs an ExamRow per row', async () => {
        const crossplay = { hunterProgress: { low: 0.2 }, preyProgress: { low: 0.1 }, cycleShare: 0.05 };
        const dir = runDir('exam', { crossplay });
        const leaguePath = emptyLeague('exam');
        const lines = /** @type {string[]} */ ([]);
        const logDir = join(root, 'logs');
        const result = await runExam(
            { ...NO_WORLD, run: dir, replicates: [], trials: 2, workers: 1 },
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
            { ...NO_WORLD, run: dir, replicates: [replicate], trials: 2, workers: 1 },
            { logDir: join(root, 'logs'), league: { path: leaguePath, root, ticks: 20 } },
        );
        const league = result.rows[4];
        expect(league.verdict).toBe('reported');
        expect(league.numbers.champions.length).toBeGreaterThan(0);
        expect(league.numbers.champions[0]).toHaveProperty('elo');
        expect(result.rows[8].numbers.runs).toBe(2);
    });

    it('feeds rows 6 and 7 from the world reports and a directory of saved champions', async () => {
        const dir = runDir('world');
        const report = buildReport({
            policy: 'map-elites-v6',
            fitnessName: 'v6',
            config,
            ticks: 10,
            seeds: [1, 2],
            sha: 'x',
            perSeed: [{}, {}],
        });
        writeFileSync(join(root, 'live.json'), JSON.stringify(report));
        writeFileSync(join(root, 'cp.json'), JSON.stringify({ ...report, policy: 'champions-v1' }));
        writeFileSync(join(root, 'keep.json'), JSON.stringify({ seedCount: 64, keepRule: { worse: false } }));
        const saved = join(root, 'saved');
        mkdirSync(saved);
        writeFileSync(join(saved, 'd.json'), JSON.stringify(makeChampionFile('d', 1, { specialisation: 0 })));
        const result = await runExam(
            {
                ...NO_WORLD,
                run: dir,
                replicates: [],
                trials: 2,
                workers: 1,
                worldBefore: join(root, 'live.json'),
                worldAfter: join(root, 'cp.json'),
                keepRuleReport: join(root, 'keep.json'),
                descendants: saved,
            },
            { logDir: join(root, 'logs'), league: { path: emptyLeague('world'), root, ticks: 20 } },
        );
        expect(result.rows[5].verdict).toBe('not run');
        expect(result.rows[5].reason).toMatch(/32 seeds/);
        expect(result.rows[6].verdict).toBe('not run');
        expect(result.rows[6].numbers.groups.unlabelled.drills['food-ahead']).toHaveProperty('winShare');
        expect(result.rows[6].reason).toMatch(/not read: children, grandchildren, replacement/);
    });

    it('runs a bare run (no manifest, one predator band, no generation) through main', async () => {
        const dir = runDir('bare', { bare: true });
        const leaguePath = emptyLeague('bare');
        const result = await runExam(
            { ...NO_WORLD, run: dir, replicates: [], trials: 2, workers: undefined },
            { logDir: join(root, 'logs'), league: { path: leaguePath, root, ticks: 20 } },
        );
        expect(result.rows[2].verdict).toBe('not run');
        expect(result.rows[7].verdict).toBe('fail');
        expect(loadRun(dir).generation).toBe(0);
        const code = await main(['--run', dir, '--trials', '1', '--workers', '1'], { logDir: join(root, 'logs') });
        expect(code).toBe(0);
    });
});
