import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';
import { main } from '../scripts/train-feasible.mjs';

const root = mkdtempSync(join(tmpdir(), 'train-feasible-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const gated = (/** @type {string} */ name, /** @type {string} */ read, /** @type {number} */ min) => ({
    name,
    config: 'evals/stages/hunt-mid.json',
    minGenerations: 1,
    maxGenerations: 2,
    gate: [{ read, min }],
});

describe('npm run train:feasible', () => {
    it(
        'calls a food-ahead stage learnable and a stage with an unreachable bar not, with the fair band of the bite drill',
        async () => {
            const ladder = join(root, 'ladder.json');
            writeFileSync(
                ladder,
                JSON.stringify([
                    gated('easy', 'drill.food-ahead.winShareLow', 0.05),
                    { name: 'plain', config: null, generations: 2 },
                    {
                        ...gated('impossible', 'drill.prey-adrift.winShareLow', 1.5),
                        gate: [
                            { read: 'drill.prey-adrift.winShareLow', min: 1.5 },
                            { read: 'retention.all', min: 1 },
                        ],
                    },
                ]),
            );
            const out = join(root, 'feasible.json');
            /** @type {string[]} */
            const printed = [];
            const code = await main(
                [
                    ...['--curriculum', ladder, '--generations', '3', '--seeds', '4', '--population', '8'],
                    ...['--trials', '1', '--workers', '2', '--out', out, '--log-dir', root],
                ],
                (line) => printed.push(line),
            );
            expect(code).toBe(0);
            expect(printed).toHaveLength(2);
            expect(printed[0]).toMatch(/^easy: learnable - food-ahead [2-4]\/4 at bar 0\.05/);
            expect(printed[1]).toMatch(
                /^impossible: UNLEARNABLE - prey-adrift 0\/4 at bar 1\.50 .*fair-band predator:\w+; unchecked: retention\.all/,
            );
            const report = JSON.parse(readFileSync(out, 'utf8'));
            expect(report.stages.map((/** @type {any} */ s) => [s.stage, s.learnable])).toEqual([
                ['easy', true],
                ['impossible', false],
            ]);
            expect(report.stages[1].drills[0].fairBand).toHaveProperty('predator');
            const logged = readFileSync(join(root, 'train-feasible-ladder.jsonl'), 'utf8')
                .trim()
                .split('\n')
                .map((l) => JSON.parse(l));
            expect(
                logged.map((l) => [l.event, l.fields?.stage ?? l.stage, l.fields?.learnable ?? l.learnable]),
            ).toEqual([
                ['FeasibleStage', 'easy', true],
                ['FeasibleStage', 'impossible', false],
            ]);
        },
        scaleTimeout(120_000),
    );

    it('stops at --until and refuses an unknown stage', async () => {
        const ladder = join(root, 'ladder2.json');
        writeFileSync(ladder, JSON.stringify([gated('only', 'drill.food-ahead.winShareLow', 0.05)]));
        const code = await main(['--curriculum', ladder, '--until', 'nope', '--log-dir', root], () => {});
        expect(code).toBe(1);
    });
});
