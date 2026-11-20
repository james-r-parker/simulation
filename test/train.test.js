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
import { checkOut } from '../scripts/lib/train-args.mjs';
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
        const args = parseArgs([
            '--generations',
            '45',
            '--out',
            'x',
            '--curriculum',
            'test/fixtures/train-curriculum.json',
        ]);
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

describe('train:curve with gates', () => {
    it('adds a gate and a retention column and a reading line per gate checkpoint, only for a gated run', () => {
        const row = (/** @type {number} */ g, /** @type {Record<string, any>} */ extra) => ({
            generation: g,
            stage: 'hunt',
            trainTicks: g * 1000,
            wallSeconds: 5,
            coverage: 0.1,
            qdScore: 1,
            drillEdge: 0.2,
            ...extra,
        });
        const cond = { read: 'drill.food-ahead.edgeLow', value: 0.45, min: 0.3, passed: true };
        const rows = [
            row(1, {}),
            row(2, { gate: { stage: 'hunt', passed: false, conditions: [{ ...cond, value: 0.1, passed: false }] } }),
            row(3, {
                gate: {
                    stage: 'hunt',
                    passed: true,
                    stagePassed: true,
                    conditions: [cond],
                    retention: { nursery: 1, all: 1 },
                },
            }),
        ];
        const lines = formatCurve(rows);
        expect(lines[0]).toMatch(/drill edge\s+gate\s+retention\s+progress\s+best\s+food_energy_per_1k/);
        expect(lines[1]).toMatch(/^1\s+hunt.*\s-\s+-\s/);
        expect(lines[2]).toMatch(/\sfail\s+-\s/);
        expect(lines[3]).toMatch(/\sPASSED\s+nursery:1 all:1\s/);
        expect(lines.slice(4, 6)).toEqual([
            '  gen 2 hunt fail: drill.food-ahead.edgeLow 0.100 >= 0.3 FAIL',
            '  gen 3 hunt PASSED: drill.food-ahead.edgeLow 0.450 >= 0.3 ok',
        ]);
        expect(lines.at(-1)).toMatch(/^plateau:/);
        expect(formatCurve([rows[0]])[0]).not.toContain('retention');
        const regressed = row(4, {
            gate: { stage: 'hunt', passed: false, regressed: 'nursery', conditions: [], retention: {} },
        });
        expect(formatCurve([regressed])[1]).toContain('REGRESSED nursery');
        const max = formatCurve([
            row(1, {
                gate: { stage: 's', passed: true, conditions: [{ read: 'x', value: null, max: 2, passed: false }] },
            }),
        ]);
        expect(max[2]).toBe('  gen 1 s pass: x - <= 2 FAIL');
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
    it('writes the champion of each specialisation that the league validator accepts, stamped for the default world', () => {
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

    it('writes both style bands of a specialisation, each with its style in the file and the index', () => {
        const config = createConfig(JSON.parse(readFileSync('evals/micro-world.json', 'utf8')));
        const archive = createArchive(brainLayout(config), { descriptor: TRAINER_DESCRIPTOR });
        const row = new Float32Array(archive.layout.weightCount).fill(0.1);
        offer(archive, { spec: 1, cell: 9, row, sigma: 0.1, id: 8, fitness: 2 });
        offer(archive, { spec: 1, cell: 73, row, sigma: 0.1, id: 9, fitness: 2 });
        const file = join(root, 'archive-bands.json');
        writeFileSync(file, JSON.stringify({ ...encodeArchive(archive, config), generation: 1, stages: [] }));
        const out = join(root, 'champion-bands');
        const files = runExport({ archive: file, out, config: null, label: 'bands' });
        expect(files.map((f) => [f.name, f.style])).toEqual([
            ['bands-predator-cell9', 'low'],
            ['bands-predator-cell73', 'high'],
        ]);
        const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'));
        expect(index.champions.map((/** @type {any} */ c) => c.style)).toEqual(['low', 'high']);
        const skip = JSON.parse(readFileSync(join(out, 'skip-cells.json'), 'utf8'));
        expect(skip.champions.count).toBe(2);
        const subjects = loadChampions(out, { config: {}, log: /** @type {any} */ ({ log: () => {} }) });
        expect(subjects).toHaveLength(2);
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

    it('reads the layout from --config, and writes a null generation for an archive without one', () => {
        const config = createConfig({});
        const archive = createArchive(brainLayout(config), { descriptor: TRAINER_DESCRIPTOR });
        offer(archive, {
            spec: 0,
            cell: 2,
            row: new Float32Array(archive.layout.weightCount),
            sigma: 0.1,
            id: 1,
            fitness: 1,
        });
        const file = join(root, 'no-generation.json');
        writeFileSync(file, JSON.stringify(encodeArchive(archive, config)));
        const same = join(root, 'same-layout.json');
        writeFileSync(same, JSON.stringify({}));
        const out = join(root, 'no-generation');
        runExport({ archive: file, out, config: same, label: 'g' });
        expect(JSON.parse(readFileSync(join(out, 'index.json'), 'utf8')).generation).toBeNull();
        const wider = join(root, 'wider-layout.json');
        writeFileSync(wider, JSON.stringify({ brainHidden: 8 }));
        expect(() => runExport({ archive: file, out: join(root, 'wider'), config: wider, label: 'g' })).toThrow();
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
        const args = parseArgs([
            '--generations',
            '30',
            '--out',
            'x',
            '--curriculum',
            'test/fixtures/train-curriculum.json',
        ]);
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

describe('--until, --scratch and the /tmp refusal', () => {
    it('refuses a gated curriculum with no checkpoints', () => {
        const file = join(root, 'gated-no-checkpoints.json');
        const gate = [{ read: 'retention.all', min: 1 }];
        writeFileSync(file, JSON.stringify([{ name: 'one', config: null, gate, maxGenerations: 3 }]));
        const args = parseArgs(['--generations', '3', '--out', 'x', '--curriculum', file, '--checkpoint-every', '0']);
        expect(() => loadStages(args)).toThrow(/is gated, so it needs checkpoints/);
        expect(loadStages({ ...args, checkpointEvery: 1 })).toHaveLength(1);
    });

    it('cuts the default curriculum at --until, and names its one stage for an unknown one', () => {
        const base = ['--generations', '1', '--out', 'x'];
        expect(loadStages(parseArgs([...base, '--until', 'default'])).map((s) => s.name)).toEqual(['default']);
        expect(() => loadStages(parseArgs([...base, '--until', 'habitat']))).toThrow(
            /--until: no stage "habitat"; the stages are default/,
        );
    });

    it('reads --until and --scratch, defaulting to none', () => {
        const base = ['--generations', '1', '--out', 'x'];
        expect(parseArgs(base)).toMatchObject({ until: null, scratch: false });
        expect(parseArgs([...base, '--until', 'habitat', '--scratch'])).toMatchObject({
            until: 'habitat',
            scratch: true,
        });
    });

    it('refuses an --out under /tmp unless --scratch is given, and accepts any other path', () => {
        const run = (/** @type {string[]} */ argv) => () => checkOut(parseArgs(['--generations', '1', ...argv]));
        expect(run(['--out', '/tmp/x'])).toThrow(/under \/tmp; use \.sim\/train\/<name>/);
        expect(run(['--out', '/tmp'])).toThrow(/under \/tmp/);
        expect(run(['--out', '/tmp/../tmp/y'])).toThrow(/under \/tmp/);
        expect(run(['--out', '/tmp/x', '--scratch'])).not.toThrow();
        expect(run(['--out', '.sim/train/x'])).not.toThrow();
        expect(run(['--out', '/tmpx/y'])).not.toThrow();
    });
});
