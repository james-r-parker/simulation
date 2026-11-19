import { describe, expect, it } from 'vitest';
import {
    CYCLE_BAR,
    EXAM_ROWS,
    REQUIRED_ROWS,
    crossplayExamRow,
    diverseExamRow,
    drillExamRow,
    examRow,
    judgeSet,
    leagueExamRow,
    namedDrills,
    notRun,
    reflexExamRow,
    replicatedExamRow,
    tablesIdentical,
    validRow,
} from '../../js/evo/exam.js';

describe('the row table', () => {
    it('names the ten rows of the doc', () => {
        expect(Object.keys(EXAM_ROWS)).toHaveLength(10);
        expect(EXAM_ROWS[1].name).toBe('Valid');
        expect(EXAM_ROWS[10].name).toBe('Watched');
    });

    it('builds a row with only the fields it was given', () => {
        expect(examRow(3, 'pass')).toEqual({ row: 3, name: 'Drill', verdict: 'pass', numbers: {} });
        expect(notRun(6, 'why', 'cmd')).toEqual({
            row: 6,
            name: 'Scenes',
            verdict: 'not run',
            numbers: {},
            reason: 'why',
            command: 'cmd',
        });
        expect(notRun(10, 'why')).not.toHaveProperty('command');
    });
});

describe('row 1, valid', () => {
    const ok = [{ name: 'a', error: null }];

    it('passes when every file loads and the two drill tables are identical', () => {
        expect(tablesIdentical({ x: [1] }, { x: [1] })).toBe(true);
        expect(validRow({ files: ok, first: [1], second: [1] })).toMatchObject({
            verdict: 'pass',
            numbers: { champions: 1, invalid: 0, identical: true },
        });
    });

    it('fails naming a file that does not load', () => {
        const row = validRow({
            files: [...ok, { name: 'b', error: 'champion.layout.name: wrong' }],
            first: 1,
            second: 1,
        });
        expect(row.verdict).toBe('fail');
        expect(row.reason).toBe('b: champion.layout.name: wrong');
    });

    it('fails when the table changes between two runs, and when there is no champion', () => {
        expect(validRow({ files: ok, first: { a: 1 }, second: { a: 2 } }).reason).toMatch(/differs between two runs/);
        expect(validRow({ files: [], first: 1, second: 1 }).reason).toMatch(/exports no champion/);
    });
});

describe('row 2, reflex', () => {
    it('is reported with each champion score and the trials', () => {
        const genomes = [{ name: 'a', score: 0.5, edge: 0.2 }];
        expect(reflexExamRow({ genomes, trials: 64 })).toMatchObject({
            verdict: 'reported',
            numbers: { trials: 64, genomes },
        });
    });
});

describe('row 3, drill', () => {
    const stages = [
        { passedAt: 4, gate: [{ read: 'drill.food-ahead.edgeLow' }, { read: 'retention.all' }] },
        { passedAt: 9, gate: [{ read: 'drill.prey-ahead.winShareLow' }, { read: 'drill.food-ahead.edgeLow' }] },
        { gate: [{ read: 'drill.never-passed.edgeLow' }] },
        { passedAt: 11 },
    ];

    it('names the drills of the gates of passed stages once each', () => {
        expect(namedDrills(stages)).toEqual(['food-ahead', 'prey-ahead']);
        expect(namedDrills([])).toEqual([]);
    });

    it('is not run when no passed stage names a drill', () => {
        expect(drillExamRow({ readings: {}, named: [], trials: 64 }).verdict).toBe('not run');
    });

    it('passes when every named drill has an edge low bound above 0', () => {
        const readings = { 'food-ahead': { edgeLow: 0.1 }, 'prey-ahead': { edgeLow: 0.02 } };
        const row = drillExamRow({ readings, named: ['food-ahead', 'prey-ahead'], trials: 64 });
        expect(row).toMatchObject({ verdict: 'pass', numbers: { trials: 64 } });
    });

    it('fails on a drill at 0, below it, null or missing', () => {
        const readings = { a: { edgeLow: 0 }, b: { edgeLow: -0.2 }, c: { edgeLow: null } };
        const row = drillExamRow({ readings, named: ['a', 'b', 'c', 'd'], trials: 64 });
        expect(row.verdict).toBe('fail');
        expect(row.reason).toBe('no edge over the random brains on a, b, c, d');
    });
});

describe('row 4, cross-play', () => {
    const good = { hunterProgress: { low: 0.1 }, preyProgress: { low: 0.05 }, cycleShare: 0.1 };

    it('is not run without crossplay.json, naming the command', () => {
        const row = crossplayExamRow(null, '.sim/train/x');
        expect(row.verdict).toBe('not run');
        expect(row.command).toBe('npm run train:crossplay -- .sim/train/x');
    });

    it('passes on both low bounds above 0 and a cycle share under the bar', () => {
        expect(crossplayExamRow(good, 'd')).toMatchObject({ verdict: 'pass', numbers: { cycleShare: 0.1 } });
    });

    it('fails on each bar separately', () => {
        expect(crossplayExamRow({ ...good, hunterProgress: { low: 0 } }, 'd').reason).toMatch(/hunter progress/);
        expect(crossplayExamRow({ ...good, hunterProgress: null }, 'd').reason).toMatch(/hunter progress/);
        expect(crossplayExamRow({ ...good, preyProgress: null }, 'd').reason).toMatch(/prey progress/);
        expect(crossplayExamRow({ ...good, cycleShare: CYCLE_BAR }, 'd').reason).toMatch(/cycle share/);
        expect(crossplayExamRow({ ...good, cycleShare: null }, 'd').verdict).toBe('fail');
    });
});

describe('row 5, league', () => {
    it('is reported with the standings, and not run without a league', () => {
        const standings = [{ name: 'a', elo: 1010, games: 8, wins: 5, draws: 1, losses: 2 }];
        expect(leagueExamRow(standings)).toMatchObject({ verdict: 'reported', numbers: { champions: standings } });
        expect(leagueExamRow(null).verdict).toBe('not run');
    });
});

describe('row 8, diverse', () => {
    const band = { edgeLow: 0.1, winShareLow: 0.2 };
    const separated = { pairs: 32, meanDifference: 5, low95: 2, high95: 8, separated: true };
    const base = { filled: { predator: ['low', 'high'] }, bands: { low: band, high: band }, separation: separated };

    it('is not run when everything read holds and the recruitment is unread', () => {
        const row = diverseExamRow({ ...base, recruitment: { low: null, high: null } });
        expect(row.verdict).toBe('not run');
        expect(row.reason).toMatch(/recruitment/);
    });

    it('fails on an empty or edgeless band, and on bands that do not separate, whatever is unread', () => {
        const unread = { low: null, high: null };
        const empty = diverseExamRow({ ...base, bands: { low: band, high: null }, recruitment: unread });
        expect(empty).toMatchObject({ verdict: 'fail', reason: 'high band is empty' });
        const edgeless = diverseExamRow({
            ...base,
            bands: { low: { ...band, edgeLow: 0 }, high: band },
            recruitment: unread,
        });
        expect(edgeless.reason).toBe('low band has no edge over the random brains');
        const together = diverseExamRow({
            ...base,
            separation: { ...separated, separated: false },
            recruitment: unread,
        });
        expect(together.reason).toBe('the bands do not separate on matched trials');
        expect(diverseExamRow({ ...base, separation: null, recruitment: unread }).verdict).toBe('fail');
    });

    it('passes only with recruitment read true in both bands', () => {
        expect(diverseExamRow({ ...base, recruitment: { low: true, high: true } }).verdict).toBe('pass');
        const half = diverseExamRow({ ...base, recruitment: { low: true, high: null } });
        expect(half).toMatchObject({ verdict: 'fail', reason: 'high band: descendant recruitment not read' });
        const failed = diverseExamRow({ ...base, recruitment: { low: false, high: false } });
        expect(failed.reason).toMatch(/low band: descendant recruitment failed/);
    });
});

describe('row 9, replicated', () => {
    const pass = { row3: /** @type {const} */ ('pass'), row4: /** @type {const} */ ('pass') };
    const fail = { row3: /** @type {const} */ ('fail'), row4: /** @type {const} */ ('fail') };

    it('is not run without a second run', () => {
        expect(replicatedExamRow([pass]).verdict).toBe('not run');
    });

    it('passes when rows 3 and 4 each pass on two runs', () => {
        expect(replicatedExamRow([pass, pass])).toMatchObject({
            verdict: 'pass',
            numbers: { runs: 2, needed: 2, of: 3 },
        });
        expect(replicatedExamRow([pass, fail, pass]).verdict).toBe('pass');
    });

    it('fails when the runs left cannot make up two passes', () => {
        expect(replicatedExamRow([fail, fail]).verdict).toBe('fail');
        expect(replicatedExamRow([pass, fail, fail]).verdict).toBe('fail');
        const mixed = replicatedExamRow([pass, { row3: 'pass', row4: 'fail' }, { row3: 'pass', row4: 'fail' }]);
        expect(mixed.verdict).toBe('fail');
    });

    it('is not run when a third run could still decide it, and a row that did not run is no pass', () => {
        expect(replicatedExamRow([pass, fail]).verdict).toBe('not run');
        const gap = replicatedExamRow([pass, { row3: 'pass', row4: 'not run' }]);
        expect(gap.verdict).toBe('not run');
    });
});

describe('judgeSet', () => {
    const rows = REQUIRED_ROWS.map((n) => examRow(n, 'pass'));

    it('calls a set good only with every required row passing and row 10 signed', () => {
        expect(judgeSet(rows, true)).toEqual({ good: true, open: [] });
        expect(judgeSet(rows, false)).toEqual({ good: false, open: [10] });
    });

    it('lists the required rows that did not pass, a missing row among them', () => {
        const some = [examRow(1, 'pass'), examRow(3, 'fail'), examRow(4, 'not run')];
        expect(judgeSet(some, true).open).toEqual([3, 4, 6, 7, 8, 9]);
        expect(judgeSet(some, false).open).toEqual([3, 4, 6, 7, 8, 9, 10]);
    });
});
