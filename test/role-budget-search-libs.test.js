// reads: scripts/lib/role-budget-defender-search.mjs, scripts/lib/role-budget-birth-search.mjs
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const defenderFinding = /** @type {any} */ ({
    goal: 'defence',
    factor: 2,
    path: 'a.b',
    value: 1.234567,
    margins: { hear: 3.4, turn: null, run: 5, intercept: 6, smoke: 7 },
    status: 'ok',
    overrides: { a: { b: 1.234567 } },
});
const birthFinding = /** @type {any} */ ({
    changes: [{ path: 'x.y', value: 0.123456, factor: 1.5 }],
    ratio: 0.9,
    firstMeal: 1,
    overrides: { x: { y: 0.123456 } },
});

vi.mock('../js/evo/role-budget-search-defend.js', () => ({
    searchDefender: vi.fn((_config, { goal }) => (goal === 'defence' ? Array(7).fill(defenderFinding) : [])),
}));
vi.mock('../js/evo/role-budget-search-birth.js', () => ({
    searchBirth: vi.fn((_config, { spec }) => (spec === 'forager' ? [birthFinding] : [])),
}));

const { formatDefenderSearch, searchDefenderRows } = await import('../scripts/lib/role-budget-defender-search.mjs');
const { formatBirthSearch, searchBirthRows } = await import('../scripts/lib/role-budget-birth-search.mjs');

describe('role-budget search libraries', () => {
    let dir = '';
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'rb-search-'));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('writes at most five defender override files for a goal and none for a goal with no finding', () => {
        const out = join(dir, 'nested');
        const rows = searchDefenderRows({}, { overrides: {}, model: /** @type {any} */ ({}), outDir: out, arm: 'arm' });
        expect(rows.map((r) => [r.goal, r.findings.length, r.files.length])).toEqual([
            ['defence', 5, 5],
            ['smoke', 0, 0],
        ]);
        expect(JSON.parse(readFileSync(rows[0].files[0], 'utf8'))).toEqual(defenderFinding.overrides);
        expect(rows[0].files[4]).toBe(join(out, 'arm-defender-predator-defence-5.json'));
    });

    it('formats a defender finding with its cells, and says so when a goal has none', () => {
        const text = formatDefenderSearch([
            { goal: 'defence', findings: [defenderFinding], files: ['f.json'] },
            { goal: 'smoke', findings: [], files: [] },
        ]);
        expect(text).toContain('defender:predator defence: smallest single changes that give it');
        expect(text).toMatch(/x2\s+a\.b\s+1\.2346\s+3 X 5 6 7\s+ok\s+f\.json/);
        expect(text).toContain('defender:predator smoke: no single setting');
    });

    it('searches only red non-hunting first-meal rows and writes their files', () => {
        const rows = [
            { name: 'forager:first-meal', status: 'red' },
            { name: 'sitter:first-meal', status: 'red' },
            { name: 'predator:first-meal', status: 'red' },
            { name: 'scout:first-meal', status: 'ok' },
            { name: 'forager:other', status: 'red' },
        ];
        const searched = searchBirthRows(
            {},
            { overrides: {}, model: /** @type {any} */ ({}), outDir: join(dir, 'b'), arm: 'arm', rows },
        );
        expect(searched.map((s) => [s.spec, s.findings.length])).toEqual([
            ['forager', 1],
            ['sitter', 0],
        ]);
        expect(existsSync(searched[0].files[0])).toBe(true);
        expect(searched[0].files[0]).toBe(join(dir, 'b', 'arm-forager-birth-1.json'));
    });

    it('formats a birth finding with its changes and idle ratio, and a spec with none', () => {
        const text = formatBirthSearch([
            { spec: 'forager', findings: [birthFinding], files: ['g.json'] },
            { spec: 'sitter', findings: [], files: [] },
        ]);
        expect(text).toContain('x.y=0.12346 (x1.5)');
        expect(text).toContain('0.90');
        expect(text).toContain('g.json');
        expect(text).toContain('sitter:first-meal: no birth-energy change');
    });
});
