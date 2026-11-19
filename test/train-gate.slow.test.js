import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

/** @type {(call: number, stage: string) => Record<string, any>} */
let script = () => ({});
let calls = 0;

vi.mock('../scripts/lib/train-checkpoint.mjs', async (importOriginal) => ({
    ...(await importOriginal()),
    runCheckpoint: vi.fn(async (/** @type {any} */ run) => ({
        point: {
            generation: run.progress.generation,
            stage: run.stage.name,
            drillLossReasons: { 'food-ahead': { 'never-bit': 3 }, 'prey-ahead': { 'never-bit': 3 } },
        },
        readings: run.options.gate === null ? null : script(calls++, run.stage.name),
    })),
}));

const { main, parseArgs, runTraining, TrainStalled } = await import('../scripts/train.mjs');

const root = mkdtempSync(join(tmpdir(), 'train-gate-'));
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
const fileA = join(root, 'a.json');
const fileB = join(root, 'b.json');
writeFileSync(fileA, JSON.stringify(WORLD));
writeFileSync(fileB, JSON.stringify({ ...WORLD, maxFood: 40, initialFood: 40 }));
const ladder = join(root, 'ladder.json');
writeFileSync(
    ladder,
    JSON.stringify([
        {
            name: 'one',
            config: fileA,
            gate: [{ read: 'drill.food-ahead.edgeLow', min: 0.3 }],
            minGenerations: 1,
            maxGenerations: 4,
        },
        {
            name: 'two',
            config: fileB,
            gate: [
                { read: 'drill.prey-ahead.edgeLow', min: 0.3 },
                { read: 'retention.all', min: 1 },
            ],
            minGenerations: 1,
            maxGenerations: 40,
        },
        { name: 'world', config: null },
    ]),
);

/**
 * @param {number} food the `food-ahead` edge low bound
 * @param {number} [prey] the `prey-ahead` edge low bound
 * @returns {Record<string, any>} gate readings
 */
const edge = (food, prey = 0) => ({ drill: { 'food-ahead': { edgeLow: food }, 'prey-ahead': { edgeLow: prey } } });

/**
 * @param {string} name the output directory name
 * @param {string[]} extra more arguments
 * @returns {string[]} arguments for a tiny gated run into `name`
 */
function tiny(name, extra = []) {
    const base = ['--curriculum', ladder, '--episodes', '2', '--ticks', '400', '--offer-from', '100'];
    return [...base, '--checkpoint-every', '1', '--out', join(root, name), ...extra];
}

/**
 * @param {string} name the output directory name
 * @returns {Record<string, any>[]} the run's log records
 */
function logOf(name) {
    return readFileSync(join(root, name, 'train.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l));
}

beforeEach(() => {
    calls = 0;
    script = () => edge(0.9, 0.9);
});

describe('a gated ladder', () => {
    it(
        'advances on its gates, records the passes, and carries the gate columns on the curve',
        async () => {
            await runTraining(parseArgs(['--generations', '6', ...tiny('advance')]), { gateTrials: 2 });
            const log = logOf('advance');
            expect(log.filter((r) => r.event === 'TrainStage').map((r) => [r.stage, r.generation])).toEqual([
                ['one', 0],
                ['two', 2],
                ['world', 4],
            ]);
            expect(log.filter((r) => r.event === 'TrainStagePassed').map((r) => [r.stage, r.generation])).toEqual([
                ['one', 2],
                ['two', 4],
            ]);
            const last = JSON.parse(readFileSync(join(root, 'advance', 'archive-5.json'), 'utf8'));
            expect(last.stages.map((/** @type {any} */ s) => [s.name, s.generations, s.passedAt])).toEqual([
                ['one', 2, 2],
                ['two', 2, 4],
                ['world', 2, undefined],
            ]);
            expect(last.stages[0].gate[0]).toMatchObject({
                read: 'drill.food-ahead.edgeLow',
                value: 0.9,
                passed: true,
            });
            expect(last.trainState.passed.one.checkpoints).toBe(2);
            const manifest = JSON.parse(readFileSync(join(root, 'advance', 'manifest.json'), 'utf8'));
            expect(manifest).toMatchObject({ status: 'done', generationsDone: 6, commandLine: null });
            expect(manifest.curriculum.file).toBe(ladder);
            expect(manifest.stages.map((/** @type {any} */ s) => [s.name, s.passedAt])).toEqual([
                ['one', 2],
                ['two', 4],
                ['world', undefined],
            ]);
            const rows = readFileSync(join(root, 'advance', 'curve.jsonl'), 'utf8')
                .trim()
                .split('\n')
                .map((l) => JSON.parse(l));
            expect(rows).toHaveLength(6);
            expect(rows[1].gate).toMatchObject({ stage: 'one', passed: true, stagePassed: true });
            expect(rows[0].gate.retention).toEqual({ all: 1 });
            expect(rows[2].gate.retention).toEqual({ one: 1, all: 1 });
            expect(rows[3].gate).toMatchObject({ stage: 'two', stagePassed: true, retention: { one: 1, all: 1 } });
            expect(rows[4].gate).toBeUndefined();
            expect(rows[0]).toMatchObject({ progress: expect.any(Number), workers: expect.any(Number) });
            expect(rows[1].bestProgress).toBeGreaterThanOrEqual(rows[1].progress);
            expect(rows[1].cpuSeconds).toBeGreaterThanOrEqual(rows[0].cpuSeconds);
            expect(rows[4].progress).toBeUndefined();
            expect(log.filter((r) => r.event === 'TrainProgress').map((r) => r.stage)).toEqual([
                'one',
                'one',
                'two',
                'two',
            ]);
        },
        scaleTimeout(120000),
    );

    it(
        'stops with exit code 3 when a required stage cannot pass, keeping the archive and the curve',
        async () => {
            script = () => edge(0.1);
            const run = runTraining(parseArgs(['--generations', '9', ...tiny('stall')]), { gateTrials: 2 });
            await expect(run).rejects.toThrow(TrainStalled);
            await expect(run).rejects.toMatchObject({ exitCode: 3 });
            await expect(run).rejects.toThrow(/stage "one".*drill\.food-ahead\.edgeLow: 0\.1.*never-bit/s);
            await expect(run).rejects.toThrow(/did not pass its gate \(max, best progress 0\.\d{3}\)/);
            expect(readFileSync(join(root, 'stall', 'archive-3.json'), 'utf8')).toContain('"stalledAt":4');
            expect(
                readFileSync(join(root, 'stall', 'curve.jsonl'), 'utf8')
                    .trim()
                    .split('\n'),
            ).toHaveLength(4);
            const events = logOf('stall').filter((r) => r.event === 'TrainStageStalled');
            expect(events).toHaveLength(1);
            expect(events[0]).toMatchObject({ level: 'error', stage: 'one', optional: false, generation: 4 });
            const code = await main(['--generations', '9', ...tiny('stall-cli', ['--scratch'])]);
            expect(code).toBe(3);
        },
        scaleTimeout(120000),
    );

    it.runIf(tmpdir().startsWith('/tmp'))(
        'refuses an --out under /tmp without --scratch',
        async () => {
            expect(await main(['--generations', '1', ...tiny('refused')])).toBe(1);
            expect(() => readFileSync(join(root, 'refused', 'train.jsonl'))).toThrow();
        },
        scaleTimeout(60000),
    );

    it(
        'reviews a stage whose retention fails twice, in its own world, then returns',
        async () => {
            script = (call) => (call < 2 ? edge(0.9, 0.9) : call < 4 ? edge(0.1, 0.9) : edge(0.9, 0.9));
            await runTraining(parseArgs(['--generations', '10', ...tiny('review')]), { gateTrials: 2 });
            const log = logOf('review');
            expect(log.filter((r) => r.event === 'TrainStageRegressed').map((r) => [r.stage, r.generation])).toEqual([
                ['one', 4],
            ]);
            expect(log.filter((r) => r.event === 'TrainReview').map((r) => [r.stage, r.review])).toEqual([['one', 1]]);
            expect(log.filter((r) => r.event === 'TrainStage').map((r) => r.stage)).toEqual([
                'one',
                'two',
                'one',
                'two',
            ]);
            const curve = readFileSync(join(root, 'review', 'curve.jsonl'), 'utf8')
                .trim()
                .split('\n')
                .map((l) => JSON.parse(l));
            expect(curve[3].gate).toMatchObject({ stage: 'two', passed: false, regressed: 'one' });
            const last = JSON.parse(readFileSync(join(root, 'review', 'archive-9.json'), 'utf8'));
            expect(last.stages.find((/** @type {any} */ s) => s.name === 'one')).toMatchObject({
                generations: 7,
                reviews: 1,
                passedAt: 2,
            });
        },
        scaleTimeout(120000),
    );

    it(
        'stops after --until, writes the same archives with 1 and 2 workers, and resumes to the same archive',
        async () => {
            await runTraining(parseArgs(['--generations', '8', ...tiny('w1', ['--workers', '1'])]), { gateTrials: 2 });
            await runTraining(parseArgs(['--generations', '8', ...tiny('w2', ['--workers', '2'])]), { gateTrials: 2 });
            expect(readFileSync(join(root, 'w1', 'archive-7.json'), 'utf8')).toBe(
                readFileSync(join(root, 'w2', 'archive-7.json'), 'utf8'),
            );
            await runTraining(parseArgs(['--generations', '3', ...tiny('part')]), { gateTrials: 2 });
            const resume = ['--resume', join(root, 'part', 'archive-2.json')];
            await runTraining(parseArgs(['--generations', '8', ...resume, ...tiny('rest')]), { gateTrials: 2 });
            expect(readFileSync(join(root, 'rest', 'archive-7.json'), 'utf8')).toBe(
                readFileSync(join(root, 'w1', 'archive-7.json'), 'utf8'),
            );
            const uses = (/** @type {string} */ name) =>
                JSON.parse(readFileSync(join(root, name, 'manifest.json'), 'utf8')).partitions.uses.map(
                    (/** @type {any} */ u) => `${u.purpose}:${u.partition}`,
                );
            const gates = (/** @type {number} */ n) => Array(n).fill('gate:validation');
            expect(uses('w1')).toEqual(['train:training', ...gates(4)]);
            expect(uses('rest')).toEqual(['train:training', ...gates(3), 'resume:training', ...gates(1)]);
            expect(uses('w1')).toEqual(uses('w2'));
            const until = await runTraining(parseArgs(['--generations', '20', '--until', 'one', ...tiny('until')]), {
                gateTrials: 2,
            });
            expect([until.generations, until.state.status]).toEqual([2, 'done']);
        },
        scaleTimeout(240000),
    );

    it(
        'cannot resume a gated curriculum from an archive with no gate state',
        async () => {
            const out = join(root, 'plain');
            const plain = ['--episodes', '2', '--ticks', '400', '--offer-from', '100', '--checkpoint-every', '0'];
            await runTraining(parseArgs(['--generations', '1', '--config', fileA, ...plain, '--out', out]));
            const args = parseArgs([
                '--generations',
                '4',
                ...tiny('nostate', ['--resume', join(out, 'archive-0.json')]),
            ]);
            await expect(runTraining(args)).rejects.toThrow(/no gate state/);
        },
        scaleTimeout(60000),
    );
});
