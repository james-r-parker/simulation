import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createArchive, offer } from '../js/evo/archive.js';
import { encodeArchive } from '../js/evo/archive-codec.js';
import { validateChampion } from '../js/evo/league.js';
import { brainLayout } from '../js/sim/brain-layout.js';
import { createConfig } from '../js/sim/config.js';
import { TRAINER_DESCRIPTOR } from '../js/evo/trainer.js';
import { drillEdges, drillLossReasons, averageMetrics } from '../scripts/lib/train-checkpoint.mjs';
import { loadStages, saveArchive } from '../scripts/lib/train-state.mjs';
import { formatCurve, readCurve } from '../scripts/train-curve.mjs';
import { runExport } from '../scripts/train-export.mjs';
import { loadChampions } from '../scripts/memory-probe.mjs';
import { parseArgs } from '../scripts/train.mjs';

const root = mkdtempSync(join(tmpdir(), 'train-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('parseArgs', () => {
    it('needs --generations and --out and reads the defaults', () => {
        expect(() => parseArgs(['--out', 'x'])).toThrow(/required/);
        expect(parseArgs(['--generations', '3', '--out', 'x'])).toMatchObject({
            generations: 3,
            episodes: 32,
            checkpointEvery: 10,
            curriculum: null,
            resume: null,
            seedOffset: 0,
        });
    });

    it('reads --seed-offset and rejects a negative one', () => {
        expect(parseArgs(['--generations', '1', '--out', 'x', '--seed-offset', '7']).seedOffset).toBe(7);
        expect(() => parseArgs(['--generations', '1', '--out', 'x', '--seed-offset', '-1'])).toThrow(/--seed-offset/);
    });

    it('rejects a curriculum with a config, and unknown flags', () => {
        expect(() => parseArgs(['--generations', '1', '--out', 'x', '--curriculum', 'a', '--config', 'b'])).toThrow(
            /not both/,
        );
        expect(() => parseArgs(['--nope'])).toThrow(/unknown argument/);
    });
});

describe('loadStages', () => {
    it('loads the committed curriculum: three stages with distinct rulesHash and one layout', () => {
        const args = parseArgs(['--generations', '45', '--out', 'x', '--curriculum', 'evals/train-curriculum.json']);
        const stages = loadStages(args);
        expect(stages.map((s) => [s.name, s.from, s.to])).toEqual([
            ['nursery', 0, 20],
            ['hunt', 20, 40],
            ['world', 40, 45],
        ]);
        expect(new Set(stages.map((s) => s.rulesHash)).size).toBe(3);
    });
});

describe('checkpoint helpers', () => {
    it('averages each drill edge over the genomes it ran on, and each metric over the seeds with a value', () => {
        const rows = [
            { cells: { 'food-ahead': { edge: 0.5 }, 'prey-ahead': null } },
            { cells: { 'food-ahead': { edge: 0.1 }, 'prey-ahead': { edge: 0.3 } } },
            { cells: { 'food-ahead': { edge: 9 } } },
        ];
        const edges = drillEdges(rows, 2);
        expect(edges['food-ahead']).toBeCloseTo(0.3);
        expect(edges['prey-ahead']).toBeCloseTo(0.3);
        expect(edges['two-foods']).toBeNull();
        expect(
            drillLossReasons(
                [
                    { cells: { 'prey-ahead': { lossReasons: { 'never-bit': 2 } } } },
                    { cells: { 'prey-ahead': { lossReasons: { 'bit-prey-lived': 1 } } } },
                ],
                2,
            )['prey-ahead'],
        ).toEqual({ 'never-bit': 2, 'bit-prey-lived': 1 });
        const m = averageMetrics([
            { 'eval.hunter_zero_kill_share': 1 },
            { 'eval.hunter_zero_kill_share': null },
            { 'eval.hunter_zero_kill_share': 3 },
        ]);
        expect(m['eval.hunter_zero_kill_share']).toBe(2);
        expect(m['eval.escape_share']).toBeNull();
    });
});

describe('train:curve', () => {
    it('prints the rows and the plateau line', () => {
        const dir = join(root, 'curve');
        mkdirSync(dir);
        expect(() => readCurve(dir)).toThrow(/no curve/);
        const row = (/** @type {number} */ g) => ({
            generation: g,
            stage: 'world',
            trainTicks: g * 1000,
            wallSeconds: 5,
            coverage: 0.1,
            qdScore: 1,
            drillEdge: 0.2,
            'eval.food_energy_per_1k': 100,
            'eval.hunter_zero_kill_share': 0.5,
            'eval.bite_on_prey_view': 0.4,
        });
        writeFileSync(join(dir, 'curve.jsonl'), [10, 20, 30, 40, 50].map((g) => JSON.stringify(row(g))).join('\n'));
        const lines = formatCurve(readCurve(dir));
        expect(lines[0]).toMatch(/^gen\s+stage\s+ticks/);
        for (const column of [
            'zero_kill_share',
            'income.kill',
            'income.carcass',
            'kills/1k.mate-hunter-parent',
            'bite_on_prey',
            'bite_off_kin',
        ]) {
            expect(lines[0]).toContain(column);
        }
        expect(lines).toHaveLength(7);
        expect(lines.at(-1)).toBe('plateau: generation 10');
    });
});

describe('train:export', () => {
    it('writes one champion per specialisation that the league validator accepts, stamped for the default world', () => {
        const config = createConfig(JSON.parse(readFileSync('evals/micro-world.json', 'utf8')));
        const archive = createArchive(brainLayout(config), { descriptor: TRAINER_DESCRIPTOR });
        const row = new Float32Array(archive.layout.weightCount).fill(0.1);
        offer(archive, { spec: 0, cell: 4, row, sigma: 0.1, id: 7, fitness: 3 });
        offer(archive, { spec: 1, cell: 9, row, sigma: 0.1, id: 8, fitness: 2 });
        const file = join(root, 'archive-0.json');
        writeFileSync(file, JSON.stringify({ ...encodeArchive(archive, config), generation: 1, stages: [] }));
        const out = join(root, 'champions');
        /** @type {string[]} */
        const printed = [];
        const files = runExport({ archive: file, out, config: null, label: 'run' }, (line) => printed.push(line));
        expect(files.map((f) => f.name)).toEqual(['run-forager-cell4', 'run-predator-cell9']);
        const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'));
        expect(index.champions).toHaveLength(2);
        const skip = JSON.parse(readFileSync(join(out, 'skip-cells.json'), 'utf8'));
        expect(skip.champions.count).toBe(1);
        expect(skip.elites.predator.count).toBe(1);
        expect(skip.champions.cells['prey>BITE'].min).toBeCloseTo(0.1, 6);
        expect(printed.join('\n')).toContain('exported champions');
        expect(printed.join('\n')).toContain('predator best 8 elites');
        const champion = JSON.parse(readFileSync(join(out, 'run-forager-cell4.json'), 'utf8'));
        expect(validateChampion(champion, createConfig({})).specialisation).toBe(0);
        const log = { log: () => {} };
        const subjects = loadChampions(out, { config: {}, log: /** @type {any} */ (log) });
        expect(subjects.map((s) => s.spec)).toEqual([0, 1]);
    });

    it('refuses an archive with no elite', () => {
        const config = createConfig({});
        const file = join(root, 'empty.json');
        writeFileSync(
            file,
            JSON.stringify(
                encodeArchive(createArchive(brainLayout(config), { descriptor: TRAINER_DESCRIPTOR }), config),
            ),
        );
        expect(() => runExport({ archive: file, out: join(root, 'none'), config: null, label: null })).toThrow(
            /no elite/,
        );
    });
});

describe('evals/train-seeds.json', () => {
    it('holds 256 distinct seeds, none in evals/seeds.json', () => {
        const train = JSON.parse(readFileSync('evals/train-seeds.json', 'utf8'));
        const evals = JSON.parse(readFileSync('evals/seeds.json', 'utf8'));
        expect(train).toHaveLength(256);
        expect(new Set(train).size).toBe(256);
        expect(train.filter((/** @type {number} */ s) => evals.includes(s))).toEqual([]);
    });
});

describe('saveArchive', () => {
    it('stamps generation and the stages reached', () => {
        const args = parseArgs(['--generations', '30', '--out', 'x', '--curriculum', 'evals/train-curriculum.json']);
        const stages = loadStages(args);
        const archive = createArchive(brainLayout(stages[0].built), { descriptor: TRAINER_DESCRIPTOR });
        const dir = join(root, 'save');
        mkdirSync(dir);
        const path = saveArchive(dir, { archive, stages, generation: 24 });
        const json = JSON.parse(readFileSync(path, 'utf8'));
        expect(json.generation).toBe(25);
        expect(json.stages.map((/** @type {any} */ s) => [s.name, s.generations])).toEqual([
            ['nursery', 20],
            ['hunt', 5],
        ]);
        expect(json.rulesHash).toBe(stages[1].rulesHash);
    });
});
