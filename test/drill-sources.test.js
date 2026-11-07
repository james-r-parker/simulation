import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createArchive, offer } from '../js/evo/archive.js';
import { encodeArchive } from '../js/evo/archive-codec.js';
import { snapshotArchive } from '../js/evo/archive-snapshot.js';
import { createTrainerArchive } from '../js/evo/trainer.js';
import { brainLayout } from '../js/sim/brain-layout.js';
import { createConfig } from '../js/sim/config.js';
import { runDrillTask } from '../scripts/drill-worker.mjs';
import { parseArgs, runDrills } from '../scripts/drill.mjs';
import { fileSubject } from '../scripts/lib/drill-subjects.mjs';
import { runTrainTask } from '../scripts/train-worker.mjs';
import { makeChampionFile } from './evo/helpers/champion-file.js';

const root = mkdtempSync(join(tmpdir(), 'drill-sources-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('drill --archive', () => {
    it('drills the archive elites, prints the JSON report and writes it to --out', async () => {
        const config = createConfig({});
        const archive = createArchive(brainLayout(config));
        const row = new Float32Array(archive.layout.weightCount).fill(0.05);
        offer(archive, { spec: 0, cell: 2, row, sigma: 0.1, id: 5, fitness: 1 });
        const file = join(root, 'archive.json');
        writeFileSync(file, JSON.stringify(encodeArchive(archive, config)));
        const out = join(root, 'report.json');
        /** @type {string[]} */
        const lines = [];
        const args = parseArgs([
            ...['--archive', file, '--trials', '1', '--drills', 'food-ahead', '--workers', '1'],
            ...['--json', '--out', out],
        ]);
        const rows = await runDrills(args, { logDir: join(root, 'logs'), print: (l) => lines.push(l) });
        expect(rows.map((r) => r.label)).toEqual(['elite-forager-cell2', 'reference memoryless']);
        expect(JSON.parse(lines.join('\n'))).toBeTypeOf('object');
        expect(readFileSync(out, 'utf8')).toBe(`${lines.join('\n')}\n`);
    });
});

describe('fileSubject', () => {
    it('turns a champion file into a subject with its genome id, or 0 when the file has none', () => {
        const config = createConfig({});
        const champion = makeChampionFile('c', 3, { specialisation: 1 });
        const plain = fileSubject(champion, config);
        expect([plain.name, plain.id, plain.spec, plain.act]).toEqual(['c', 0, 1, null]);
        expect(fileSubject({ ...champion, genomeId: 9 }, config).id).toBe(9);
        expect(() => fileSubject({ ...champion, rulesHash: 'nope' }, config)).toThrow();
    });
});

describe('the drill worker task', () => {
    const subject = { name: 'x', id: 1, spec: 0, weights: null, reference: 'memoryless' };

    it('plays a scripted reference subject and returns the score with a record per trial', () => {
        const result = runDrillTask({ drill: 'food-ahead', subject, seed: 1, trials: 2, config: {} });
        expect(result.trials).toBe(2);
        expect(result.records).toHaveLength(2);
    });

    it('plays a genome subject from its weights', () => {
        const layout = brainLayout(createConfig({}));
        const genome = { ...subject, reference: null, weights: new Float32Array(layout.weightCount) };
        const result = runDrillTask({ drill: 'food-ahead', subject: genome, seed: 1, trials: 1, config: {} });
        expect(result.records).toHaveLength(1);
    });

    it('names an unknown drill', () => {
        expect(() => runDrillTask({ drill: 'nope', subject, seed: 1, trials: 1, config: {} })).toThrow(
            /unknown drill "nope"/,
        );
    });
});

describe('the train worker task', () => {
    it('runs the episode and adds its wall time', () => {
        const overrides = { initialAgents: 10, maxAgents: 20, minAgents: 5 };
        const snapshot = snapshotArchive(createTrainerArchive(createConfig(overrides)));
        const result = runTrainTask({ seed: 3, overrides, snapshot, ticks: 20, offerFromTick: 0 });
        expect(result.ticks).toBe(20);
        expect(result.wallMs).toBeGreaterThanOrEqual(0);
        expect(result.metrics).toEqual({});
    });
});
