import { describe, expect, it } from 'vitest';
import { examRow, notRun } from '../js/evo/exam.js';
import { formatRows, parseArgs } from '../scripts/train-exam.mjs';

describe('parseArgs', () => {
    it('reads the run, the replicates, the trials and the workers', () => {
        expect(parseArgs(['--run', 'a', '--replicates', 'b,c', '--trials', '8', '--workers', '2'])).toEqual({
            run: 'a',
            replicates: ['b', 'c'],
            trials: 8,
            workers: 2,
        });
    });

    it('defaults to no replicates and the gate trials', () => {
        expect(parseArgs(['--run', 'a'])).toEqual({ run: 'a', replicates: [], trials: 64, workers: undefined });
    });

    it('needs --run and refuses an unknown flag or a bad count', () => {
        expect(() => parseArgs([])).toThrow(/--run is required/);
        expect(() => parseArgs(['--run', 'a', '--bogus'])).toThrow(/usage: train:exam/);
        expect(() => parseArgs(['--run', 'a', '--trials', '0'])).toThrow(/--trials must be an integer/);
    });
});

describe('formatRows', () => {
    it('prints a line per row with the verdict, the reason and the command', () => {
        const lines = formatRows([
            examRow(1, 'pass'),
            examRow(3, 'fail', { reason: 'no edge on food-ahead' }),
            notRun(4, 'no crossplay.json', 'npm run train:crossplay -- d'),
        ]);
        expect(lines[0]).toMatch(/^ 1 {2}Valid\s+pass\s*$/);
        expect(lines[1]).toMatch(/^ 3 {2}Drill\s+fail\s+ - no edge on food-ahead$/);
        expect(lines[2]).toMatch(
            /^ 4 {2}Cross-play\s+not run\s+ - no crossplay.json \(npm run train:crossplay -- d\)$/,
        );
    });
});
