import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ELITE, placeOf, seedArchive } from '../js/evo/archive.js';
import { encodeArchive } from '../js/evo/archive-codec.js';
import { snapshotArchive } from '../js/evo/archive-snapshot.js';
import { initialState } from '../js/evo/curriculum.js';
import { addSnapshot, createPool } from '../js/evo/opponent-pool.js';
import { createTrainerArchive } from '../js/evo/trainer.js';
import { WELFORD_STRIDE, welfordAdd } from '../js/evo/welford.js';
import { brainLayout } from '../js/sim/brain-layout.js';
import { createConfig } from '../js/sim/config.js';
import { createSimLog } from '../js/sim/log.js';
import { main, parseArgs } from '../scripts/train-crossplay.mjs';
import {
    checkpointCrossplay,
    createCrossplayState,
    checkpointGenerations,
    loadPlayers,
    playMatrix,
    playerOf,
    preyVsStageNames,
    readsCrossplay,
} from '../scripts/lib/train-crossplay.mjs';

const root = mkdtempSync(join(tmpdir(), 'train-crossplay-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const config = createConfig({});
const layout = brainLayout(config);

/**
 * @param {number} fill the weight every elite holds
 * @param {boolean} [predator] whether the archive holds a predator elite (default true)
 * @returns {import('../js/evo/archive.js').Archive} an archive with a tested forager and, by default, predator elite
 */
function archiveOf(fill, predator = true) {
    const archive = createTrainerArchive(config);
    const specs = predator ? [0, 1] : [0];
    for (const spec of specs) {
        const weights = new Float32Array(layout.weightCount).fill(fill * (spec + 1));
        seedArchive(archive, { spec, cell: 3, id: 100 * spec + Math.round(fill * 10), sigma: 0.1, weights });
        welfordAdd(archive.stats, placeOf(spec, 3, ELITE) * WELFORD_STRIDE, 5);
    }
    return archive;
}

/**
 * @param {string} name the run directory name
 * @param {number[]} fills one archive per checkpoint, each a generation after the last
 * @returns {string} a run directory with `archive-<g>.json` files and a curve row per checkpoint
 */
function runDir(name, fills) {
    const dir = join(root, name);
    mkdirSync(dir, { recursive: true });
    const rows = fills.map((fill, i) => {
        const json = { ...encodeArchive(archiveOf(fill, fill !== 0.5), config), generation: i + 1 };
        writeFileSync(join(dir, `archive-${i}.json`), `${JSON.stringify(json)}\n`);
        return JSON.stringify({ generation: i + 1 });
    });
    writeFileSync(join(dir, 'curve.jsonl'), `${rows.join('\n')}\n`);
    return dir;
}

describe('playerOf', () => {
    it('takes the best predator and forager, and none without both', () => {
        const player = playerOf(archiveOf(0.1));
        expect([player?.predator.spec, player?.forager.spec]).toEqual([1, 0]);
        expect(playerOf(archiveOf(0.1, false))).toBeNull();
    });
});

describe('loadPlayers', () => {
    const dir = runDir('load', [0.1, 0.5, 0.2]);

    it('reads each checkpoint of the curve, leaves out one without both roles, and stops before a generation', () => {
        expect(checkpointGenerations(dir)).toEqual([1, 2, 3]);
        expect(loadPlayers(dir).generations).toEqual([1, 3]);
        expect(loadPlayers(dir, 3).generations).toEqual([1]);
    });
});

describe('checkpointCrossplay', () => {
    it('catches up on the earlier checkpoints, plays the new row and column and reads null with one player', () => {
        const dir = runDir('check', [0.1]);
        /** @type {any} */
        const run = { crossplay: null };
        const first = checkpointCrossplay(run, { dir, archive: archiveOf(0.1), generation: 1, trials: 2 });
        expect(first).toEqual({ hunterProgressLow: null, preyProgressLow: null, cycleShare: null, preyVsStage: {} });
        const next = checkpointCrossplay(run, { dir, archive: archiveOf(0.2), generation: 2, trials: 2 });
        expect(run.crossplay.generations).toEqual([1, 2]);
        expect(run.crossplay.matrix.kills.flat().every((/** @type {any} */ k) => Number.isInteger(k))).toBe(true);
        expect(next.hunterProgressLow).toEqual(expect.any(Number));
        expect(next.cycleShare).toEqual(expect.any(Number));
    });

    it('adds no player for a checkpoint without both roles, and reads its stages against no forager', () => {
        const dir = runDir('no-player', [0.1]);
        /** @type {any} */
        const run = { crossplay: null, pool: createPool() };
        const read = checkpointCrossplay(run, {
            dir,
            archive: archiveOf(0.2, false),
            generation: 2,
            trials: 2,
            preyStages: ['hunt'],
        });
        expect(run.crossplay.generations).toEqual([1]);
        expect(read).toEqual({
            hunterProgressLow: null,
            preyProgressLow: null,
            cycleShare: null,
            preyVsStage: { hunt: null },
        });
    });
});

describe('playMatrix', () => {
    it('logs a CrossplayCell per cell, marking the pack cells when the group cells are played', () => {
        const found = {
            generations: [1, 2],
            players: [archiveOf(0.1), archiveOf(0.2)].map((a) => /** @type {any} */ (playerOf(a))),
        };
        /** @type {Record<string, any>[]} */
        const records = [];
        const log = createSimLog((r) => records.push(r), { level: 'debug' });
        playMatrix(createCrossplayState(found, 2), { group: true, log });
        const cells = records.filter((r) => r.event === 'CrossplayCell');
        expect(cells.some((r) => r.group === true)).toBe(true);
        expect(cells.some((r) => !('group' in r))).toBe(true);
    });
});

describe('preyVsStage readings', () => {
    it('reads the stage-pass snapshot of a stage against the latest forager, and null for a stage with none', () => {
        const dir = runDir('prey-vs', [0.1]);
        const entry = { snapshot: snapshotArchive(archiveOf(0.3)), generation: 1, stage: 'hunt', kind: 'stage-pass' };
        /** @type {any} */
        const run = { crossplay: null, pool: addSnapshot(createPool(), /** @type {any} */ (entry)) };
        const read = checkpointCrossplay(run, {
            dir,
            archive: archiveOf(0.2),
            generation: 2,
            trials: 2,
            preyStages: ['hunt', 'pack'],
        });
        expect(read.preyVsStage.pack).toBeNull();
        expect(read.preyVsStage.hunt).toBeGreaterThan(-1);
        expect(read.preyVsStage.hunt).toBeLessThan(1);
        expect(Object.keys(run.crossplay.stageKills)).toEqual(['hunt']);
    });

    it('names the stages a gate of the current or a passed stage reads', () => {
        const gate = [{ read: 'crossplay.preyVsStage.hunt', min: 0.01 }];
        const stages = /** @type {any} */ ([{ name: 'evade', minGenerations: 1, maxGenerations: 2, gate }]);
        const state = initialState(stages, 4);
        expect(preyVsStageNames(stages, state)).toEqual(['hunt']);
        expect(preyVsStageNames([{ ...stages[0], gate: [{ read: 'retention.all', min: 1 }] }], state)).toEqual([]);
    });
});

describe('readsCrossplay', () => {
    const gate = [{ read: 'crossplay.cycleShare', max: 0.25 }];
    const stages = /** @type {any} */ ([
        { name: 'a', generations: 1, from: 0, to: 1 },
        { name: 'b', minGenerations: 1, maxGenerations: 2, gate },
    ]);

    it('is true for a current stage whose gate reads crossplay, and for a passed stage that did', () => {
        const state = initialState(/** @type {any} */ ([{ name: 'b', minGenerations: 1, maxGenerations: 2, gate }]), 4);
        expect(readsCrossplay(stages, state)).toBe(true);
        expect(readsCrossplay([{ ...stages[1], gate: [{ read: 'retention.all', min: 1 }] }], state)).toBe(false);
    });
});

describe('npm run train:crossplay', () => {
    it('parses the run directory and the options', () => {
        expect(parseArgs(['d', '--trials', '3', '--no-group'])).toEqual({ dir: 'd', trials: 3, group: false });
        expect(parseArgs(['d'])).toMatchObject({ trials: 64, group: true });
        expect(() => parseArgs(['--trials', '3'])).toThrow(/run directory/);
    });

    it('writes crossplay.json and prints the matrix and the three numbers', async () => {
        const dir = runDir('script', [0.1, 0.2]);
        /** @type {string[]} */
        const lines = [];
        const log = console.log;
        console.log = (/** @type {string} */ l) => lines.push(l);
        try {
            expect(await main([dir, '--trials', '2'])).toBe(0);
        } finally {
            console.log = log;
        }
        const record = JSON.parse(readFileSync(join(dir, 'crossplay.json'), 'utf8'));
        expect(record.generations).toEqual([1, 2]);
        expect(record.kills).toHaveLength(2);
        expect(record.packKills).toHaveLength(2);
        expect(lines.join('\n')).toMatch(/hunter progress[\s\S]*prey progress[\s\S]*cycle share/);
    });

    it('plays no pack cells with --no-group', async () => {
        const dir = runDir('no-group', [0.1, 0.2]);
        const log = console.log;
        console.log = () => {};
        try {
            expect(await main([dir, '--trials', '2', '--no-group'])).toBe(0);
        } finally {
            console.log = log;
        }
        expect(JSON.parse(readFileSync(join(dir, 'crossplay.json'), 'utf8')).packKills).toBeNull();
    });

    it('refuses a run with fewer than two checkpoints with champions of both roles', async () => {
        const dir = runDir('thin', [0.1]);
        const error = console.error;
        console.error = () => {};
        try {
            expect(await main([dir])).toBe(1);
        } finally {
            console.error = error;
        }
    });
});
