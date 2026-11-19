import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { latestArchive, screenNight, worldNight } from '../scripts/lib/train-tune-night.mjs';
import { draftExperiment, summaryText } from '../scripts/lib/train-tune-report.mjs';
import { WORLD_METRICS } from '../scripts/lib/train-tune-world.mjs';
import { main, parseArgs, readResults, runTune } from '../scripts/train-tune.mjs';

const root = mkdtempSync(join(tmpdir(), 'train-tune-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const LADDER = [
    { name: 'one', config: null, gate: [], plateauStop: 6 },
    { name: 'two', config: null, gate: [], plateauStop: 6 },
];
mkdirSync(join(root, 'run-o0'));
const ladderFile = join(root, 'ladder.json');
writeFileSync(ladderFile, JSON.stringify(LADDER));
const specFile = join(root, 'spec.json');
writeFileSync(
    specFile,
    JSON.stringify({
        curriculum: ladderFile,
        generations: 2,
        maxArms: 2,
        tuneOffsets: [0, 8],
        holdoutOffsets: [16, 24],
        worldSeeds: 2,
        tunables: [
            { key: 'plateauStop', values: [3] },
            { key: 'episodes', values: [16] },
        ],
    }),
);

/**
 * @param {string} name a directory name under the temp root
 * @returns {ReturnType<typeof parseArgs>} options with every output under the temp root
 */
const argsFor = (name) =>
    parseArgs([
        ...['--spec', specFile, '--date', '2026-01-02', '--workers', '2'],
        ...[
            '--runs',
            join(root, name, 'runs'),
            '--results',
            join(root, name, 'results'),
            '--log-dir',
            join(root, name, 'logs'),
        ],
    ]);

const verdictsOf = (/** @type {Record<string, string>} */ byArm) => ({
    arms: Object.fromEntries(
        Object.entries(byArm).map(([arm, verdict]) => [arm, { verdict, compare: { meanDiff: 0.5, p: 0.01 } }]),
    ),
});

/**
 * @param {Record<string, string>} tune the tuning screen's verdicts
 * @param {Record<string, string>} holdout the held-out verdicts
 * @returns {{screen: any, calls: string[]}} a stand-in screen and the grids it was given
 */
function fakeScreen(tune, holdout) {
    /** @type {string[]} */
    const calls = [];
    const screen = async (/** @type {Record<string, any>} */ args) => {
        calls.push(args.grid);
        const held = args.grid.includes('holdout');
        const perRun = [{ dir: join(root, 'run-o0'), offset: 0, score: 1 }];
        return {
            report: {
                verdicts: verdictsOf(held ? holdout : tune),
                yield: { base: { perRun }, 'episodes-16': { perRun } },
            },
        };
    };
    return { screen, calls };
}

describe('parseArgs', () => {
    it('needs --spec and a dated --date, and takes the flags', () => {
        expect(() => parseArgs([])).toThrow('--spec');
        expect(() => parseArgs(['--spec', 'x', '--date', 'today'])).toThrow('--date');
        expect(() => parseArgs(['--spec', 'x', '--bogus'])).toThrow('unknown argument');
        const args = parseArgs(['--spec', 'x', '--dry-run', '--workers', '3']);
        expect(args).toMatchObject({ spec: 'x', dryRun: true, workers: 3 });
        expect(args.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(args.runs).toContain('train-tune');
        expect(args.results).toContain('evals');
    });
});

describe('readResults and latestArchive', () => {
    it('reads each night directory that has a result.json, and none for a missing root', () => {
        const dir = join(root, 'res');
        mkdirSync(join(dir, '2026-01-01'), { recursive: true });
        mkdirSync(join(dir, '2026-01-02'));
        writeFileSync(join(dir, '2026-01-01', 'result.json'), '{"ladderHash":"a"}');
        expect(readResults(dir)).toEqual([{ ladderHash: 'a' }]);
        expect(readResults(join(root, 'nope'))).toEqual([]);
    });

    it('finds the archive of the highest generation', () => {
        const dir = join(root, 'arch');
        mkdirSync(dir);
        for (const name of ['archive-5.json', 'archive-20.json', 'archive-9.json', 'curve.jsonl']) {
            writeFileSync(join(dir, name), '{}');
        }
        expect(latestArchive(dir)).toBe(join(dir, 'archive-20.json'));
        expect(latestArchive(join(root, 'nope'))).toBeNull();
        expect(latestArchive(join(root, 'res'))).toBeNull();
    });
});

describe('runTune', () => {
    it('proposes and prints in a dry run and writes nothing', async () => {
        /** @type {string[]} */
        const lines = [];
        const args = { ...argsFor('dry'), dryRun: true };
        expect(await runTune(args, {}, (l) => lines.push(l))).toBeNull();
        expect(lines[0]).toContain('proposed 2 arm(s)');
        expect(existsSync(join(root, 'dry'))).toBe(false);
    });

    it('screens, confirms the better arm, exports and trials the finalist, and writes only the results and the log', async () => {
        const { screen, calls } = fakeScreen(
            { 'plateauStop-3': 'no verdict', 'episodes-16': 'better' },
            { 'episodes-16': 'better' },
        );
        /** @type {any[]} */
        const exported = [];
        const exportChampions = (/** @type {Record<string, any>} */ a) => {
            exported.push(a);
            return [];
        };
        for (const g of [20, 7]) {
            writeFileSync(join(root, 'run-o0', `archive-${g}.json`), '{}', { flag: 'w' });
        }
        /** @type {any[]} */
        const trials = [];
        const trial = async (/** @type {Record<string, any>} */ t) => {
            trials.push(t);
            return {
                'episodes-16': {
                    vsLive: Object.fromEntries(
                        WORLD_METRICS.map((m) => [m, { before: 1, after: 2, effect: 1, verdict: 'better' }]),
                    ),
                    vsBase: null,
                },
            };
        };
        const args = argsFor('night');
        const result = await runTune(args, { screen, exportChampions, trial }, () => {});
        expect(calls.map((c) => c.split('/').slice(-2).join('/'))).toEqual([
            '2026-01-02/tune.grid.json',
            'holdout/episodes-16.grid.json',
        ]);
        expect(result?.arms.map((/** @type {any} */ a) => [a.name, a.finalist])).toEqual([
            ['plateauStop-3', false],
            ['episodes-16', true],
        ]);
        expect(exported.map((e) => e.label)).toEqual(['base', 'episodes-16']);
        expect(exported[0].archive).toBe(join(root, 'run-o0', 'archive-20.json'));
        expect(trials[0]).toMatchObject({ seeds: 2, workers: 2 });
        const out = join(root, 'night', 'results', '2026-01-02');
        expect(readdirSync(out).sort()).toEqual(
            ['draft-experiment.json', 'result.json', 'summary.md', 'tune.grid.json', 'holdout'].sort(),
        );
        expect(JSON.parse(readFileSync(join(out, 'result.json'), 'utf8')).arms).toHaveLength(2);
        expect(readdirSync(join(root, 'night')).sort()).toEqual(['logs', 'results']);
        const log = readFileSync(join(root, 'night', 'logs', 'train-tune-2026-01-02.jsonl'), 'utf8')
            .trim()
            .split('\n')
            .map((l) => JSON.parse(l));
        expect(log.map((r) => r.event)).toEqual(['TuneArm', 'TuneArm', 'TuneResult']);
        expect(log[2].finalists).toEqual(['episodes-16']);
        // the night is history: the same arms at the same ladder are not proposed again
        const again = await runTune(argsFor('night'), { screen, exportChampions, trial }, () => {});
        expect(again?.arms).toEqual([]);
        expect(summaryText(again ?? {})).toContain('No arm to screen');
    });

    it('skips the world trial when the spec says so, and does not confirm a worse arm', async () => {
        const { screen, calls } = fakeScreen(
            { 'plateauStop-3': 'worse', 'episodes-16': 'better' },
            { 'episodes-16': 'no verdict' },
        );
        const noTrialSpec = join(root, 'spec-notrial.json');
        writeFileSync(
            noTrialSpec,
            JSON.stringify({ ...JSON.parse(readFileSync(specFile, 'utf8')), worldTrial: false }),
        );
        const args = { ...argsFor('notrial'), spec: noTrialSpec };
        const result = await runTune(
            args,
            { screen, trial: async () => Promise.reject(new Error('no trial')) },
            () => {},
        );
        expect(calls).toHaveLength(2);
        expect(result?.world).toBeNull();
        expect(result?.arms.some((/** @type {any} */ a) => a.finalist)).toBe(false);
    });

    it('is a failing exit code on a missing spec', async () => {
        expect(await main(['--spec', join(root, 'missing.json')])).toBe(1);
    });
});

describe('screenNight and worldNight', () => {
    it('leaves a finalist with no archive out of the trial', async () => {
        const arms = [{ name: 'a', finalist: true }];
        /** @type {any[]} */
        /** @type {any[]} */
        const trials = [];
        const out = await worldNight(
            { spec: { worldSeeds: 2 }, arms, yielded: {}, out: root, runs: root, date: 'd', workers: null },
            { exportChampions: () => [], trial: async (t) => (trials.push(t), {}) },
        );
        expect(out).toEqual({});
        expect(trials[0].arms).toEqual([]);
        expect(typeof screenNight).toBe('function');
    });
});

describe('summaryText and draftExperiment', () => {
    const reading = { before: 1, after: 1.5, effect: 0.5, verdict: 'better' };
    const night = {
        date: '2026-01-02',
        ladderHash: 'abc',
        until: 'two',
        arms: [
            {
                name: 'a',
                signature: 'train.episodes=16',
                tune: { verdict: 'better', meanDiff: 0.5 },
                holdout: { verdict: 'better' },
                finalist: true,
            },
            {
                name: 'b',
                signature: 'train.episodes=48',
                tune: { verdict: 'worse', meanDiff: null },
                holdout: null,
                finalist: false,
            },
        ],
        world: {
            a: {
                vsLive: Object.fromEntries(WORLD_METRICS.map((m) => [m, reading])),
                vsBase: Object.fromEntries(
                    WORLD_METRICS.map((m) => [m, { ...reading, effect: null, verdict: 'missing' }]),
                ),
            },
            base: {
                vsLive: Object.fromEntries(WORLD_METRICS.map((m) => [m, { ...reading, effect: -0.1 }])),
                vsBase: null,
            },
        },
    };

    it('tabulates the arms and the world trial', () => {
        const text = summaryText(night);
        expect(text).toContain('| a | `train.episodes=16` | better | 0.5 | better | yes |');
        expect(text).toContain('| b | `train.episodes=48` | worse | - | - | no |');
        expect(text).toContain('| a | eval.hunter_catches_per_1k | 1 | 1.5 | +50.0% better | - missing |');
        expect(text).toContain('-10.0% better');
        expect(summaryText({ ...night, until: undefined, world: undefined })).toContain('the last stage');
    });

    it('drafts an experiment entry naming the finalists and the verdicts against base', () => {
        const draft = draftExperiment(night);
        expect(draft).toMatchObject({
            date: '2026-01-02',
            afterPolicy: 'champions-v1',
            after: 'finalists: a',
            targets: [],
        });
        expect(draft.verdicts['a:eval.food_energy_per_1k']).toBe('-');
        expect(draft.reports).toContain('evals/train-tune/results/2026-01-02/summary.md');
        const better = {
            ...night,
            world: {
                a: {
                    vsLive: {},
                    vsBase: Object.fromEntries(
                        WORLD_METRICS.map((m, i) => [m, { ...reading, verdict: ['better', 'worse', 'no verdict'][i] }]),
                    ),
                },
            },
        };
        expect(Object.values(draftExperiment(better).verdicts)).toEqual(['better', 'worse', 'no-difference']);
        const none = draftExperiment({ ...night, arms: [], world: null });
        expect(none).toMatchObject({ after: 'no finalist', verdicts: {} });
        expect(none.hypothesis).toContain('no arm');
        expect(draftExperiment({ ...night, arms: [night.arms[1]], world: undefined }).note).toContain('b (worse)');
    });
});
