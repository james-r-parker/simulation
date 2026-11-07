import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { encodeArchive } from '../js/evo/archive-codec.js';
import { createArchive, seedArchive } from '../js/evo/archive.js';
import { brainLayout } from '../js/sim/brain-layout.js';
import { createConfig } from '../js/sim/config.js';
import { createRng, nextGaussian } from '../js/sim/rng.js';
import { PAIRS, collectSubjects, correlate, formatStudy, parseArgs, verdictOf } from '../scripts/reflex-correlate.mjs';
import { makeChampionFile } from './evo/helpers/champion-file.js';

const root = mkdtempSync(join(tmpdir(), 'reflex-correlate-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const config = createConfig({});

describe('parseArgs', () => {
    it('defaults to the league, the training exports, the baselines, 32 random brains and the full study', () => {
        expect(parseArgs([])).toMatchObject({
            league: 'evals/league.json',
            trainDir: '.sim/train',
            archives: ['evals/baselines'],
            champions: [],
            random: 32,
            seeds: 16,
            drillTrials: 32,
            resamples: 2000,
            json: false,
            out: null,
        });
    });

    it('reads every flag, with lists split on commas', () => {
        expect(
            parseArgs([
                '--league',
                'l.json',
                '--train-dir',
                't',
                '--archives',
                'a,b',
                '--champions',
                'c,d',
                '--random',
                '4',
                '--seeds',
                '2',
                '--drill-trials',
                '3',
                '--resamples',
                '200',
                '--workers',
                '2',
                '--json',
                '--out',
                'o',
            ]),
        ).toMatchObject({
            league: 'l.json',
            trainDir: 't',
            archives: ['a', 'b'],
            champions: ['c', 'd'],
            random: 4,
            seeds: 2,
            drillTrials: 3,
            resamples: 200,
            workers: 2,
            json: true,
            out: 'o',
        });
        expect(() => parseArgs(['--resamples', '5'])).toThrow(/--resamples/);
        expect(() => parseArgs(['--nope'])).toThrow(/unknown argument/);
    });
});

describe('PAIRS', () => {
    it('are the four case and drill pairs of the prediction', () => {
        expect(PAIRS.map((p) => [p.case, ...p.drills])).toEqual([
            ['approach-food', 'food-ahead', 'food-behind'],
            ['flee-threat', 'hunter-closing'],
            ['bite-discrimination', 'prey-too-big'],
            ['approach-prey', 'prey-ahead'],
        ]);
    });
});

describe('verdictOf', () => {
    const pass = { passes: true };
    const fail = { passes: false };

    it('is both when three pairs and both outcomes pass', () => {
        expect(verdictOf([pass, pass, pass, fail], [pass, pass])).toBe('both');
        expect(verdictOf([pass, pass, pass, pass], [pass, pass])).toBe('both');
    });

    it('is filter only when three pairs pass and an outcome does not', () => {
        expect(verdictOf([pass, pass, pass, pass], [pass, fail])).toBe('filter only');
        expect(verdictOf([pass, pass, pass, fail], [fail, fail])).toBe('filter only');
    });

    it('drops the tier when fewer than three pairs pass, whatever the outcomes', () => {
        expect(verdictOf([pass, pass, fail, fail], [pass, pass])).toBe('drop');
        expect(verdictOf([fail, fail, fail, fail], [pass, pass])).toBe('drop');
    });
});

/**
 * Hand-built study rows: a forager and a predator per group, with the reflex and drill values tied or not.
 * @param {{tied: boolean, groups?: number}} options whether the drill edge follows the reflex pass share
 * @returns {import('../scripts/reflex-correlate.mjs').StudyRow[]} the rows
 */
function studyRows({ tied, groups = 14 }) {
    const rng = createRng(3);
    return Array.from({ length: groups * 2 }, (_, i) => {
        const spec = i % 2;
        const share = (Math.floor(i / 2) + 1) / groups;
        const noise = () => (tied ? 0.02 * nextGaussian(rng) : nextGaussian(rng));
        const pass = (/** @type {number} */ v) => Math.min(1, Math.max(0, v));
        /** @type {Record<string, number>} */
        const reflex =
            spec === 0
                ? { 'approach-food': pass(share), 'flee-threat': pass(share + 0.01 * i) }
                : { 'bite-discrimination': pass(share), 'approach-prey': pass(share + 0.01 * i) };
        const edge = share + noise();
        /** @type {Record<string, number>} */
        const drill =
            spec === 0
                ? { 'food-ahead': edge, 'food-behind': edge + 0.01, 'hunter-closing': edge }
                : { 'prey-too-big': edge, 'prey-ahead': edge };
        return {
            label: `g${i}`,
            group: `run${Math.floor(i / 2)}`,
            spec,
            reflex,
            score: share,
            drill,
            bound: tied ? share * 100 + noise() : noise(),
            elo: tied ? 1000 + share * 200 + noise() : 1000 + 100 * noise(),
        };
    });
}

describe('correlate', () => {
    it('finds a clear pass on every pair and outcome when the drill edge follows the reflex score', () => {
        const result = correlate(studyRows({ tied: true }), { resamples: 300 });
        expect(result.pairs).toHaveLength(4);
        for (const pair of result.pairs) {
            expect(pair.n).toBe(14);
            expect(pair.rho, pair.case).toBeGreaterThan(0.9);
            expect(pair.low).toBeGreaterThan(0);
            expect(pair.passes).toBe(true);
        }
        expect(result.outcomes.map((o) => o.name)).toEqual(['archive lower bound', 'league Elo']);
        expect(result.outcomes.every((o) => o.passes && o.n === 28)).toBe(true);
        expect(result.verdict).toBe('both');
    });

    it('drops the tier when nothing is related', () => {
        const result = correlate(studyRows({ tied: false }), { resamples: 300 });
        expect(result.pairs.filter((p) => p.passes).length).toBeLessThan(3);
        expect(result.verdict).toBe('drop');
    });

    it('uses only the rows that have the values and the specialisation the case is for', () => {
        const rows = studyRows({ tied: true }).map((r, i) => (i === 0 ? { ...r, drill: {}, bound: null } : r));
        const result = correlate(rows, { resamples: 200 });
        expect(result.pairs[0].n).toBe(13);
        expect(result.pairs[3].n).toBe(14);
        expect(result.outcomes[0].n).toBe(27);
    });

    it('reports a partial correlation that holds the specialisation fixed', () => {
        const result = correlate(studyRows({ tied: true }), { resamples: 200 });
        expect(result.outcomes[0].partial).toBeGreaterThan(0.9);
    });
});

describe('formatStudy', () => {
    it('prints a line per pair and outcome, then the verdict', () => {
        const lines = formatStudy(correlate(studyRows({ tied: true }), { resamples: 200 }));
        expect(lines).toHaveLength(7);
        expect(lines[0]).toMatch(/^approach-food vs food-ahead\+food-behind: n 14 {2}rho \d\.\d\d/);
        expect(lines[4]).toMatch(/^reflex score vs archive lower bound: n 28/);
        expect(lines[6]).toBe('verdict: both');
    });
});

describe('collectSubjects', () => {
    const none = { league: null, trainDir: null, archives: [], champions: [], random: 0 };

    /** @returns {string} a directory with two champion files */
    function championDir() {
        const dir = join(root, 'champs');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'a.json'), JSON.stringify(makeChampionFile('forager', 1, { specialisation: 0 })));
        writeFileSync(join(dir, 'b.json'), JSON.stringify(makeChampionFile('predator', 2, { specialisation: 1 })));
        writeFileSync(join(dir, 'bad.json'), JSON.stringify({ version: 99 }));
        return dir;
    }

    it('reads champion files into one group per directory and skips and names a file that does not fit', () => {
        const dir = championDir();
        const { subjects, skipped } = collectSubjects({ ...none, champions: [dir] }, config);
        expect(subjects.map((s) => [s.name, s.spec, s.group, s.bound, s.elo])).toEqual([
            ['forager', 0, dir, null, null],
            ['predator', 1, dir, null, null],
        ]);
        expect(skipped).toHaveLength(1);
        expect(skipped[0]).toContain('bad.json');
    });

    it('reads the training exports of each run directory', () => {
        const train = join(root, 'train');
        mkdirSync(join(train, 'run1', 'champions'), { recursive: true });
        writeFileSync(
            join(train, 'run1', 'champions', 'a.json'),
            JSON.stringify(makeChampionFile('t1', 5, { specialisation: 1 })),
        );
        const { subjects } = collectSubjects({ ...none, trainDir: train }, config);
        expect(subjects.map((s) => s.name)).toEqual(['t1']);
        expect(subjects[0].group).toBe(join(train, 'run1', 'champions'));
    });

    it('reads the league champions with their Elo, each its own group', () => {
        const leagueRoot = join(root, 'league-root');
        mkdirSync(join(leagueRoot, 'evals'), { recursive: true });
        mkdirSync(join(leagueRoot, 'champs'), { recursive: true });
        writeFileSync(
            join(leagueRoot, 'champs', 'x.json'),
            JSON.stringify(makeChampionFile('x', 9, { specialisation: 0 })),
        );
        const league = { version: 1, champions: [{ file: 'champs/x.json', name: 'champ-x', elo: 1234 }] };
        writeFileSync(join(leagueRoot, 'evals', 'league.json'), JSON.stringify(league));
        const { subjects } = collectSubjects({ ...none, league: join(leagueRoot, 'evals', 'league.json') }, config);
        expect(subjects).toMatchObject([{ name: 'champ-x', spec: 0, group: 'league:champ-x', elo: 1234, bound: null }]);
    });

    it('reads the elites of an archive file, with no bound for one nobody has tested, and skips a non-archive', () => {
        const dir = join(root, 'archives');
        mkdirSync(dir, { recursive: true });
        const layout = brainLayout(config);
        const archive = createArchive(layout);
        seedArchive(archive, { spec: 1, cell: 3, id: 7, sigma: 0.05, weights: new Float32Array(layout.weightCount) });
        writeFileSync(join(dir, 'archive-1.json'), JSON.stringify(encodeArchive(archive, config)));
        writeFileSync(join(dir, 'report.json'), JSON.stringify({ traces: [] }));
        const { subjects, skipped } = collectSubjects({ ...none, archives: [dir] }, config);
        expect(subjects).toHaveLength(1);
        expect(subjects[0]).toMatchObject({ spec: 1, id: 7, bound: null, elo: null });
        expect(subjects[0].name).toContain('predator-cell3');
        expect(subjects[0].weights).toHaveLength(layout.weightCount);
        expect(skipped).toHaveLength(1);
        expect(skipped[0]).toContain('not an archive');
    });

    it('adds random brains, alternating forager and predator, each its own group, replaying bit for bit', () => {
        const { subjects } = collectSubjects({ ...none, random: 4 }, config);
        expect(subjects.map((s) => s.spec)).toEqual([0, 1, 0, 1]);
        expect(new Set(subjects.map((s) => s.group)).size).toBe(4);
        expect(collectSubjects({ ...none, random: 4 }, config).subjects[2].weights).toEqual(subjects[2].weights);
        expect(subjects[0].weights).not.toEqual(subjects[2].weights);
    });

    it('is empty with nothing to read, and tolerates paths that do not exist', () => {
        const missing = {
            ...none,
            league: join(root, 'no.json'),
            trainDir: join(root, 'no'),
            archives: [join(root, 'no')],
        };
        expect(collectSubjects(missing, config)).toEqual({ subjects: [], skipped: [] });
    });
});
