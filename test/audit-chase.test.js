import { describe, expect, it } from 'vitest';
import { parseArgs } from '../scripts/audit-chase.mjs';
import { formatBodies, formatPair } from '../scripts/lib/chase-report.mjs';
import { BEARINGS, DISTANCE_SHARES } from '../js/evo/chase-envelope.js';

describe('parseArgs', () => {
    it('defaults to every pair, 4 trials, seed 1, both sprinting and the evader breaking', () => {
        expect(parseArgs([])).toMatchObject({
            pairs: undefined,
            trials: 4,
            seed: 1,
            noSprint: false,
            straight: false,
            json: false,
            out: null,
        });
    });

    it('reads every flag', () => {
        expect(
            parseArgs([
                '--pairs',
                'predator:forager,predator:scout',
                '--trials',
                '2',
                '--seed',
                '3',
                '--no-sprint',
                '--straight',
                '--json',
            ]),
        ).toMatchObject({
            pairs: [
                ['predator', 'forager'],
                ['predator', 'scout'],
            ],
            trials: 2,
            seed: 3,
            noSprint: true,
            straight: true,
            json: true,
        });
    });

    it('refuses a pair that is not hunter:prey and an unknown flag', () => {
        expect(() => parseArgs(['--pairs', 'predator'])).toThrow(/hunter:prey/);
        expect(() => parseArgs(['--bogus'])).toThrow(/unknown argument/);
    });
});

describe('the report', () => {
    it('prints a row per specialisation and a grid with its fair band', () => {
        const body = {
            name: 'forager',
            cruiseSpeed: 8,
            sprintSpeed: 12,
            turnRadius: 21.5,
            sprintTurnRadius: 32.2,
            stopDistance: 152,
            cruiseEnergy: 103,
            sprintEnergy: 228,
        };
        expect(formatBodies([body])).toMatch(/forager\s+8\.0\s+12\.0\s+21\.5\s+32\.2\s+152\s+103\s+228/);
        const cell = { share: 0.5, caught: 2, trials: 4, spent: 10, returned: 20 };
        const text = formatPair({
            pursuer: 'predator',
            evader: 'forager',
            grid: DISTANCE_SHARES.map(() => Array.from({ length: BEARINGS }, () => cell)),
            byDistance: DISTANCE_SHARES.map(() => 0.5),
            band: [0.2, 0.4],
            energy: DISTANCE_SHARES.map(() => ({ spent: 5, returned: 10 })),
        });
        expect(text).toContain('predator chases forager');
        expect(text).toContain('fair band (0.2 to 0.8): 0.2, 0.4');
        expect(text.split('\n')).toHaveLength(2 + DISTANCE_SHARES.length + 1);
    });
});
