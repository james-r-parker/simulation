import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createArchive, offer } from '../js/evo/archive.js';
import { encodeArchive } from '../js/evo/archive-codec.js';
import { TRAINER_DESCRIPTOR, createTrainerArchive } from '../js/evo/trainer.js';
import { brainLayout } from '../js/sim/brain-layout.js';
import { createConfig, rulesHash } from '../js/sim/config.js';
import { decodeTrainerArchive, readArchiveFile, readDrillConfig } from '../scripts/lib/archive-source.mjs';
import { parseArgs as parseDrill, runDrills } from '../scripts/drill.mjs';
import { parseArgs as parseReflex, runReflex } from '../scripts/reflex.mjs';

const root = mkdtempSync(join(tmpdir(), 'archive-source-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const STAGE = new URL('../evals/stages/hunt-contact.json', import.meta.url).pathname;

/**
 * Writes a trainer archive (descriptor v7) with one predator elite, stamped with a stage's `rulesHash`, not the default's.
 * @returns {string} the file
 */
function trainerArchiveFile() {
    const config = createConfig({});
    const archive = createTrainerArchive(config);
    offer(archive, {
        spec: 1,
        cell: 2,
        row: new Float32Array(archive.layout.weightCount).fill(0.05),
        sigma: 0.1,
        id: 9,
        fitness: 1,
    });
    const file = join(root, 'trainer-archive.json');
    const stageHash = rulesHash(createConfig({ digestTicks: 7 }));
    writeFileSync(file, JSON.stringify({ ...encodeArchive(archive, config), rulesHash: stageHash, generation: 3 }));
    return file;
}

describe('readDrillConfig', () => {
    it('is empty for no file', () => {
        expect(readDrillConfig(null)).toEqual({});
    });

    it('keeps the specialisations and the rules of a stage file and drops the keys that size and fill its world', () => {
        const config = readDrillConfig(STAGE);
        expect(Object.keys(config)).toEqual(['specialisations']);
        expect(config.specialisations.forager.turnMultiplier).toBe(0.5);
    });

    it('keeps a plain config override', () => {
        const file = join(root, 'plain.json');
        writeFileSync(file, JSON.stringify({ digestTicks: 5, initialAgents: 60 }));
        expect(readDrillConfig(file)).toEqual({ digestTicks: 5 });
    });
});

describe('trainer archives', () => {
    it('decodeTrainerArchive reads a v7 archive whose rulesHash is another stage', () => {
        const json = JSON.parse(
            JSON.stringify(encodeArchive(createTrainerArchive(createConfig({})), createConfig({}))),
        );
        const archive = decodeTrainerArchive({ ...json, rulesHash: 'stage-hash' }, createConfig({}));
        expect(archive.descriptor.name).toBe(TRAINER_DESCRIPTOR.name);
    });

    it('readArchiveFile reads a trainer archive and a policy archive', () => {
        const trainer = readArchiveFile(trainerArchiveFile(), {}, /** @type {any} */ (undefined));
        expect(trainer.descriptor.name).toBe(TRAINER_DESCRIPTOR.name);
        const config = createConfig({});
        const policy = createArchive(brainLayout(config));
        const file = join(root, 'policy-archive.json');
        writeFileSync(file, JSON.stringify(encodeArchive(policy, config)));
        expect(readArchiveFile(file, {}, /** @type {any} */ (undefined)).descriptor.name).not.toBe(
            TRAINER_DESCRIPTOR.name,
        );
    });
});

describe('drill and reflex on a trainer archive and a stage file', () => {
    it('drill --archive drills a trainer archive and --config takes a stage file', async () => {
        const args = parseDrill([
            ...['--archive', trainerArchiveFile(), '--config', STAGE, '--trials', '1', '--drills', 'prey-ahead'],
            ...['--workers', '1'],
        ]);
        const rows = await runDrills(args, { logDir: join(root, 'drill-logs'), print: () => {} });
        expect(rows.map((r) => r.label)).toEqual(['elite-predator-cell2', 'reference memoryless']);
    });

    it('reflex --archive scores a trainer archive and --config takes a stage file', async () => {
        const args = parseReflex([
            ...['--archive', trainerArchiveFile(), '--config', STAGE, '--trials', '1', '--cases', 'approach-prey'],
            ...['--workers', '1'],
        ]);
        const { rows } = await runReflex(args, { logDir: join(root, 'reflex-logs') });
        expect(rows.map((r) => r.label)).toEqual(['elite-predator-cell2']);
        expect(rows[0].row?.cases['approach-prey']).toBeDefined();
    });
});
