import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { main, parseArgs, runReflex } from '../scripts/reflex.mjs';
import { formatBars, formatKinds, formatReport, formatRows, reportJson } from '../scripts/lib/reflex-report.mjs';
import { runReflexTask } from '../scripts/reflex-worker.mjs';
import { caseNamed } from '../js/evo/reflex-cases.js';
import { reflexRandomBrains } from '../js/evo/reflex-score.js';
import { makeChampionFile } from './evo/helpers/champion-file.js';

const root = mkdtempSync(join(tmpdir(), 'reflex-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** @returns {string} a directory with one forager and one predator champion */
function champions() {
    const dir = join(root, 'champions');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'a.json'), JSON.stringify(makeChampionFile('forager', 1, { specialisation: 0 })));
    writeFileSync(join(dir, 'b.json'), JSON.stringify(makeChampionFile('predator', 2, { specialisation: 1 })));
    return dir;
}

describe('parseArgs', () => {
    it('defaults to every case, 16 trials, seed 1, 8 elites and the info level', () => {
        const args = parseArgs(['--champions', 'd']);
        expect(args).toMatchObject({ champions: 'd', seed: 1, trials: 16, count: 8, level: 'info', json: false });
        expect(args.cases).toHaveLength(6);
    });

    it('reads every flag', () => {
        expect(
            parseArgs([
                '--policy',
                'p',
                '--count',
                '3',
                '--cases',
                'flee-threat,approach-prey',
                '--seed',
                '4',
                '--trials',
                '2',
                '--level',
                'debug',
                '--json',
                '--out',
                'o.txt',
                '--workers',
                '2',
            ]),
        ).toMatchObject({
            policy: 'p',
            count: 3,
            cases: ['flee-threat', 'approach-prey'],
            seed: 4,
            trials: 2,
            level: 'debug',
            json: true,
            out: 'o.txt',
            workers: 2,
        });
    });

    it('needs exactly one source, known cases and a known level', () => {
        expect(() => parseArgs([])).toThrow(/exactly one of/);
        expect(() => parseArgs(['--champions', 'a', '--archive', 'b'])).toThrow(/exactly one of/);
        expect(() => parseArgs(['--champions', 'a', '--cases', 'nope'])).toThrow(/unknown case "nope"/);
        expect(() => parseArgs(['--champions', 'a', '--trials', '0'])).toThrow(/--trials/);
        expect(() => parseArgs(['--champions', 'a', '--level', 'loud'])).toThrow(/--level/);
        expect(() => parseArgs(['--champions', 'a', '--bogus'])).toThrow(/unknown argument/);
    });
});

describe('the report', () => {
    const cell = (/** @type {number} */ passShare, /** @type {number} */ edge) => ({
        passShare,
        edge,
        fast: 0.5,
        kinds: {},
    });
    /** @type {import('../scripts/lib/reflex-report.mjs').ReflexReportRow[]} */
    const rows = [
        {
            label: 'g',
            row: { cases: { a: cell(0.75, 0.5), b: cell(0.25, -0.25) }, score: 0.5, edge: 0.25, fast: 0.5 },
        },
        { label: 'skipped', row: null },
    ];
    const bars = {
        a: { random: 0.25, constant: 0.1, reference: 1, valid: true },
        b: { random: 0.5, constant: 0.6, reference: 0.8, valid: false },
    };

    it('prints a cell per case with - for one the subject does not face, then score, edge and fast', () => {
        const [header, first, second] = formatRows(['a', 'b', 'c'], rows);
        expect(header.split(/\s{2,}/)).toEqual(['subject', 'a', 'b', 'c', 'score', 'edge', 'fast']);
        expect(first.split(/\s{2,}/)).toEqual(['g', '0.75 (+0.50)', '0.25 (-0.25)', '-', '0.50', '+0.25', '0.50']);
        expect(second.split(/\s{2,}/)).toEqual(['skipped', '-', '-', '-', '-', '-', '-']);
    });

    it('prints the bars of each case and whether it is valid', () => {
        const [header, a, b] = formatBars(['a', 'b'], bars);
        expect(header.split(/\s{2,}/)).toEqual(['case', 'random', 'constant', 'reference', 'valid']);
        expect(a.split(/\s{2,}/)).toEqual(['a', '0.25', '0.10', '1.00', 'yes']);
        expect(b.split(/\s{2,}/)).toEqual(['b', '0.50', '0.60', '0.80', 'NO']);
        expect(formatReport(['a', 'b'], { rows, bars }).split('\n')).toContain('');
    });

    it('prints the pass share and bite share of each bite-discrimination kind apart, and nothing without that case', () => {
        expect(formatKinds(rows)).toEqual([]);
        const kinds = {
            prey: { stagings: 8, passShare: 0.5, biteShare: 0.25 },
            kin: { stagings: 8, passShare: 1, biteShare: 0 },
        };
        const biter = [
            { label: 'b', row: { ...rows[0].row, cases: { 'bite-discrimination': { ...cell(0.5, 0), kinds } } } },
        ];
        const partial = {
            label: 'p',
            row: { ...rows[0].row, cases: { 'bite-discrimination': { ...cell(0.5, 0), kinds: { prey: kinds.prey } } } },
        };
        const [header, line, partialLine] = formatKinds(
            /** @type {any} */ ([...biter, { label: 's', row: null }, partial]),
        );
        expect(partialLine.split(/\s{2,}/)).toEqual(['p', '0.50 bite 0.25', '-']);
        expect(header.split(/\s{2,}/)).toEqual(['bite-discrimination (pass, bite share)', 'prey', 'kin']);
        expect(line.split(/\s{2,}/)).toEqual(['b', '0.50 bite 0.25', '1.00 bite 0.00']);
    });

    it('is plain data as JSON', () => {
        const json = reportJson(['a', 'b'], { rows, bars });
        expect(json.cases).toEqual(['a', 'b']);
        expect(json.rows[0].row?.score).toBe(0.5);
        expect(json.bars.b.valid).toBe(false);
    });
});

describe('runReflexTask', () => {
    const flee = caseNamed('flee-threat');
    const subjects = reflexRandomBrains(flee, { seed: 77 })
        .slice(0, 2)
        .map((s, i) => ({ name: `g${i}`, id: i + 1, weights: /** @type {Float32Array} */ (s.weights) }));
    const task = { case: 'flee-threat', subjects, seed: 1, trials: 4, config: {}, debug: false };

    it('scores the subjects in order and returns the bars of the case', () => {
        const { scores, bars, records } = runReflexTask(task);
        expect(scores).toHaveLength(2);
        expect(scores[0].trials).toBe(4);
        expect(bars.reference).toBeGreaterThanOrEqual(0.9);
        expect(records).toEqual([]);
    });

    it('returns a record per failed trial only in debug', () => {
        const { scores, records } = runReflexTask({ ...task, debug: true });
        const failed = scores.reduce((sum, s) => sum + (s.trials - s.passes), 0);
        expect(failed).toBeGreaterThan(0);
        expect(records).toHaveLength(failed);
        expect(records[0]).toMatchObject({ case: 'flee-threat' });
    });

    it('names an unknown case', () => {
        expect(() => runReflexTask({ ...task, case: 'nope' })).toThrow(/unknown case "nope"/);
    });
});

describe('runReflex', () => {
    it('prints a row per champion and the bars, with - for the cases a champion does not face', async () => {
        /** @type {string[]} */
        const lines = [];
        const args = parseArgs(['--champions', champions(), '--trials', '2', '--workers', '1', '--level', 'debug']);
        const { rows, bars } = await runReflex(args, { logDir: join(root, 'logs'), print: (l) => lines.push(l) });
        expect(rows.map((r) => r.label)).toEqual(['forager', 'predator']);
        expect(Object.keys(rows[0].row?.cases ?? {})).toEqual([
            'flee-threat',
            'approach-food',
            'pick-safe-food',
            'avoid-obstacle',
        ]);
        expect(Object.keys(rows[1].row?.cases ?? {})).toEqual(['approach-prey', 'bite-discrimination']);
        expect(Object.keys(bars)).toHaveLength(6);
        expect(lines.join('\n')).toContain('reference');
        const log = readFileSync(join(root, 'logs', 'reflex-1x2.jsonl'), 'utf8')
            .split('\n')
            .filter(Boolean)
            .map((l) => JSON.parse(l));
        expect(log.filter((l) => l.event === 'ReflexResult')).toHaveLength(6);
        expect(log.filter((l) => l.event === 'ReflexCase').length).toBeGreaterThan(0);
    });

    it('skips a genome whose specialisation faces none of the selected cases', async () => {
        const args = parseArgs([
            '--champions',
            champions(),
            '--trials',
            '1',
            '--workers',
            '1',
            '--cases',
            'approach-prey',
        ]);
        const { rows } = await runReflex(args, { logDir: join(root, 'logs-skip') });
        expect(rows[0].row).toBeNull();
        expect(rows[1].row?.cases['approach-prey']).toBeDefined();
    });

    it('prints the same table on one worker and on two', async () => {
        const dir = champions();
        const run = async (/** @type {string} */ workers) => {
            /** @type {string[]} */
            const lines = [];
            const args = parseArgs([
                '--champions',
                dir,
                '--trials',
                '2',
                '--cases',
                'flee-threat,approach-prey',
                '--workers',
                workers,
            ]);
            await runReflex(args, { logDir: join(root, `logs-${workers}`), print: (l) => lines.push(l) });
            return lines.join('\n');
        };
        expect(await run('1')).toBe(await run('2'));
    });

    it('writes the output file and prints JSON with --json', async () => {
        const out = join(root, 'out.json');
        const args = parseArgs(['--champions', champions(), '--trials', '1', '--workers', '1', '--json', '--out', out]);
        await runReflex(args, { logDir: join(root, 'logs-json') });
        const json = JSON.parse(readFileSync(out, 'utf8'));
        expect(json.rows).toHaveLength(2);
        expect(json.bars['flee-threat'].reference).toBeGreaterThanOrEqual(0);
    });
});

describe('main', () => {
    it('exits 1 and prints the message on a bad argument', async () => {
        expect(await main([])).toBe(1);
    });
});
