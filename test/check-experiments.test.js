import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkFiles, checkLedger } from '../scripts/check-experiments.mjs';
import { validate } from '../scripts/lib/json-schema-lite.mjs';

const schema = JSON.parse(readFileSync(new URL('../evals/experiments.schema.json', import.meta.url), 'utf8'));

/**
 * @param {Record<string, unknown>} [over] fields to replace
 * @returns {Record<string, unknown>} a valid entry
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
 * @param {...Record<string, unknown>} entries ledger entries
 * @returns {string[]} problems
 */
const check = (...entries) => checkLedger({ experiments: entries }, schema);

describe('checkLedger', () => {
    it('accepts an empty ledger and a valid entry with optional policies', () => {
        expect(check()).toEqual([]);
        expect(check(entry(), entry({ id: 'E2', beforePolicy: 'baseline-v5', afterPolicy: 'live' }))).toEqual([]);
    });

    it('names the entry, the schema path and the value for an enum error', () => {
        expect(check(entry(), entry({ id: 'E3', effect: 'maybe' }))).toEqual([
            'experiments[1] (E3): /properties/effect/enum: at effect: "maybe" is not one of better, worse, no-difference, exploit',
        ]);
    });

    it('names a bad id pattern and a bad date', () => {
        const problems = check(entry({ id: 'x1', date: '16/10/2026' }));
        expect(problems).toContain('experiments[0] (x1): /properties/id/pattern: at id: "x1" does not match ^E\\d+$');
        expect(problems.some((p) => p.includes('/properties/date/pattern'))).toBe(true);
    });

    it('names a missing field and an unexpected one', () => {
        const rest = entry();
        delete rest.note;
        expect(check(rest)).toEqual(['experiments[0] (E1): /required: missing required "note"']);
        expect(check(entry({ extra: 1 }))).toEqual([
            'experiments[0] (E1): /additionalProperties: at extra: unexpected property "extra"',
        ]);
    });

    it('names wrong types inside arrays and the verdicts object', () => {
        expect(check(entry({ targets: ['a', 3] }))).toEqual([
            'experiments[0] (E1): /properties/targets/items/type: at targets/1: 3 is not of type string',
        ]);
        const bad = check(entry({ verdicts: { 'pop.mean': 'nope' } }));
        expect(bad).toEqual([
            'experiments[0] (E1): /properties/verdicts/additionalProperties/enum: at verdicts/pop.mean: "nope" is not one of better, worse, no-difference, -',
        ]);
    });

    it('labels an entry without an id by its index', () => {
        expect(check({})[0]).toMatch(/^experiments\[0\]: \/required: missing required "id"/);
        expect(check(/** @type {any} */ (7))[0]).toBe('experiments[0]: /type: 7 is not of type object');
    });

    it('rejects a duplicate id and ids that do not increase', () => {
        expect(check(entry(), entry())).toEqual(['experiments[1] (E1): duplicate id E1 (first at experiments[0])']);
        expect(check(entry({ id: 'E2' }), entry({ id: 'E1' }))).toEqual([
            'experiments[1] (E1): ids must increase, E1 follows E2',
        ]);
    });

    it('rejects a ledger of the wrong shape', () => {
        expect(checkLedger([], schema)[0]).toBe('/type: [] is not of type object');
        expect(checkLedger({}, schema)).toEqual(['/required: missing required "experiments"']);
        expect(checkLedger({ experiments: {} }, schema)[0]).toContain('/properties/experiments/type');
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

describe('the real ledger', () => {
    it('passes', () => {
        expect(checkFiles()).toEqual([]);
    });

    it('reports an unreadable file as a problem', () => {
        expect(checkFiles('/nonexistent/ledger.json')[0]).toContain('/nonexistent/ledger.json');
    });
});

describe('the command line', () => {
    it('exits 0 on the real ledger', () => {
        expect(spawnSync('node', ['scripts/check-experiments.mjs']).status).toBe(0);
    });

    it('exits 1 and prints the problem for a bad ledger', () => {
        const bad = new URL('./fixtures/bad-ledger.json', import.meta.url);
        const run = spawnSync('node', ['scripts/check-experiments.mjs', bad.pathname], { encoding: 'utf8' });
        expect(run.status).toBe(1);
        expect(run.stdout).toContain('experiments[0] (E1): /properties/effect/enum');
    });
});
