// reads: evals/fair-chase/courser.json, scripts/role-budget.mjs
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../js/evo/chase-arena.js';
import { parseArgs, runBudget } from '../scripts/role-budget.mjs';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

const dir = () => mkdtempSync(join(tmpdir(), 'role-budget-'));

/** Runs the budget with its output captured and its log in a temporary directory. */
async function run(/** @type {string[]} */ argv) {
    const lines = /** @type {string[]} */ ([]);
    const logDir = dir();
    const done = await runBudget(parseArgs(argv), { logDir, print: (text) => lines.push(text) });
    return { ...done, text: lines.join('\n'), logDir };
}

describe('role:budget --search', () => {
    it(
        'writes override files for an impossible row that audit:chase --config accepts and that make the pair catchable',
        async () => {
            const outDir = dir();
            const { text, searched } = await run(['--rows', 'predator:forager', '--search', '--out-dir', outDir]);
            expect(text).toMatch(/predator:forager: smallest single changes that give it/);
            expect(searched).toHaveLength(1);
            expect(searched[0].findings.length).toBeGreaterThan(0);
            const files = readdirSync(outDir).sort();
            expect(files).toHaveLength(searched[0].findings.length);
            expect(files[0]).toBe('defaults-predator-forager-1.json');
            for (const file of files) {
                const overrides = JSON.parse(readFileSync(join(outDir, file), 'utf8'));
                expect(() => arenaConfig(overrides)).not.toThrow();
            }
        },
        scaleTimeout(120000),
    );

    it(
        'searches nothing for a row that is fit for the rung screen (courser against the scout)',
        async () => {
            const outDir = dir();
            const { searched } = await run([
                '--config',
                'evals/fair-chase/courser.json',
                '--rows',
                'predator:scout',
                '--search',
                '--out-dir',
                outDir,
            ]);
            expect(searched).toEqual([]);
            expect(readdirSync(outDir)).toEqual([]);
        },
        scaleTimeout(120000),
    );
});

describe('role:budget --search on a pair that is caught but not learnable', () => {
    it(
        'looks for a change that makes the courser arm fit against the forager, every finding fit',
        async () => {
            const outDir = dir();
            const { searched } = await run([
                '--config',
                'evals/fair-chase/courser.json',
                '--rows',
                'predator:forager',
                '--search',
                '--out-dir',
                outDir,
            ]);
            expect(searched).toHaveLength(1);
            expect(searched[0].findings.length).toBeGreaterThan(0);
            expect(searched[0].findings.every((/** @type {any} */ f) => f.fit)).toBe(true);
            expect(readdirSync(outDir)[0]).toBe('courser-predator-forager-1.json');
        },
        scaleTimeout(120000),
    );
});

describe('role:budget --check', () => {
    it('prints the kinematic readings and each pair played both ways and finds no drift on the courser arm', async () => {
        const { text, check } = await run([
            '--config',
            'evals/fair-chase/courser.json',
            '--rows',
            'predator:forager,predator:scout',
            '--check',
        ]);
        expect(check.drift).toBe(0);
        expect(text).toMatch(/turn radius\s+41\.718\s+41\.809\s+0\.217%\s+0\.500%\s+ok/);
        expect(text).toMatch(/predator:forager straight: 40 cells, 0 drift/);
        expect(text).toMatch(/predator:scout broken: 40 cells, 0 drift/);
        expect(text).toMatch(
            /predator:forager broken: 40 cells, 0 drift, net energy per kill within [\d.]+%, catch share 0 /,
        );
        expect(text).not.toMatch(/DRIFT/);
    });
});
