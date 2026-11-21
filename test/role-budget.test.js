// reads: evals/fair-chase/courser.json, scripts/role-budget.mjs
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PHASE1_ROWS, matrix } from '../js/evo/role-budget-matrix.js';
import { MODEL_DEFAULTS } from '../js/evo/role-budget-model.js';
import { arenaConfig } from '../js/evo/chase-arena.js';
import { applySets, main, parseArgs, runBudget } from '../scripts/role-budget.mjs';
import {
    cellText,
    formatDetail,
    formatMatrix,
    formatReport,
    formatSearch,
} from '../scripts/lib/role-budget-report.mjs';
import { cell } from '../js/evo/role-budget-cell.js';

const COURSER = 'evals/fair-chase/courser.json';
const dir = () => mkdtempSync(join(tmpdir(), 'role-budget-'));

/** Runs the budget with its output captured and its log in a temporary directory. */
async function run(/** @type {string[]} */ argv) {
    const lines = /** @type {string[]} */ ([]);
    const logDir = dir();
    const done = await runBudget(parseArgs(argv), { logDir, print: (text) => lines.push(text) });
    return { ...done, text: lines.join('\n'), logDir };
}

describe('parseArgs', () => {
    it('defaults to the rows of the built phases, no search, no check and the evals/role-budget directory', () => {
        expect(parseArgs([])).toEqual({
            config: null,
            model: null,
            mix: undefined,
            rows: undefined,
            search: false,
            check: false,
            reliable: false,
            outDir: 'evals/role-budget',
            json: false,
            out: null,
            set: [],
        });
    });

    it('reads every flag, --set repeated', () => {
        expect(
            parseArgs([
                '--config',
                'a.json',
                '--set',
                'maxVelocity=9',
                '--set',
                'specialisations.predator.sprintBoost=1.8',
                '--model',
                'm.json',
                '--mix',
                'forager=0.6,scout=0.4',
                '--rows',
                'predator:forager,predator:best',
                '--search',
                '--check',
                '--reliable',
                '--out-dir',
                'x',
                '--json',
                '--out',
                'o.txt',
            ]),
        ).toEqual({
            config: 'a.json',
            set: ['maxVelocity=9', 'specialisations.predator.sprintBoost=1.8'],
            model: 'm.json',
            mix: { forager: 0.6, scout: 0.4 },
            rows: ['predator:forager', 'predator:best'],
            search: true,
            check: true,
            reliable: true,
            outDir: 'x',
            json: true,
            out: 'o.txt',
        });
    });

    it('refuses a bad mix, a --set without a value and an unknown flag', () => {
        expect(() => parseArgs(['--mix', 'forager'])).toThrow(/not spec=weight/);
        expect(() => parseArgs(['--mix', 'forager=x'])).toThrow(/not spec=weight/);
        expect(() => parseArgs(['--set'])).toThrow(/--set needs path=value/);
        expect(() => parseArgs(['--bogus'])).toThrow(/unknown argument/);
    });
});

describe('applySets', () => {
    it('sets a nested path, reading numbers, booleans and strings, in order, on a copy', () => {
        const base = { a: 1 };
        const out = applySets(base, [
            'specialisations.predator.sprintBoost=1.8',
            'sprintStoreEnabled=true',
            'x=hello',
            'a=2',
            'a=3',
        ]);
        expect(out).toEqual({
            a: 3,
            specialisations: { predator: { sprintBoost: 1.8 } },
            sprintStoreEnabled: true,
            x: 'hello',
        });
        expect(base).toEqual({ a: 1 });
    });

    it('refuses an entry with no path or no equals sign', () => {
        expect(() => applySets({}, ['maxVelocity'])).toThrow(/not path=value/);
        expect(() => applySets({}, ['=3'])).toThrow(/not path=value/);
    });
});

describe('runBudget', () => {
    it('prints the matrix for the rows asked for, with the detail under it, and logs RoleBudgetCell per cell', async () => {
        const { text, logDir } = await run(['--config', COURSER, '--rows', 'predator:forager,predator:scout']);
        expect(text).toMatch(/role budget {2}config [0-9a-f]+ {2}rules [0-9a-f]+/);
        expect(text).toMatch(/row\s+see\s+turn\s+run\s+bite\s+status\s+binding/);
        expect(text).toMatch(/predator:forager\s+\d+\s+\d+\s+\d+\s+\d+\s+(ok|tight)\s+\w+/);
        expect(text).toMatch(/learn slope/);
        expect(text).not.toMatch(/predator:defender/);
        const logs = readFileSync(join(logDir, `${readdirSync(logDir)[0]}`), 'utf8')
            .trim()
            .split('\n')
            .map((l) => JSON.parse(l));
        expect(logs.filter((l) => l.event === 'RoleBudgetCell')).toHaveLength(8);
        expect(logs.find((l) => l.event === 'RunConfig')).toMatchObject({ tool: 'role-budget' });
    });

    it('reads the same budget from --set as from the config file: the defaults with the courser store are the courser arm', async () => {
        const viaFile = await run(['--config', COURSER, '--rows', 'predator:forager', '--json']);
        const viaSet = await run([
            '--set',
            'sprintStoreEnabled=true',
            '--set',
            'sprintDrain=0.01',
            '--set',
            'specialisations.predator.sprintDrainMultiplier=0.5',
            '--rows',
            'predator:forager',
            '--json',
        ]);
        expect(JSON.parse(viaSet.text).rows[0].cells).toEqual(JSON.parse(viaFile.text).rows[0].cells);
        expect(JSON.parse(viaSet.text).configHash).toBe(JSON.parse(viaFile.text).configHash);
    });

    it('prints JSON with the rows, the model and the rules hash, and writes --out', async () => {
        const out = join(dir(), 'budget.json');
        const { text } = await run(['--rows', 'predator:forager', '--json', '--out', out]);
        const json = JSON.parse(text);
        expect(json.rows).toHaveLength(1);
        expect(json.model).toEqual(MODEL_DEFAULTS);
        expect(json.rulesHash).toMatch(/^[0-9a-f]+$/);
        expect(readFileSync(out, 'utf8').trim()).toBe(text);
    });

    it('is red at the defaults and green on the courser arm for the hunter against the forager', async () => {
        const red = JSON.parse((await run(['--rows', 'predator:forager', '--json'])).text).rows[0];
        const green = JSON.parse((await run(['--config', COURSER, '--rows', 'predator:forager', '--json'])).text)
            .rows[0];
        expect(red.status).toBe('impossible');
        expect(green.status).not.toBe('impossible');
    });

    it('takes model options from --model and --reliable, and refuses an unknown one', async () => {
        const file = join(dir(), 'model.json');
        writeFileSync(file, JSON.stringify({ tightTicks: 10 }));
        const tight = JSON.parse(
            (await run(['--config', COURSER, '--rows', 'predator:forager', '--model', file, '--reliable', '--json']))
                .text,
        );
        expect(tight.model).toMatchObject({ tightTicks: 10, reliableSight: true });
        writeFileSync(file, JSON.stringify({ nonsense: 1 }));
        await expect(run(['--model', file])).rejects.toThrow(/unknown option "nonsense"/);
    });

    it('refuses a row that is not built', async () => {
        await expect(run(['--rows', 'scout:predator'])).rejects.toThrow(/unknown row/);
    });

    it('finishes the matrix of the built phases in under 2 s without --check', async () => {
        const start = performance.now();
        await run(['--config', COURSER]);
        expect(performance.now() - start).toBeLessThan(2000);
    });

    it('weights the average row by --mix', async () => {
        const a = JSON.parse((await run(['--config', COURSER, '--rows', 'predator:average', '--json'])).text);
        const b = JSON.parse(
            (await run(['--config', COURSER, '--rows', 'predator:average', '--mix', 'scout=1', '--json'])).text,
        );
        expect(b.choice.mix.scout).toBe(1);
        expect(b.rows[0].cells.see.margin).not.toBe(a.rows[0].cells.see.margin);
    });
});

describe('main', () => {
    it('returns 0 and prints, and 1 with the message for a bad argument', async () => {
        const printed = /** @type {string[]} */ ([]);
        const code = await main(['--rows', 'predator:scout'], { logDir: dir(), print: (t) => printed.push(t) });
        expect(code).toBe(0);
        expect(printed.join('\n')).toMatch(/predator:scout/);
        expect(await main(['--nope'], { logDir: dir(), print: () => {} })).toBe(1);
    });
});

describe('the report', () => {
    const model = MODEL_DEFAULTS;
    const result = matrix(arenaConfig(), model, PHASE1_ROWS);

    it('prints a cell as its slack, >200 at the cap, ! for tight, X for impossible and - for not read', () => {
        expect(cellText(cell(40.4, model))).toBe('40');
        expect(cellText(cell(200, model))).toBe('>200');
        expect(cellText(cell(2, model))).toBe('2!');
        expect(cellText(cell(null, model))).toBe('X');
        expect(cellText(cell(undefined, model))).toBe('-');
    });

    it('prints the matrix, one row per line, with the status and the binding step', () => {
        const lines = formatMatrix(result.rows).split('\n');
        expect(lines).toHaveLength(1 + PHASE1_ROWS.length);
        expect(lines[1]).toMatch(/^predator:forager\s+-\s+-\s+X\s+X\s+impossible\s+run/);
    });

    it('prints the detail of a prey row and of the choice rows', () => {
        const detail = formatDetail(result.rows);
        expect(detail).toMatch(/catch margin \(broken bound, px\): -\d+/);
        expect(detail).toMatch(/audit bearings closing 0\.000/);
        expect(detail).toMatch(/catchable share 0\.00 {2}choice gain 0\.0 ticks {2}picks forager/);
        expect(formatReport(result, 'abc')).toMatch(/config abc/);
    });

    it('prints the findings of a search with their files, and says when there are none', () => {
        const text = formatSearch([
            {
                pair: 'predator:forager',
                findings: [
                    {
                        path: 'maxVelocity',
                        factor: 0.5,
                        value: 4,
                        margin: 64,
                        learnSlope: 'naive',
                        fit: false,
                        overrides: {},
                    },
                ],
                files: ['evals/role-budget/x-1.json'],
            },
            { pair: 'predator:scout', findings: [], files: [] },
        ]);
        expect(text).toMatch(/maxVelocity\s+4\s+\+64\s+naive\s+-\s+evals\/role-budget\/x-1.json/);
        expect(text).toMatch(/predator:scout: no single setting/);
    });

    it('prints the defender row in a table of its own, with its binding and the shove line', async () => {
        const off = await run(['--rows', 'predator:forager,defender:predator']);
        expect(off.text).toMatch(/row\s+see\s+turn\s+run\s+bite/);
        expect(off.text).toMatch(/row\s+hear\s+turn\s+run\s+intercept/);
        expect(off.text).toMatch(/defender:predator\s+48\s+-\s+X\s+X\s+\S+\s+impossible\s+repel: off/);
        expect(off.text).toMatch(/shove off \(defenderRepelEnergy and defenderRepelImpulse are 0\)/);
        const on = await run([
            '--rows',
            'defender:predator',
            '--set',
            'defenderRepelEnergy=40',
            '--set',
            'defenderRepelImpulse=4',
        ]);
        expect(on.text).toMatch(/shove on \(energy 40, impulse 4, cost 0\)/);
        expect(on.result.rows[0].binding).not.toBe('repel: off');
    });
});
