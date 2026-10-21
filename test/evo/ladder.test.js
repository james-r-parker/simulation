import { describe, expect, it } from 'vitest';
import { assertArm } from '../../js/evo/controller-brain.js';
import { LADDER_RUNGS, ladderSummary } from '../../js/evo/ladder.js';

describe('LADDER_RUNGS', () => {
    it('names only known controllers, and every rung once', () => {
        for (const { arms } of LADDER_RUNGS) {
            for (const arm of typeof arms === 'string' ? [arms] : [arms.canHunt, arms.rest]) {
                expect(() => assertArm(arm)).not.toThrow();
            }
        }
        expect(new Set(LADDER_RUNGS.map((rung) => rung.name)).size).toBe(LADDER_RUNGS.length);
    });

    it('runs the forage ladder random to fleer and three combat rungs', () => {
        const forage = LADDER_RUNGS.filter((rung) => rung.ladder === 'forage').map((rung) => rung.name);
        expect(forage).toEqual(['random', 'wanderer', 'sloppyForager', 'foodSeeker', 'fleer']);
        expect(LADDER_RUNGS.filter((rung) => rung.ladder === 'combat')).toHaveLength(3);
    });
});

describe('ladderSummary', () => {
    const config = { maxAgents: 100 };

    it('averages the seeds and gives the ratio to the rung below', () => {
        const summary = ladderSummary(
            [
                { rung: 'random', population: 10 },
                { rung: 'random', population: 20 },
                { rung: 'wanderer', population: 30 },
                { rung: 'wanderer', population: 30 },
            ],
            config,
        );
        expect(summary.map((row) => [row.rung, row.meanPopulation, row.ratioToPrevious])).toEqual([
            ['random', 15, null],
            ['wanderer', 30, 2],
        ]);
    });

    it('flags a rung at 0.9 x maxAgents as saturated and a rung below it as not', () => {
        const summary = ladderSummary(
            [
                { rung: 'foodSeeker', population: 90 },
                { rung: 'fleer', population: 89 },
            ],
            config,
        );
        expect(summary.map((row) => row.saturated)).toEqual([true, false]);
    });

    it('gives no ratio across ladders or over an empty rung, and skips rungs without results', () => {
        const summary = ladderSummary(
            [
                { rung: 'fleer', population: 40 },
                { rung: 'jawSitter-vs-foodSeeker', population: 0 },
                { rung: 'hunter-vs-foodSeeker', population: 5 },
            ],
            config,
        );
        expect(summary.map((row) => row.ratioToPrevious)).toEqual([null, null, null]);
        expect(summary).toHaveLength(3);
    });

    it('rejects a rung it does not know', () => {
        expect(() => ladderSummary([{ rung: 'nope', population: 1 }], config)).toThrow(/unknown rung "nope"/);
    });
});
