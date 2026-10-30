import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { format, parse, run } from '../scripts/fitness-by-spec.mjs';

describe('fitness-by-spec', () => {
    it('parses the seed, the ticks and a config file, and refuses an unknown flag', () => {
        expect(parse(['--seed', '4', '--ticks', '300'])).toEqual({ seed: 4, ticks: 300, config: null });
        expect(parse(['--config', 'x.json']).config).toBe('x.json');
        expect(() => parse(['--bogus'])).toThrow(/unknown argument/);
    });

    it('replays a seed and prints a row per specialisation with a scored life', () => {
        const dir = mkdtempSync(join(tmpdir(), 'fitness-by-spec-'));
        try {
            const file = join(dir, 'config.json');
            writeFileSync(file, JSON.stringify({ initialAgents: 60, minAgents: 60, maxAgents: 80 }));
            const { rows, world } = run({ seed: 2, ticks: 40, config: file, from: 0 });
            expect(world.tick).toBe(40);
            expect(rows.length).toBeGreaterThan(0);
            expect(rows.reduce((a, r) => a + r.lives, 0)).toBeGreaterThanOrEqual(world.population);
            const text = format(rows, { seed: 2, ticks: 40 });
            expect(text).toMatch(/^fitnessV6 by specialisation, seed 2, 40 ticks/);
            expect(text).toContain('| spec | lives | mean fitness | intake |');
            expect(text.split('\n')).toHaveLength(4 + rows.length);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('prints a dash for a share it cannot compute', () => {
        const rows = [{ spec: 'scout', lives: 1, mean: 0, shares: { intake: null } }];
        expect(format(/** @type {any} */ (rows), { seed: 1, ticks: 1 })).toContain('| scout | 1 | 0.0 | - |');
    });
});
