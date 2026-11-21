import { describe, expect, it } from 'vitest';
import { createSimLog } from '../js/sim/log.js';
import { brainLayout } from '../js/sim/brain-layout.js';
import { createConfig } from '../js/sim/config.js';
import { reflexScores } from '../scripts/lib/exam-readings.mjs';
import { examRow, notRun } from '../js/evo/exam.js';
import { formatRows, parseArgs } from '../scripts/train-exam.mjs';

describe('parseArgs', () => {
    it('reads the run, the replicates, the trials and the workers', () => {
        expect(parseArgs(['--run', 'a', '--replicates', 'b,c', '--trials', '8', '--workers', '2'])).toMatchObject({
            run: 'a',
            replicates: ['b', 'c'],
            trials: 8,
            workers: 2,
        });
    });

    it('defaults to no replicates and the gate trials', () => {
        expect(parseArgs(['--run', 'a'])).toEqual({
            run: 'a',
            replicates: [],
            worldBefore: null,
            worldAfter: null,
            keepRuleReport: null,
            descendants: null,
            trials: 64,
            workers: undefined,
        });
    });

    it('reads the world reports for row 6 and the descendants directory for row 7', () => {
        const args = parseArgs([
            '--run',
            'a',
            '--world-before',
            'live.json',
            '--world-after',
            'champions.json',
            '--keep-rule-report',
            'keep.json',
            '--descendants',
            'saved',
        ]);
        expect(args).toMatchObject({
            worldBefore: 'live.json',
            worldAfter: 'champions.json',
            keepRuleReport: 'keep.json',
            descendants: 'saved',
        });
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

describe('reflexScores', () => {
    it('gives a champion whose specialisation has no reflex case a null score and edge, not a crash (every real specialisation has one since T22, so this one is out of range)', async () => {
        const weights = new Float32Array(brainLayout(createConfig({})).weightCount);
        const stranger = { name: 'stranger', id: 3, spec: 9, weights, act: null };
        const table = /** @type {any} */ ({ subjects: [stranger] });
        const log = createSimLog(() => {}, { level: 'error' });
        const { genomes } = await reflexScores(table, { workers: 1, trials: 1, log });
        expect(genomes).toEqual([{ name: 'stranger', score: null, edge: null }]);
    });
});
