import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDirectory, checkFiles, checkRecord } from '../scripts/check-experiments.mjs';
import { validate } from '../scripts/lib/json-schema-lite.mjs';

const schema = JSON.parse(readFileSync(new URL('../evals/experiments.schema.json', import.meta.url), 'utf8'));

/**
 * @param {Record<string, unknown>} [over] fields to replace
 * @returns {Record<string, unknown>} a valid record
 */
function entry(over = {}) {
    return {
        id: 'E1',
        date: '2026-10-16',
        branch: 'feat/x',
        hypothesis: 'h',
        prediction: 'p',
        targets: ['pop.mean'],
        before: 'a.json',
        after: 'b.json',
        verdicts: { 'pop.mean': 'better', 'x.y': '-' },
        effect: 'better',
        note: '',
        ...over,
    };
}

/**
 * @param {Record<string, unknown>} record a record
 * @returns {string[]} problems, the record read from the file `E<id>.json`
 */
const check = (record) => checkRecord(record, schema, `${record.id}.json`);

describe('checkRecord', () => {
    it('accepts a valid record with optional policies', () => {
        expect(check(entry())).toEqual([]);
        expect(check(entry({ id: 'E2', beforePolicy: 'baseline-v5', afterPolicy: 'live' }))).toEqual([]);
    });

    it('names the file, the schema path and the value for an enum error', () => {
        expect(check(entry({ id: 'E3', effect: 'maybe' }))).toEqual([
            'E3.json: /properties/effect/enum: at effect: "maybe" is not one of better, worse, no-difference, exploit',
        ]);
    });

    it('names a bad id pattern and a bad date', () => {
        const problems = checkRecord(entry({ id: 'x1', date: '16/10/2026' }), schema, 'x1.json');
        expect(problems).toContain('x1.json: /properties/id/pattern: at id: "x1" does not match ^E\\d+$');
        expect(problems.some((p) => p.includes('/properties/date/pattern'))).toBe(true);
    });

    it('names a missing field and an unexpected one', () => {
        const rest = entry();
        delete rest.note;
        expect(check(rest)).toEqual(['E1.json: /required: missing required "note"']);
        expect(check(entry({ extra: 1 }))).toEqual([
            'E1.json: /additionalProperties: at extra: unexpected property "extra"',
        ]);
    });

    it('names wrong types inside arrays and the verdicts object', () => {
        expect(check(entry({ targets: ['a', 3] }))).toEqual([
            'E1.json: /properties/targets/items/type: at targets/1: 3 is not of type string',
        ]);
        expect(check(entry({ verdicts: { 'pop.mean': 'nope' } }))).toEqual([
            'E1.json: /properties/verdicts/additionalProperties/enum: at verdicts/pop.mean: "nope" is not one of better, worse, no-difference, -',
        ]);
    });

    it('rejects a value that is not a record', () => {
        expect(checkRecord(7, schema, 'E1.json')).toEqual(['E1.json: /type: 7 is not of type object']);
        expect(checkRecord({}, schema, 'E1.json')[0]).toMatch(/^E1\.json: \/required: missing required "id"/);
    });

    it('requires the file name to match the id', () => {
        expect(checkRecord(entry({ id: 'E2' }), schema, 'E1.json')).toEqual([
            'E1.json: the file name must match the id E2 (E2.json)',
        ]);
    });
});

describe('checkRecord reports', () => {
    const root = mkdtempSync(join(tmpdir(), 'ledger-'));
    mkdirSync(join(root, 'evals/decisions/E151'), { recursive: true });
    mkdirSync(join(root, 'evals/results'), { recursive: true });
    writeFileSync(join(root, 'evals/decisions/E151/report.json'), '{}');
    writeFileSync(join(root, 'evals/results/r.json'), '{}');
    const at = (/** @type {Record<string, unknown>} */ record) =>
        checkRecord(record, schema, `${record.id}.json`, root);

    it('asks nothing of a record before E151, and accepts reports on one', () => {
        expect(at(entry({ id: 'E150' }))).toEqual([]);
        expect(at(entry({ id: 'E7', reports: ['evals/results/r.json'] }))).toEqual([]);
    });

    it('requires a record from E151 on to name its reports', () => {
        expect(at(entry({ id: 'E151' }))).toEqual(['E151.json: from E151 on a record names its reports']);
        expect(at(entry({ id: 'E152', reports: [] }))).toHaveLength(1);
    });

    it('accepts reports that exist under evals/decisions/', () => {
        expect(at(entry({ id: 'E151', reports: ['evals/decisions/E151/report.json'] }))).toEqual([]);
    });

    it('names a report that is missing, a directory, outside evals/decisions/ or climbs out of it', () => {
        const reports = [
            'evals/decisions/E151/missing.json',
            'evals/decisions/E151',
            'evals/results/r.json',
            'evals/decisions/../results/r.json',
        ];
        expect(at(entry({ id: 'E151', reports }))).toEqual([
            'E151.json: reports: evals/decisions/E151/missing.json: no such file',
            'E151.json: reports: evals/decisions/E151: no such file',
            'E151.json: reports: evals/results/r.json: a report lives under evals/decisions/',
            'E151.json: reports: evals/decisions/../results/r.json: a report lives under evals/decisions/',
        ]);
    });

    it('reads the repo root by default, where evals/decisions/ exists', () => {
        expect(checkRecord(entry({ id: 'E151', reports: ['evals/decisions/.gitkeep'] }), schema, 'E151.json')).toEqual(
            [],
        );
    });
});

describe('checkDirectory', () => {
    /**
     * @param {Record<string, string>} files file name to contents
     * @returns {string} a ledger directory holding them
     */
    function ledger(files) {
        const dir = mkdtempSync(join(tmpdir(), 'ledger-dir-'));
        for (const [name, text] of Object.entries(files)) {
            writeFileSync(join(dir, name), text);
        }
        return dir;
    }

    it('accepts a directory of valid records', () => {
        const dir = ledger({ 'E1.json': JSON.stringify(entry()), 'E2.json': JSON.stringify(entry({ id: 'E2' })) });
        expect(checkDirectory(dir, schema)).toEqual([]);
    });

    it('names a stray file, a file that is not JSON and a bad record, in file order', () => {
        const dir = ledger({
            'E1.json': JSON.stringify(entry({ effect: 'maybe' })),
            'E2.json': '{',
            'notes.txt': 'x',
        });
        const problems = checkDirectory(dir, schema);
        expect(problems).toHaveLength(3);
        expect(problems[0]).toContain('E1.json: /properties/effect/enum');
        expect(problems[1]).toContain(join(dir, 'E2.json'));
        expect(problems[2]).toBe('notes.txt: not a record file; a ledger file is named E<id>.json');
    });

    it('reports a record that is null', () => {
        const dir = ledger({ 'E1.json': 'null' });
        expect(checkDirectory(dir, schema)).toEqual(['E1.json: /type: null is not of type object']);
    });
});

describe('checkFiles', () => {
    it('reports a missing directory and an unreadable schema as problems', () => {
        expect(checkFiles('/nonexistent/ledger')).toEqual(['/nonexistent/ledger: no such directory']);
        expect(checkFiles(undefined, '/nonexistent/schema.json')).toEqual([
            expect.stringContaining('/nonexistent/schema.json'),
        ]);
    });
});

describe('validate', () => {
    it('checks minItems, minLength and additionalProperties schemas', () => {
        expect(validate({ type: 'array', minItems: 1 }, [])[0].schemaPath).toBe('/minItems');
        expect(validate({ type: 'string', minLength: 2 }, 'a')[0].schemaPath).toBe('/minLength');
        expect(validate({ type: 'object', additionalProperties: { type: 'number' } }, { a: 'x' })[0].instancePath).toBe(
            '/a',
        );
    });
});

describe('the command line', () => {
    it('exits 1 and prints the problem for a bad ledger', () => {
        const dir = mkdtempSync(join(tmpdir(), 'ledger-cli-'));
        writeFileSync(join(dir, 'E1.json'), JSON.stringify(entry({ effect: 'maybe' })));
        const run = spawnSync('node', ['scripts/check-experiments.mjs', dir], { encoding: 'utf8' });
        expect(run.status).toBe(1);
        expect(run.stdout).toContain('experiments: E1.json: /properties/effect/enum');
    });
});
