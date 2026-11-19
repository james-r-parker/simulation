import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

/** @type {any[]} */
let seen = [];

const subject = (/** @type {number} */ id, /** @type {number} */ lowerBound) => ({
    name: `s${id}`,
    id,
    spec: 0,
    style: 'balanced',
    lowerBound,
    weights: Float32Array.from([id, 0.5]),
    act: null,
});

vi.mock('../scripts/lib/train-checkpoint.mjs', async (importOriginal) => ({
    ...(await importOriginal()),
    runCheckpoint: vi.fn(async (/** @type {any} */ run) => {
        seen.push({ stage: run.stage.name, keepers: run.options.keepers });
        const food = run.stage.name === 'one' ? 0.9 : 0.1;
        return {
            point: { generation: run.progress.generation, stage: run.stage.name },
            subjects: [subject(1, 0.2), subject(2, 0.4)],
            readings:
                run.options.gate === null
                    ? null
                    : { drill: { 'food-ahead': { edgeLow: food }, 'prey-ahead': { edgeLow: 0.9 } } },
        };
    }),
}));

const { parseArgs, runTraining } = await import('../scripts/train.mjs');

const root = mkdtempSync(join(tmpdir(), 'train-keepers-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const WORLD = {
    worldWidth: 2400,
    worldHeight: 1600,
    initialAgents: 40,
    maxAgents: 80,
    minAgents: 20,
    maxFood: 60,
    initialFood: 60,
    maturityTicks: 200,
    herdCount: 0,
    refugeCount: 0,
    wallGaps: 1,
    coldMarginWidth: 0,
};
const world = join(root, 'w.json');
writeFileSync(world, JSON.stringify(WORLD));

/** @param {boolean} keep @returns {string} a two-stage ladder file */
function ladderFile(keep) {
    const file = join(root, `ladder-${keep}.json`);
    const one = { name: 'one', config: world, minGenerations: 1, maxGenerations: 4 };
    writeFileSync(
        file,
        JSON.stringify([
            { ...one, gate: [{ read: 'drill.food-ahead.edgeLow', min: 0.3 }], ...(keep ? { keepPasser: true } : {}) },
            {
                name: 'two',
                config: world,
                gate: [{ read: 'drill.prey-ahead.edgeLow', min: 0.3 }],
                minGenerations: 1,
                maxGenerations: 40,
            },
            { name: 'world', config: null },
        ]),
    );
    return file;
}

/** @param {string} ladder @param {string} out @returns {string[]} arguments */
const args = (ladder, out) => [
    ...['--curriculum', ladder, '--episodes', '2', '--ticks', '400', '--offer-from', '100'],
    ...['--checkpoint-every', '1', '--generations', '6', '--out', join(root, out)],
];

beforeEach(() => {
    seen = [];
});

describe('kept passers in the trainer', () => {
    it(
        'keeps the champions that passed a keepPasser stage, saves them and hands them to later checkpoints',
        async () => {
            await runTraining(parseArgs(args(ladderFile(true), 'keep')), { gateTrials: 2 });
            const saved = JSON.parse(readFileSync(join(root, 'keep', 'archive-5.json'), 'utf8'));
            expect(saved.keepers.one.map((/** @type {any} */ k) => k.id)).toEqual([2, 1]);
            expect(saved.keepers.one[0].weights).toEqual([2, 0.5]);
            expect(seen[0].keepers).toEqual({ kept: {}, stages: expect.any(Array) });
            expect(Object.keys(seen.at(-1).keepers.kept)).toEqual(['one']);
            const log = readFileSync(join(root, 'keep', 'train.jsonl'), 'utf8');
            expect(log).toContain('"TrainKeep"');
        },
        scaleTimeout(120000),
    );

    it(
        'changes nothing for a ladder with no keepPasser stage: no keepers asked for or saved',
        async () => {
            await runTraining(parseArgs(args(ladderFile(false), 'plain')), { gateTrials: 2 });
            expect(seen.every((s) => s.keepers === undefined)).toBe(true);
            const saved = JSON.parse(readFileSync(join(root, 'plain', 'archive-5.json'), 'utf8'));
            expect(saved.keepers).toBeUndefined();
        },
        scaleTimeout(120000),
    );
});
