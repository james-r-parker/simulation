import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createArchive, offer } from '../js/evo/archive.js';
import { encodeArchive } from '../js/evo/archive-codec.js';
import { TRAINER_DESCRIPTOR, createTrainerArchive } from '../js/evo/trainer.js';
import { brainLayout } from '../js/sim/brain-layout.js';
import { createConfig } from '../js/sim/config.js';
import { createSimLog } from '../js/sim/log.js';
import { runCheckpoint } from '../scripts/lib/train-checkpoint.mjs';
import { loadResume, loadStages } from '../scripts/lib/train-state.mjs';
import { main as curveMain, readCurve } from '../scripts/train-curve.mjs';
import { main as exportMain, parseArgs as exportArgs } from '../scripts/train-export.mjs';
import { parseArgs } from '../scripts/train.mjs';

const root = mkdtempSync(join(tmpdir(), 'train-cli-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
afterEach(() => vi.restoreAllMocks());

/**
 * @param {() => Promise<number>} run a script's `main`
 * @returns {Promise<{code: number, out: string, err: string}>} its exit code and what it printed
 */
async function capture(run) {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await run();
    return { code, out: out.mock.calls.flat().join('\n'), err: err.mock.calls.flat().join('\n') };
}

describe('train:curve', () => {
    it('refuses a curve file with no rows', () => {
        const dir = join(root, 'empty-curve');
        mkdirSync(dir);
        writeFileSync(join(dir, 'curve.jsonl'), '\n');
        expect(() => readCurve(dir)).toThrow(/no checkpoints yet/);
    });

    it('prints the table for one directory and exits 0; any other usage exits 1 with the usage line', async () => {
        const dir = join(root, 'one-curve');
        mkdirSync(dir);
        const row = { generation: 1, stage: 'world', trainTicks: 10, wallSeconds: 1, coverage: 0.1, qdScore: 1 };
        writeFileSync(join(dir, 'curve.jsonl'), `${JSON.stringify(row)}\n`);
        const ok = await capture(() => curveMain([dir]));
        expect([ok.code, ok.out]).toEqual([0, expect.stringContaining('plateau: no plateau yet')]);
        for (const argv of [[], ['a', 'b'], ['--help']]) {
            const bad = await capture(() => curveMain(argv));
            expect([bad.code, bad.err]).toEqual([1, expect.stringContaining('usage')]);
        }
    });
});

describe('train:export CLI', () => {
    it('needs --archive and --out and reads --config and --label', () => {
        expect(() => exportArgs(['--archive', 'a'])).toThrow(/--archive and --out are required/);
        expect(exportArgs(['--archive', 'a', '--out', 'o', '--config', 'c', '--label', 'l'])).toEqual({
            archive: 'a',
            out: 'o',
            config: 'c',
            label: 'l',
        });
    });

    it('main writes the champions, names the archive file as the label and reports the count', async () => {
        const config = createConfig({});
        const archive = createArchive(brainLayout(config), { descriptor: TRAINER_DESCRIPTOR });
        const row = new Float32Array(archive.layout.weightCount).fill(0.1);
        offer(archive, { spec: 0, cell: 3, row, sigma: 0.1, id: 1, fitness: 2 });
        const file = join(root, 'run7.json');
        writeFileSync(file, JSON.stringify({ ...encodeArchive(archive, config), generation: 4 }));
        const out = join(root, 'exported');
        const result = await capture(() => exportMain(['--archive', file, '--out', out]));
        expect([result.code, result.out]).toEqual([0, 'wrote 1 champion files']);
        const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'));
        expect([index.archive, index.generation, index.champions[0].file]).toEqual([
            'run7.json',
            4,
            'run7-forager-cell3.json',
        ]);
    });

    it('main exits 1 and prints the reason for a bad argument list or a missing archive', async () => {
        const noArgs = await capture(() => exportMain([]));
        expect([noArgs.code, noArgs.err]).toEqual([1, expect.stringContaining('required')]);
        const missing = await capture(() =>
            exportMain(['--archive', join(root, 'nope.json'), '--out', join(root, 'x')]),
        );
        expect(missing.code).toBe(1);
    });
});

describe('stage and resume checks', () => {
    it('refuses a curriculum whose stages have different brain layouts, naming the stage', () => {
        const a = join(root, 'a.json');
        const b = join(root, 'b.json');
        writeFileSync(a, JSON.stringify({}));
        writeFileSync(b, JSON.stringify({ brainHidden: 8 }));
        const curriculum = join(root, 'mixed.json');
        writeFileSync(
            curriculum,
            JSON.stringify([
                { name: 'one', config: a, generations: 1 },
                { name: 'two', config: b },
            ]),
        );
        const args = parseArgs(['--generations', '2', '--out', 'x', '--curriculum', curriculum]);
        expect(() => loadStages(args)).toThrow(/stage "two" has another brain layout than "one"/);
    });

    it('refuses a resume file that has no generation, or one with every generation already done', () => {
        const stages = loadStages(parseArgs(['--generations', '2', '--out', 'x']));
        const config = stages[0].built;
        const log = createSimLog(() => {}, { level: 'error' });
        const encoded = encodeArchive(createTrainerArchive(config), config);
        const bare = join(root, 'bare.json');
        writeFileSync(bare, JSON.stringify(encoded));
        expect(() => loadResume(bare, stages, log)).toThrow(/not a trainer archive/);
        const full = join(root, 'full.json');
        writeFileSync(full, JSON.stringify({ ...encoded, generation: 2 }));
        expect(() => loadResume(full, stages, log)).toThrow(/2 generations are already done; raise --generations/);
    });
});

describe('runCheckpoint', () => {
    it('on an empty archive has no drill edges and still writes a curve row', async () => {
        const stages = loadStages(parseArgs(['--generations', '1', '--out', 'x']));
        const dir = join(root, 'checkpoint');
        mkdirSync(dir);
        const log = createSimLog(() => {}, { level: 'error' });
        const point = await runCheckpoint(
            {
                archive: createTrainerArchive(stages[0].built),
                stage: stages[0],
                progress: { generation: 1, trainTicks: 0, wallSeconds: 0 },
                options: { workers: 1, evalTicks: 5, drillTrials: 1 },
                log,
            },
            dir,
        );
        expect(point.generation).toBe(1);
        expect(readCurve(dir)).toHaveLength(1);
    }, 60000);
});
