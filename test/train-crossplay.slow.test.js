import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseArgs, runTraining } from '../scripts/train.mjs';

const root = mkdtempSync(join(tmpdir(), 'train-crossplay-slow-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const world = join(root, 'world.json');
writeFileSync(
    world,
    JSON.stringify({
        worldWidth: 2400,
        worldHeight: 1600,
        initialAgents: 40,
        maxAgents: 80,
        minAgents: 20,
        maxFood: 60,
        initialFood: 60,
        maturityTicks: 200,
        herdCount: 0,
        refugeCount: 0,
        wallGaps: 1,
        coldMarginWidth: 0,
    }),
);
const ladder = join(root, 'ladder.json');
writeFileSync(
    ladder,
    JSON.stringify([
        {
            name: 'arms',
            config: world,
            minGenerations: 1,
            maxGenerations: 3,
            gate: [{ read: 'crossplay.cycleShare', max: 1 }],
        },
        { name: 'world', config: null },
    ]),
);

describe('a gated stage that reads cross-play', () => {
    it('computes the crossplay readings at its gate checkpoints and puts them on the curve', async () => {
        const out = join(root, 'run');
        const args = parseArgs([
            ...['--generations', '3', '--curriculum', ladder, '--checkpoint-every', '1', '--workers', '2'],
            ...['--episodes', '3', '--ticks', '2500', '--offer-from', '500', '--out', out],
        ]);
        await runTraining(args, { drillTrials: 2, gateTrials: 2, crossTrials: 2 }).catch((/** @type {any} */ error) => {
            expect(error.exitCode).toBe(3);
        });
        const rows = readFileSync(join(out, 'curve.jsonl'), 'utf8')
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line));
        expect(rows.length).toBeGreaterThanOrEqual(2);
        for (const row of rows) {
            expect(row.gate.conditions[0].read).toBe('crossplay.cycleShare');
        }
        // A reading exists only once two checkpoints have a predator and a forager champion; null before fails the gate.
        const values = rows.map((row) => row.gate.conditions[0].value);
        expect(values[0]).toBeNull();
        for (const value of values.slice(1)) {
            expect(value === null || (value >= 0 && value <= 1)).toBe(true);
        }
    }, 300000);
});
