import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createArchive, offer } from '../js/evo/archive.js';
import { encodeArchive } from '../js/evo/archive-codec.js';
import { TRAINER_DESCRIPTOR } from '../js/evo/trainer.js';
import { brainLayout } from '../js/sim/brain-layout.js';
import { createConfig } from '../js/sim/config.js';
import { loadStages } from '../scripts/lib/train-state.mjs';
import { runExport } from '../scripts/train-export.mjs';
import { parseArgs } from '../scripts/train.mjs';

const root = mkdtempSync(join(tmpdir(), 'train-floor-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('the curriculum floor guard', () => {
    it('lets every committed curriculum load', () => {
        const files = readdirSync('evals').filter((f) => /^train-curriculum.*\.json$/.test(f));
        expect(files.length).toBeGreaterThan(1);
        for (const file of files) {
            const args = parseArgs(['--generations', '5', '--out', 'x', '--curriculum', `evals/${file}`]);
            expect(() => loadStages(args), file).not.toThrow();
        }
    });

    it('refuses a curriculum whose final stage is not the target world', () => {
        const path = join(root, 'curriculum-hunt-last.json');
        writeFileSync(path, JSON.stringify([{ name: 'hunt', config: 'evals/train-hunt-world.json' }]));
        expect(() => loadStages(parseArgs(['--generations', '5', '--out', 'x', '--curriculum', path]))).toThrow(
            /not the target world/,
        );
    });
});

describe('train:export under public/champions', () => {
    it('refuses an archive whose last stage is not the target world, and allows the same archive elsewhere', () => {
        const config = createConfig(JSON.parse(readFileSync('evals/micro-world.json', 'utf8')));
        const archive = createArchive(brainLayout(config), { descriptor: TRAINER_DESCRIPTOR });
        const row = new Float32Array(archive.layout.weightCount);
        offer(archive, { spec: 0, cell: 4, row, sigma: 0.1, id: 7, fitness: 3 });
        const stages = [{ name: 'hunt', rulesHash: 'not-the-target', generations: 1 }];
        const file = join(root, 'archive-hunt.json');
        writeFileSync(file, JSON.stringify({ ...encodeArchive(archive, config), generation: 1, stages }));
        const guarded = join(process.cwd(), 'public', 'champions', 'guard-test');
        expect(() => runExport({ archive: file, out: guarded, config: null, label: null })).toThrow(
            /not the target world/,
        );
        const local = join(root, 'local');
        expect(() => runExport({ archive: file, out: local, config: null, label: null })).not.toThrow();
    });
});
