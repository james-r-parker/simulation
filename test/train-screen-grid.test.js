import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    DEFAULT_WORKERS_PER_RUN,
    ladderText,
    planScreen,
    screenWarnings,
    screenRuns,
    textHash,
    trainArgs,
} from '../scripts/lib/train-screen-grid.mjs';

const LADDER = [
    { name: 'nursery', config: 'a.json', gate: [{ read: 'x', min: 1 }], maxGenerations: 9, plateauStop: 6 },
    { name: 'hunt', config: 'b.json', gate: [{ read: 'y', min: 1 }], maxGenerations: 9, plateauStop: 6 },
];
const files = { 'ladder.json': LADDER, 'other.json': [{ name: 'solo', config: null }] };
const read = (/** @type {string} */ file) => structuredClone(/** @type {any} */ (files)[file]);
const grid = (/** @type {Record<string, any>} */ over = {}) => ({
    curriculum: 'ladder.json',
    offsets: [0, 8],
    generations: 10,
    ...over,
});

describe('planScreen', () => {
    it('adds the reference arm `base` when none is named, first, with the base ladder and trainer options', () => {
        const plan = planScreen(
            grid({ train: { episodes: 2 }, until: 'nursery', arms: { fast: { train: { ticks: 400 } } } }),
            read,
        );
        expect(plan).toMatchObject({
            offsets: [0, 8],
            until: 'nursery',
            generations: 10,
            workersPerRun: DEFAULT_WORKERS_PER_RUN,
            reference: 'base',
        });
        expect(plan.arms.map((a) => [a.name, a.train])).toEqual([
            ['base', { episodes: 2 }],
            ['fast', { episodes: 2, ticks: 400 }],
        ]);
        expect(plan.arms[0].ladder).toEqual(LADDER);
    });

    it('uses a named reference as it is and does not add base', () => {
        const plan = planScreen(grid({ reference: 'ref', arms: { ref: {}, other: {} }, workersPerRun: 4 }), read);
        expect(plan.arms.map((a) => a.name)).toEqual(['ref', 'other']);
        expect(plan.workersPerRun).toBe(4);
    });

    it('lays stage overlays over the entries of a copy, and takes a whole ladder file for an arm', () => {
        const plan = planScreen(
            grid({ arms: { nostop: { stages: { hunt: { plateauStop: 0 } } }, solo: { curriculum: 'other.json' } } }),
            read,
        );
        const nostop = /** @type {any} */ (plan.arms.find((a) => a.name === 'nostop'));
        expect(nostop.ladder.map((/** @type {any} */ e) => e.plateauStop)).toEqual([6, 0]);
        expect(LADDER[1].plateauStop).toBe(6);
        expect(plan.arms.find((a) => a.name === 'solo')?.ladder).toEqual(files['other.json']);
    });

    it('reads the learnability check: on at the probe sizes by default, sized by `feasible`, off with false', () => {
        expect(planScreen(grid(), read)).toMatchObject({ feasible: {}, skipUnlearnable: false });
        const sized = planScreen(grid({ feasible: { generations: 20, seeds: 4 }, skipUnlearnable: true }), read);
        expect(sized).toMatchObject({ feasible: { generations: 20, seeds: 4 }, skipUnlearnable: true });
        expect(planScreen(grid({ feasible: false }), read).feasible).toBeNull();
    });

    it('refuses a malformed grid, naming the key', () => {
        const bad = (/** @type {any} */ g, /** @type {RegExp} */ message) =>
            expect(() => planScreen(g, read)).toThrow(message);
        bad(null, /"curriculum"/);
        bad(grid({ curriculum: 3 }), /"curriculum"/);
        bad(grid({ offsets: [] }), /"offsets"/);
        bad(grid({ offsets: [0, 0] }), /distinct/);
        bad(grid({ offsets: [-8] }), /distinct and not negative/);
        bad(grid({ generations: 0 }), /"generations"/);
        bad(grid({ workersPerRun: 0 }), /"workersPerRun"/);
        bad(grid({ reference: 'nope' }), /"reference" names "nope"/);
        bad(grid({ arms: { 'bad name': {} } }), /arm "bad name"/);
        bad(grid({ arms: { x: 3 } }), /arm "x"/);
        bad(grid({ arms: { x: { stages: { missing: {} } } } }), /not a stage of the ladder/);
        bad(grid({ train: { speed: 1 } }), /not a trainer option/);
        bad(grid({ train: { ticks: 1.5 } }), /non-negative integer/);
        bad(grid({ train: 3 }), /train must be an object/);
        bad(grid({ feasible: true }), /"feasible" must be false or an object/);
        bad(grid({ feasible: { population: 8 } }), /feasible.population/);
        bad(grid({ feasible: { seeds: 0 } }), /feasible.seeds/);
        bad(grid({ skipUnlearnable: 'yes' }), /"skipUnlearnable"/);
    });
});

describe('the run list', () => {
    it('is every arm on every offset, offset by offset, and its arguments carry the offset, until and options', () => {
        const plan = planScreen(grid({ until: 'hunt', train: { ticks: 400, checkpointEvery: 5 } }), read);
        const runs = screenRuns(planScreen(grid({ arms: { a: {}, b: {} }, reference: 'a' }), read));
        expect(runs.map((r) => `${r.arm.name}@${r.offset}`)).toEqual(['a@0', 'b@0', 'a@8', 'b@8']);
        expect(trainArgs(plan, plan.arms[0], 8)).toEqual([
            '--generations',
            '10',
            '--seed-offset',
            '8',
            '--until',
            'hunt',
            '--ticks',
            '400',
            '--checkpoint-every',
            '5',
        ]);
        const noUntil = planScreen(grid(), read);
        expect(trainArgs(noUntil, noUntil.arms[0], 0)).toEqual(['--generations', '10', '--seed-offset', '0']);
    });

    it('writes the ladder as JSON with a trailing newline and hashes that text', () => {
        const text = ladderText(LADDER);
        expect(JSON.parse(text)).toEqual(LADDER);
        expect(text.endsWith('}\n]\n')).toBe(true);
        expect(textHash(text)).toMatch(/^[0-9a-f]{64}$/);
        expect(textHash(text)).toBe(textHash(ladderText(LADDER)));
    });
});

describe('evals/train-screens/plateau.grid.json', () => {
    it('is the current ladder with and without plateauStop on matched offsets 0 to 248, to hunt-mid', () => {
        const readFile = (/** @type {string} */ file) =>
            JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
        const plan = planScreen(readFile('evals/train-screens/plateau.grid.json'), readFile);
        expect(plan.offsets).toEqual(Array.from({ length: 32 }, (_, i) => i * 8));
        expect(plan).toMatchObject({ until: 'hunt-mid', generations: 380, workersPerRun: 8, reference: 'nostop' });
        expect(plan.feasible).toBeNull();
        expect(plan.arms.map((a) => a.train)).toEqual([{ checkpointEvery: 5 }, { checkpointEvery: 5 }]);
        const stops = (/** @type {string} */ name) =>
            plan.arms.find((a) => a.name === name)?.ladder.map((e) => [e.name, e.plateauStop]);
        const ladder = readFile('evals/train-ladder.json');
        expect(stops('stop')).toEqual(ladder.map((/** @type {any} */ e) => [e.name, e.plateauStop]));
        expect(stops('nostop')?.slice(0, 4)).toEqual([
            ['nursery', 0],
            ['hunt-contact', 0],
            ['hunt-weak', 0],
            ['hunt-mid', 0],
        ]);
    });
});

describe('screenWarnings', () => {
    const offsets = (/** @type {number} */ n) => Array.from({ length: n }, (_, i) => i * 8);
    it('warns when a grid that compares arms runs under 32 offsets', () => {
        const warnings = screenWarnings(planScreen(grid({ offsets: offsets(16), arms: { a: {} } }), read));
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toMatch(/16 offsets is under 32/);
    });

    it('is quiet at 32 offsets, and for a grid with a single arm', () => {
        expect(screenWarnings(planScreen(grid({ offsets: offsets(32), arms: { a: {} } }), read))).toEqual([]);
        const solo = grid({ offsets: offsets(4), reference: 'only', arms: { only: {} } });
        expect(screenWarnings(planScreen(solo, read))).toEqual([]);
    });

    it('is quiet for every committed grid with a verdict', () => {
        const file = (/** @type {string} */ f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
        for (const name of ['plateau', 'food-behind', 'nursery-both', 'adaptive']) {
            const plan = planScreen(file(`evals/train-screens/${name}.grid.json`), file);
            expect(screenWarnings(plan)).toEqual([]);
        }
    });
});
