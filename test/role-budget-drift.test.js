// reads: scripts/role-budget.mjs
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// a cross-check whose readings are all outside their tolerance, so the command's drift path runs without a slow scene
vi.mock('../js/evo/role-budget-check.js', () => ({
    kinematicRows: () => [
        {
            spec: 'predator',
            what: 'turn radius',
            formula: 41.7,
            sim: 45,
            difference: 0.07,
            tolerance: 0.005,
            drift: true,
        },
    ],
    chaseCells: () => [
        { distance: 160, bearing: 0, straight: true, formula: 52, sim: null, agrees: false, edge: false, drift: true },
    ],
}));

const { main } = await import('../scripts/role-budget.mjs');

describe('role:budget --check on drift', () => {
    it('prints both readings, logs RoleBudgetDrift once per reading outside its tolerance and exits 1', async () => {
        const logDir = mkdtempSync(join(tmpdir(), 'role-budget-'));
        const printed = /** @type {string[]} */ ([]);
        const code = await main(['--rows', 'predator:scout', '--check'], { logDir, print: (t) => printed.push(t) });
        expect(code).toBe(1);
        expect(printed.join('\n')).toMatch(/turn radius\s+41\.700\s+45\.000\s+7\.000%\s+0\.500%\s+DRIFT/);
        expect(printed.join('\n')).toMatch(
            /predator:scout straight: 1 cells, 1 drift\n\s+160px@0: formula 52 sim none/,
        );
        const events = readFileSync(join(logDir, readdirSync(logDir)[0]), 'utf8')
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line))
            .filter((e) => e.event === 'RoleBudgetDrift');
        expect(events).toHaveLength(3);
        expect(events[0]).toMatchObject({
            level: 'warn',
            row: 'predator',
            step: 'turn radius',
            formula: 41.7,
            scene: 45,
            tolerance: 0.005,
        });
    });
});
