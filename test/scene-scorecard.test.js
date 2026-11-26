import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { METRICS } from '../js/evo/metric-registry/index.js';
import { SCENES } from '../js/evo/metric-registry/scenes.js';
import {
    detectorsByScene,
    main,
    newestBaselineByName,
    reading,
    renderScorecard,
    sceneState,
} from '../scripts/scene-scorecard.mjs';

const REPORT_PATH = 'evals/power/defaults-floor-on-E210.json';
const base = METRICS['eval.median_lifespan'];
const verified = {
    ...base,
    tests: { arithmetic: 'a.test.js', source: 'b.test.js' },
    liveness: { nullShare: 0, distinct: 5, offModeShare: 0.5, report: 'r.json' },
    power: { fpr16: 0.05, fpr32: 0.05, mde16: 0.3, mde32: 0.12, mde64: 0.08, referenceMean: 100, report: 'r.json' },
    minSeeds: /** @type {const} */ (32),
};
const unverified = { ...base, liveness: null, power: null, minSeeds: null };

/** A made-up registry and a report over four seeds: a live detector, a null one, a zero one and an unverified one. */
const FAKE = {
    'fake.live': { ...verified, scenes: ['A real chase', 'G3'] },
    'fake.mostly_null': { ...verified, scenes: ['Pack, or loner'] },
    'fake.zero': { ...verified, scenes: ['Scavenge'] },
    'fake.loose': { ...unverified, scenes: ['Refuge'] },
    'fake.untagged': verified,
};
const REPORT = {
    config: {},
    seeds: [1, 2, 3, 4],
    ticks: 100,
    metrics: {
        'fake.live': { values: [1, 2, 3, null] },
        'fake.mostly_null': { values: [5, null, null, null] },
        'fake.zero': { values: [0, 0, 0, 0] },
        'fake.loose': { values: [9, 9, 9, 9] },
    },
};

/** @type {string[]} */
const dirs = [];
afterEach(() => {
    vi.restoreAllMocks();
    while (dirs.length > 0) {
        rmSync(/** @type {string} */ (dirs.pop()), { recursive: true, force: true });
    }
});

/** @returns {string} a temporary doc path */
function tempDoc() {
    const dir = mkdtempSync(join(tmpdir(), 'scorecard-'));
    dirs.push(dir);
    return join(dir, 'scene-scorecard.md');
}

describe('reading', () => {
    it('takes the mean of the non-null values and the null share', () => {
        expect(reading([1, 2, 3, null])).toEqual({ mean: 2, nullShare: 0.25, seen: true });
    });

    it('does not see a detector that is null on half the seeds or reads 0', () => {
        expect(reading([5, null, null, null]).seen).toBe(false);
        expect(reading([5, 5, null, null]).seen).toBe(false);
        expect(reading([0, 0, 0, 0]).seen).toBe(false);
        expect(reading([])).toEqual({ mean: null, nullShare: 1, seen: false });
    });

    it('reads a pooled metric as its ratio of sums, not the mean of its per-seed ratios', () => {
        // Seed 1: 1 of 1; seed 2: 1 of 9. Per-seed mean (1 + 1/9) / 2 = 0.556; pooled 2 / 10 = 0.2.
        const pooled = [
            { num: 1, den: 1 },
            { num: 1, den: 9 },
        ];
        expect(reading([1, 1 / 9], pooled)).toEqual({ mean: 0.2, nullShare: 0, seen: true });
    });

    it('lets a zero-exposure seed count as null and add nothing to the pooled mean', () => {
        const pooled = [
            { num: 3, den: 4 },
            { num: 0, den: 0 },
        ];
        expect(reading([0.75, null], pooled)).toEqual({ mean: 0.75, nullShare: 0.5, seen: false });
    });
});

describe('sceneState', () => {
    const detector = (/** @type {string} */ status, /** @type {boolean} */ seen) => ({
        name: 'fake.x',
        status,
        cells: [],
        seen,
    });

    it('is `no verified detector` for no detector or only unverified ones', () => {
        expect(sceneState([])).toBe('no verified detector');
        expect(sceneState([detector('unverified', true)])).toBe('no verified detector');
    });

    it('is `present` when a verified detector reads something and `absent` when none does', () => {
        expect(sceneState([detector('verified', true), detector('verified', false)])).toBe('present');
        expect(sceneState([detector('verified', false), detector('unverified', true)])).toBe('absent');
    });
});

describe('detectorsByScene', () => {
    it('lists each tagged metric under each of its scenes and every scene at least as an empty list', () => {
        const byScene = detectorsByScene(FAKE, REPORT);
        expect([...byScene.keys()]).toEqual([...SCENES]);
        expect(byScene.get('A real chase')?.map((d) => d.name)).toEqual(['fake.live']);
        expect(byScene.get('G3')?.[0].cells).toEqual(['2', '0.25', '8%']);
        expect(byScene.get('Abort')).toEqual([]);
    });

    it('throws on a scene outside the closed set', () => {
        const bad = { 'fake.live': { ...verified, scenes: ['Not a scene'] } };
        expect(() => detectorsByScene(bad, REPORT)).toThrow('unknown scene Not a scene on fake.live');
    });
});

describe('renderScorecard', () => {
    const doc = renderScorecard(FAKE, REPORT, REPORT_PATH);
    const stateOf = (/** @type {string} */ scene) =>
        doc.split('\n').find((line) => line.startsWith(`| ${scene} `) && /present|absent|no verified/.test(line));

    it('heads the file with the baseline, its experiment id and the rules hash', () => {
        expect(doc).toMatch(/`evals\/power\/defaults-floor-on-E210\.json` \(experiment E210, rulesHash `[0-9a-f]{16}`/);
    });

    it('marks each scene absent, present or without a verified detector', () => {
        expect(stateOf('A real chase')).toContain('present');
        expect(stateOf('Pack, or loner')).toContain('absent');
        expect(stateOf('Scavenge')).toContain('absent');
        expect(stateOf('Refuge')).toContain('no verified detector');
        expect(stateOf('Abort')).toContain('no verified detector');
    });

    it('names the scene headline in a Headline column, or `no headline`', () => {
        const flagged = {
            ...FAKE,
            'fake.live': {
                ...FAKE['fake.live'],
                headline: /** @type {const} */ ('scene'),
                headlineScenes: ['A real chase'],
            },
        };
        const lines = renderScorecard(flagged, REPORT, REPORT_PATH).split('\n');
        expect(lines.find((l) => l.startsWith('| Scene ') && l.includes('Headline'))).toBeDefined();
        expect(lines.find((l) => l.startsWith('| A real chase ') && l.includes('present'))).toContain('`fake.live`');
        expect(lines.find((l) => l.startsWith('| Abort ') && l.includes('no verified'))).toContain('no headline');
    });

    it('prints the flagged failures and goals as a second table', () => {
        expect(doc).toContain('## What the user flagged');
        expect(doc).toMatch(/\| G3 +\| Hunting in packs +\| present +\|/);
    });
});

describe('main', () => {
    it('writes the doc and then checks it, and fails a stale one with the fixing command', () => {
        const path = tempDoc();
        const options = { path, metrics: FAKE, reportPath: REPORT_PATH };
        vi.spyOn(process.stdout, 'write').mockReturnValue(true);
        const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
        expect(main(['--check'], options)).toBe(1);
        expect(err).toHaveBeenCalledWith(expect.stringContaining('node scripts/scene-scorecard.mjs --write'));
        expect(main(['--write'], options)).toBe(0);
        expect(readFileSync(path, 'utf8')).toContain('# Scene scorecard');
        expect(main(['--check'], options)).toBe(0);
        writeFileSync(path, 'edited\n');
        expect(main(['--check'], options)).toBe(1);
    });

    it('rejects an unknown flag and a missing report', () => {
        const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
        expect(main(['--nope'], { metrics: FAKE, reportPath: REPORT_PATH })).toBe(2);
        expect(main(['--check'], { metrics: FAKE, reportPath: null })).toBe(1);
        expect(err).toHaveBeenCalledWith('no shared baseline report under evals/power/\n');
    });

    it('keeps the committed doc in step with the real registry and the newest baseline', () => {
        vi.spyOn(process.stdout, 'write').mockReturnValue(true);
        expect(newestBaselineByName()).toMatch(/defaults-floor-on-E\d+\.json$/);
        expect(main(['--check'])).toBe(0);
    });
});
