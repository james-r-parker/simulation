import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createArchive, offer } from '../js/evo/archive.js';
import { brainLayout } from '../js/sim/brain-layout.js';
import { createConfig } from '../js/sim/config.js';
import { main, parseArgs, runDrills } from '../scripts/drill.mjs';
import { formatTable, meanEdge, reportJson } from '../scripts/lib/drill-report.mjs';
import { DRILLS } from '../js/evo/drill-scenarios.js';
import { eliteSubjects } from '../scripts/lib/drill-subjects.mjs';
import { makeChampionFile } from './evo/helpers/champion-file.js';

const root = mkdtempSync(join(tmpdir(), 'drill-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** @returns {string} a directory with one forager and one predator champion */
function champions() {
    const dir = join(root, 'champions');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'a.json'), JSON.stringify(makeChampionFile('forager', 1, { specialisation: 0 })));
    writeFileSync(join(dir, 'b.json'), JSON.stringify(makeChampionFile('predator', 2, { specialisation: 1 })));
    return dir;
}

describe('parseArgs', () => {
    it('defaults to every drill, 32 trials, seed 1 and 8 elites', () => {
        const args = parseArgs(['--champions', 'd']);
        expect(args).toMatchObject({ champions: 'd', seed: 1, trials: 32, count: 8, json: false, out: null });
        expect(args.drills).toEqual(DRILLS.map((d) => d.name));
    });

    it('reads every flag', () => {
        expect(
            parseArgs([
                '--policy',
                'p',
                '--count',
                '3',
                '--drills',
                'food-ahead,two-foods',
                '--seed',
                '4',
                '--trials',
                '2',
                '--json',
                '--workers',
                '2',
            ]),
        ).toMatchObject({
            policy: 'p',
            count: 3,
            drills: ['food-ahead', 'two-foods'],
            seed: 4,
            trials: 2,
            json: true,
            workers: 2,
        });
    });

    it('needs exactly one source and known drills', () => {
        expect(() => parseArgs([])).toThrow(/exactly one of/);
        expect(() => parseArgs(['--champions', 'a', '--archive', 'b'])).toThrow(/exactly one of/);
        expect(() => parseArgs(['--champions', 'a', '--drills', 'nope'])).toThrow(/unknown drill "nope"/);
        expect(() => parseArgs(['--champions', 'a', '--trials', '0'])).toThrow(/--trials/);
    });
});

describe('the report', () => {
    /** @type {import('../scripts/lib/drill-report.mjs').DrillRow[]} */
    const rows = [
        { label: 'g', cells: { a: { winShare: 0.5, edge: 0.25 }, b: { winShare: 1, edge: -0.25 }, c: null } },
        { label: 'skipper', cells: { a: null } },
    ];

    it('averages the edge over the drills a row ran, and not at all over none', () => {
        expect(meanEdge(rows[0])).toBe(0);
        expect(meanEdge(rows[1])).toBeNull();
    });

    it('prints a header, a cell per drill with - for a skip, and the mean edge', () => {
        const [header, first, second] = formatTable(['a', 'b', 'c'], rows);
        expect(header.split(/\s{2,}/)).toEqual(['subject', 'a', 'b', 'c', 'mean edge']);
        expect(first.split(/\s{2,}/)).toEqual(['g', '0.50 (+0.25)', '1.00 (-0.25)', '-', '+0.00']);
        expect(second.split(/\s{2,}/).at(-1)).toBe('-');
        expect(reportJson(['a'], rows).rows[0].meanEdge).toBe(0);
    });

    it('prints the Wilson low bounds in the cell when the row has them, and leaves them out when it does not', () => {
        const [, first] = formatTable(
            ['a'],
            [{ label: 'g', cells: { a: { winShare: 0.75, edge: 0.5, winShareLow: 0.58, edgeLow: 0.31 } } }],
        );
        expect(first.split(/\s{2,}/)[1]).toBe('0.75 [0.58] (+0.50, +0.31)');
    });

    it('prints the control arms of a pack cell: both shares, the gain and the two low bounds', () => {
        const cell = {
            winShare: 0.75,
            edge: 0.5,
            wins: 48,
            trials: 64,
            arms: { solo: { wins: 8, trials: 64 }, 'kin-blind': { wins: 24, trials: 64 } },
        };
        const [, first] = formatTable(['pack-converge'], [{ label: 'g', cells: { 'pack-converge': cell } }]);
        expect(first).toMatch(/solo 0\.13, blind 0\.38, gain \+0\.63 \[\+0\.\d\d\], gap \[\+0\.\d\d\]/);
        const bare = { ...cell, arms: undefined };
        expect(formatTable(['pack-converge'], [{ label: 'g', cells: { 'pack-converge': bare } }])[1]).not.toContain(
            'solo',
        );
        const half = { ...cell, arms: { solo: { wins: 1, trials: 64 } } };
        expect(formatTable(['pack-converge'], [{ label: 'g', cells: { 'pack-converge': half } }])[1]).not.toContain(
            'gain',
        );
    });

    it('prints first-match lost-trial reasons in the cell', () => {
        const [, first] = formatTable(
            ['prey-ahead'],
            [{ label: 'g', cells: { 'prey-ahead': { winShare: 0.5, edge: 0.1, lossReasons: { 'never-bit': 2 } } } }],
        );
        expect(first).toContain('never-bit:2');
    });
});

describe('eliteSubjects', () => {
    it('is empty for an empty archive', () => {
        expect(eliteSubjects(createArchive(brainLayout(createConfig({}))))).toEqual([]);
    });

    it('takes the champions the archive would export: one per specialisation and style band, with the style and bound', () => {
        const archive = createArchive(brainLayout(createConfig({})));
        const row = new Float32Array(archive.layout.weightCount).fill(0.05);
        offer(archive, { spec: 1, cell: 4, row, sigma: 0.1, id: 5, fitness: 1 });
        offer(archive, { spec: 1, cell: 64, row, sigma: 0.1, id: 6, fitness: 2 });
        offer(archive, { spec: 0, cell: 2, row, sigma: 0.1, id: 7, fitness: 1 });
        const subjects = eliteSubjects(archive);
        expect(subjects.map((s) => [s.name, s.spec, s.style])).toEqual([
            ['elite-forager-cell2', 0, 'low'],
            ['elite-predator-cell4', 1, 'low'],
            ['elite-predator-cell64', 1, 'high'],
        ]);
        expect(subjects.every((s) => typeof s.lowerBound === 'number')).toBe(true);
        expect(subjects[1].weights).not.toBe(archive.rows);
    });
});

describe('runDrills', () => {
    it('prints a row per champion and the memoryless reference, skipping a drill the champion cannot do', async () => {
        /** @type {string[]} */
        const lines = [];
        const args = parseArgs([
            '--champions',
            champions(),
            '--trials',
            '2',
            '--drills',
            'food-ahead,prey-ahead',
            '--workers',
            '1',
        ]);
        const rows = await runDrills(args, { logDir: join(root, 'logs'), print: (line) => lines.push(line) });
        expect(rows.map((r) => r.label)).toEqual(['forager', 'predator', 'reference memoryless']);
        expect(rows[0].cells['prey-ahead']).toBeNull();
        expect(rows[1].cells['food-ahead']).toBeNull();
        expect(rows[2].cells['food-ahead']?.winShare).toBe(1);
        // a hunting drill's cell carries the prey-trace aggregates, a food drill's does not
        const hunt = /** @type {any} */ (rows[1].cells['prey-ahead']);
        expect(hunt.jawTrials).toBeGreaterThanOrEqual(0);
        expect(hunt.jawTrials).toBeLessThanOrEqual(hunt.trials);
        expect(hunt.closestList.length).toBeLessThanOrEqual(hunt.trials);
        expect('jawTrials' in /** @type {any} */ (rows[2].cells['food-ahead'])).toBe(false);
        expect(lines.join('\n')).toContain('mean edge');
        expect(lines.join('\n')).toMatch(/skip cells[^\n]*prey>BITE[^\n]*\n[^\n]*champions/);
        const log = readFileSync(join(root, 'logs', 'drill-1x2.jsonl'), 'utf8')
            .split('\n')
            .filter(Boolean)
            .map((l) => JSON.parse(l));
        expect(log[0]).toMatchObject({
            event: 'RunConfig',
            tool: 'drill',
            policy: null,
            seeds: [1],
            ticks: null,
            trials: 2,
            source: 'champions',
        });
        expect(log[0].configHash).toMatch(/^[0-9a-f]+$/);
        expect(log.filter((l) => l.event === 'DrillResult').length).toBe(4);
        expect(log.filter((l) => l.event === 'DrillTrial').length).toBeGreaterThan(0);
    });

    it('prints the same table on one worker and on two', async () => {
        const dir = champions();
        const run = async (/** @type {string} */ workers) => {
            /** @type {string[]} */
            const lines = [];
            const args = parseArgs([
                '--champions',
                dir,
                '--trials',
                '2',
                '--drills',
                'food-ahead,hunter-closing',
                '--workers',
                workers,
            ]);
            await runDrills(args, { logDir: join(root, `logs-${workers}`), print: (line) => lines.push(line) });
            return lines.join('\n');
        };
        expect(await run('2')).toBe(await run('1'));
    });

    it('exits 1 with a message on a bad argument', async () => {
        expect(await main([])).toBe(1);
    });
});
