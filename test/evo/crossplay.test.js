import { describe, expect, it } from 'vitest';
import {
    CROSS_TRIALS,
    createMatrix,
    crossplayNumbers,
    cycleShare,
    extendMatrix,
    hunterProgress,
    playCell,
    preyProgress,
    preyVsStageLow,
} from '../../js/evo/crossplay.js';
import { COMBAT_CONTROLLERS } from '../../js/evo/scripted-combat.js';
import { createRng, fork } from '../../js/sim/rng.js';

/**
 * @param {number[][]} kills kills[i][j] of 64 trials each
 * @returns {import('../../js/evo/crossplay.js').CrossMatrix} a played matrix
 */
function matrixOf(kills) {
    return { trials: CROSS_TRIALS, kills, packKills: kills.map((row) => row.map(() => null)) };
}

/**
 * @param {'hunter' | 'stand'} kind a scripted predator that closes and bites, or one that stands
 * @param {number} spec the specialisation
 * @returns {import('../../js/evo/memory-probe-run.js').Subject} a reference subject (a controller per world)
 */
function scripted(kind, spec) {
    const made = new WeakMap();
    const act = (/** @type {any} */ world) => {
        if (!made.has(world)) {
            made.set(world, COMBAT_CONTROLLERS.hunter({ world, rng: fork(createRng(9), 'test') }));
        }
        made.get(world)(world);
    };
    return { name: kind, id: 0, spec, weights: null, act: kind === 'stand' ? () => {} : act };
}

describe('hunterProgress', () => {
    it('is positive when the latest predators kill more of the earlier foragers than the first did', () => {
        const progress = hunterProgress(
            matrixOf([
                [0, 0],
                [50, 50],
            ]),
        );
        expect(progress?.progress).toBeCloseTo(50 / 64);
        expect(progress?.low).toBeGreaterThan(0);
    });

    it('has a low bound under 0 when the latest predators do no better', () => {
        expect(
            hunterProgress(
                matrixOf([
                    [30, 30],
                    [30, 30],
                ]),
            )?.low,
        ).toBeLessThan(0);
    });

    it('is null under two checkpoints', () => {
        expect(hunterProgress(matrixOf([[10]]))).toBeNull();
    });
});

describe('preyProgress', () => {
    it('is positive when the latest foragers die less to the earlier predators than the first did', () => {
        const progress = preyProgress(
            matrixOf([
                [60, 5],
                [60, 5],
            ]),
        );
        expect(progress?.progress).toBeCloseTo(55 / 64);
        expect(progress?.low).toBeGreaterThan(0);
    });

    it('is not positive when the latest foragers die as often as the first', () => {
        const same = matrixOf([
            [20, 20],
            [20, 20],
        ]);
        expect(preyProgress(same)?.low).toBeLessThan(0);
    });
});

describe('preyVsStageLow', () => {
    it('is above 0 when the latest foragers survive the stage hunters better than the stage foragers did', () => {
        expect(preyVsStageLow({ kills: 50, trials: 64 }, { kills: 5, trials: 64 })).toBeGreaterThan(0);
        expect(preyVsStageLow({ kills: 30, trials: 64 }, { kills: 30, trials: 64 })).toBeLessThan(0);
    });
});

describe('cycleShare', () => {
    it('is 1 for a hand-built cycle: every newer side does worse against the other role past', () => {
        const cycle = matrixOf([
            [60, 0, 0],
            [10, 60, 0],
            [0, 10, 60],
        ]);
        expect(cycleShare(cycle)).toBe(1);
    });

    it('is 0 for an arms race where each newer side does at least as well', () => {
        const race = matrixOf([
            [20, 10, 5],
            [40, 20, 10],
            [60, 40, 20],
        ]);
        expect(cycleShare(race)).toBe(0);
    });

    it('is null under two checkpoints and counts a prey-side regression too', () => {
        expect(cycleShare(matrixOf([[1]]))).toBeNull();
        // The newer predator does as well, but the newer forager dies far more often to the older predator.
        const preyWorse = matrixOf([
            [10, 50],
            [10, 50],
        ]);
        expect(cycleShare(preyWorse)).toBe(1);
    });
});

describe('crossplayNumbers', () => {
    it('bundles the three numbers the gate reads', () => {
        const numbers = crossplayNumbers(
            matrixOf([
                [0, 0],
                [50, 50],
            ]),
        );
        expect(Object.keys(numbers)).toEqual(['hunterProgressLow', 'preyProgressLow', 'cycleShare']);
        expect(numbers.hunterProgressLow).toBeGreaterThan(0);
    });
});

describe('playCell', () => {
    const forager = scripted('stand', 0);

    it('reads a hunter that closes and bites above one that stands, on the same plans', () => {
        const hunter = playCell(scripted('hunter', 1), forager, { trials: 6 });
        const stander = playCell(scripted('stand', 1), forager, { trials: 6 });
        expect(stander).toBe(0);
        expect(hunter).toBeGreaterThan(0);
        expect(playCell(scripted('hunter', 1), forager, { trials: 6 })).toBe(hunter);
    });

    it('plays the group cell with three sibling clones of the predator', () => {
        const kills = playCell(scripted('hunter', 1), forager, { trials: 3, group: true });
        expect(kills).toBeGreaterThanOrEqual(0);
        expect(kills).toBeLessThanOrEqual(3);
    });
});

describe('extendMatrix', () => {
    const players = [
        { predator: scripted('stand', 1), forager: scripted('stand', 0) },
        { predator: scripted('hunter', 1), forager: scripted('stand', 0) },
    ];

    it('plays the new row and column once, keeps the cells played, and reads a positive hunter progress', () => {
        const matrix = createMatrix(4);
        /** @type {any[]} */
        const cells = [];
        const onCell = (/** @type {any} */ c) => cells.push(c);
        extendMatrix(matrix, players, { index: 0, onCell });
        expect(cells).toHaveLength(1);
        extendMatrix(matrix, players, { index: 1, onCell });
        expect(cells).toHaveLength(4);
        expect(matrix.kills[0][0]).toBe(0);
        expect(matrix.kills[1][0]).toBeGreaterThan(0);
        expect(hunterProgress(matrix)?.progress).toBeGreaterThan(0);
    });

    it('also plays the group cells when asked', () => {
        const matrix = createMatrix(2);
        extendMatrix(matrix, players, { index: 0, group: true });
        expect(matrix.packKills[0][0]).not.toBeNull();
    });
});
