import { describe, expect, it } from 'vitest';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { ablateUnit, compareTrials, editTrials, mcnemarP } from '../../js/evo/brain-ablation.js';

describe('compareTrials', () => {
    it('reports both shares, paired flips and the exact p value', () => {
        const before = Array.from({ length: 8 }, (_, trial) => ({ won: trial < 6 }));
        const after = Array.from({ length: 8 }, () => ({ won: false }));

        expect(compareTrials(before, after)).toEqual({
            trials: 8,
            beforeWins: 6,
            afterWins: 0,
            beforeWinShare: 0.75,
            afterWinShare: 0,
            change: -0.75,
            beforeOnly: [0, 1, 2, 3, 4, 5],
            afterOnly: [],
            mcnemarP: 0.03125,
        });
    });

    it('returns p=1 when no trial flips and rejects unequal pairs', () => {
        const same = [{ won: true }, { won: false }];
        expect(compareTrials(same, same).mcnemarP).toBe(1);
        expect(mcnemarP(0, 0)).toBe(1);
        expect(mcnemarP(2, 1)).toBe(1);
        expect(() => compareTrials(same, [{ won: true }])).toThrow(/lengths differ/);
        expect(compareTrials([], [])).toMatchObject({ beforeWinShare: 0, afterWinShare: 0, change: 0 });
    });
});

describe('ablateUnit', () => {
    it('runs intact trials when unit is null and returns one result per trial', () => {
        let plans = 0;
        const drill = {
            name: 'paired-test',
            scene: 'Leave a dying patch',
            spec: 0,
            needsHunter: false,
            arena: {},
            plan: () => {
                plans += 1;
                return {
                    stage: {
                        foods: [],
                        rocks: [],
                        agents: [{ role: 'subject', x: 1500, y: 2000, angle: 0, spec: 0, energy: 800 }],
                    },
                    timing: null,
                    scent: false,
                    maxTicks: 1,
                    done: () => true,
                    won: () => true,
                };
            },
        };
        const subject = { name: 'test', id: 1, spec: 0, weights: null, act: () => {} };

        const result = ablateUnit({ subject, drill, unit: null, seed: 5, trials: 3 });

        expect(result).toEqual([
            { trial: 0, ticks: 1, won: true, trace: null },
            { trial: 1, ticks: 1, won: true, trace: null },
            { trial: 2, ticks: 1, won: true, trace: null },
        ]);
        expect(plans).toBe(3);
        expect(() => ablateUnit({ subject, drill, unit: null, seed: 5, trials: 0 })).toThrow(/positive integer/);
    });

    it('uses the configured brain shape when creating a hidden-unit ablation', () => {
        const config = createConfig({ brainHidden: 2 });
        const subject = {
            name: 'test',
            id: 1,
            spec: 0,
            weights: new Float32Array(brainLayout(config).weightCount),
            act: null,
        };
        const drill = {
            name: 'paired-test',
            scene: 'Leave a dying patch',
            spec: 0,
            needsHunter: false,
            arena: { brainHidden: 2 },
            plan: () => ({
                stage: {
                    foods: [],
                    rocks: [],
                    agents: [{ role: 'subject', x: 1500, y: 2000, angle: 0, spec: 0, energy: 800 }],
                },
                timing: null,
                scent: false,
                maxTicks: 1,
                done: () => true,
                won: () => false,
            }),
        };

        expect(ablateUnit({ subject, drill, unit: 1, seed: 5, trials: 1 })).toEqual([
            { trial: 0, ticks: 1, won: false, trace: null },
        ]);
    });
});

describe('editTrials', () => {
    it('replays arbitrary edits on the same plan sequence and reports each trial', () => {
        const config = createConfig({ brainHidden: 2 });
        const subject = {
            name: 'test',
            id: 1,
            spec: 0,
            weights: new Float32Array(brainLayout(config).weightCount),
            act: null,
        };
        let plans = 0;
        const drill = {
            name: 'paired-edit',
            scene: 'Leave a dying patch',
            spec: 0,
            needsHunter: false,
            arena: { brainHidden: 2 },
            plan: () => {
                plans += 1;
                return {
                    stage: {
                        foods: [],
                        rocks: [],
                        agents: [{ role: 'subject', x: 1500, y: 2000, angle: 0, spec: 0, energy: 800 }],
                    },
                    timing: null,
                    scent: false,
                    maxTicks: 1,
                    done: () => true,
                    won: () => true,
                };
            },
        };

        const result = editTrials({
            subject,
            drill,
            edits: [{ op: 'set', block: 'trait', col: 0, value: 0.75 }],
            seed: 8,
            trials: 2,
        });

        expect(result).toMatchObject([
            { trial: 0, ticks: 1, won: true },
            { trial: 1, ticks: 1, won: true },
        ]);
        expect(plans).toBe(2);
        expect(subject.weights.every((value) => value === 0)).toBe(true);
        expect(() =>
            editTrials({
                subject: { ...subject, weights: null },
                drill,
                edits: [{ op: 'set', block: 'trait', col: 0, value: 0.75 }],
                seed: 8,
                trials: 1,
            }),
        ).toThrow(/weight row is required/);
    });
});
