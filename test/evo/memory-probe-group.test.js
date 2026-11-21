import { describe, expect, it } from 'vitest';
import { GROUP_CONTROL, HUNT_TICKS, TRIO, huntScore } from '../../js/evo/memory-probe-group.js';
import { oracleSubject } from '../../js/evo/lesson-oracles.js';

describe('the group-hunt probe', () => {
    it('hunts with three clones for 600 ticks, against a trio that cannot sense its allies and a solo hunter', () => {
        expect(TRIO).toBe(3);
        expect(HUNT_TICKS).toBe(600);
        expect(Object.values(GROUP_CONTROL)).toEqual(['senses', 'kin-blind', 'solo']);
    });
});

describe('huntScore with a hunter that kills', () => {
    const striker = { ...oracleSubject('prey-ahead'), spec: 1 };

    it('scores the share of trials in which the prey died, and reports each trial to the hook', () => {
        /** @type {[number, boolean][]} */
        const seen = [];
        const score = huntScore(GROUP_CONTROL.SOLO, striker, {
            config: {},
            view: 350,
            seed: 1,
            trials: 3,
            onTrial: (trial, won) => seen.push([trial, won]),
        });
        expect(seen.map(([trial]) => trial)).toEqual([0, 1, 2]);
        expect(score).toBe(seen.filter(([, won]) => won).length / 3);
        expect(score).toBeGreaterThan(0);
    });

    it('runs without a hook', () => {
        const score = huntScore(GROUP_CONTROL.SOLO, striker, { config: {}, view: 350, seed: 1, trials: 1 });
        expect(score).toBeGreaterThanOrEqual(0);
    });
});
