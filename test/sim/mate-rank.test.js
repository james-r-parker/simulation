import v8 from 'node:v8';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
    MATE_RANK_INTERVAL,
    RANK_MIN_MEALS,
    fillScores,
    percentileInto,
    refreshMateRanks,
} from '../../js/sim/mate-rank.js';
import { creditMatured } from '../../js/sim/merit.js';
import { mate } from '../../js/sim/reproduction.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';
import { freeAgent } from '../../js/sim/world.js';
import { addBlob, lifeWorld, recordingPolicy } from './helpers/life-world.js';

const PREDATOR = 1;

/**
 * @param {any} w the world
 * @param {number} slot an alive slot
 * @param {string} mode the score mode
 * @returns {number} the slot's score under the mode, from the header's definition
 */
function scoreOf(w, slot, mode) {
    const scores = new Float64Array(w.alive.length);
    fillScores(w, scores, mode);
    return scores[slot];
}

/**
 * The score written out from the header, without `fillScores`.
 * @param {any} w the world
 * @param {number} slot an alive slot
 * @param {string} mode the score mode
 * @returns {number} the score
 */
function naiveScore(w, slot, mode) {
    if (mode === 'offspring') {
        return w.maturedKids[slot];
    }
    if (w.config.specialisations.predator.index === w.spec[slot]) {
        return w.deliberateKills[slot];
    }
    return w.mealsTotal[slot] < 5 ? 0 : (w.mealsDeliberate[slot] + 1) / (w.mealsTotal[slot] + 2);
}

/**
 * The percentile of every alive slot by sorting each specialisation's scores: members scoring lower plus half of the
 * other ties, over members - 1.
 * @param {any} w the world
 * @param {string} mode the score mode
 * @returns {Map<number, number>} the percentile by slot
 */
function naivePercentiles(w, mode) {
    /** @type {Map<number, number[]>} */
    const bySpec = new Map();
    for (let s = 0; s < w.alive.length; s++) {
        if (w.alive[s] === 1) {
            bySpec.set(w.spec[s], [...(bySpec.get(w.spec[s]) ?? []), naiveScore(w, s, mode)]);
        }
    }
    const out = new Map();
    for (let s = 0; s < w.alive.length; s++) {
        if (w.alive[s] === 1) {
            const sorted = /** @type {number[]} */ (bySpec.get(w.spec[s])).toSorted((a, b) => a - b);
            const own = naiveScore(w, s, mode);
            const lower = sorted.filter((v) => v < own).length;
            const equal = sorted.filter((v) => v === own).length - 1;
            out.set(s, sorted.length === 1 ? 0.5 : (lower + equal / 2) / (sorted.length - 1));
        }
    }
    return out;
}

describe('scoreOf', () => {
    it('ranks a hunter by its deliberate kills', () => {
        const w = lifeWorld({ maxAgents: 8 });
        const hunter = addBlob(w, { spec: PREDATOR, deliberateKills: 3, mealsTotal: 99, mealsDeliberate: 99 });
        expect(scoreOf(w, hunter, 'rank')).toBe(3);
    });

    it('ranks a grazer by its smoothed deliberate meal share, 0 under five meals', () => {
        const w = lifeWorld({ maxAgents: 8 });
        const few = addBlob(w, { mealsTotal: RANK_MIN_MEALS - 1, mealsDeliberate: RANK_MIN_MEALS - 1 });
        const some = addBlob(w, { mealsTotal: 10, mealsDeliberate: 4 });
        expect(scoreOf(w, few, 'rank')).toBe(0);
        expect(scoreOf(w, some, 'rank')).toBe(5 / 12);
    });

    it('ranks by matured children under offspring, whatever the specialisation', () => {
        const w = lifeWorld({ maxAgents: 8 });
        const hunter = addBlob(w, { spec: PREDATOR, maturedKids: 2, deliberateKills: 9 });
        expect(scoreOf(w, hunter, 'offspring')).toBe(2);
    });

    it('counts a child that matures once for each living parent', () => {
        const w = lifeWorld({ maxAgents: 8 });
        const mother = addBlob(w);
        const father = addBlob(w);
        const child = addBlob(w);
        w.parentA[child] = w.genomeId[mother];
        w.parentB[child] = w.genomeId[father];
        w.parentSlotA[child] = mother;
        w.parentSlotB[child] = father;
        creditMatured(w, child);
        expect([w.maturedKids[mother], w.maturedKids[father], w.maturedKids[child]]).toEqual([1, 1, 0]);
    });
});

describe('the percentile', () => {
    it('is 0.5 for a lone member and splits a pair at the ends, or at half when they tie', () => {
        const w = lifeWorld({ maxAgents: 8 });
        const lone = addBlob(w, { spec: 3 });
        const a = addBlob(w, { spec: 2, mealsTotal: 10, mealsDeliberate: 9 });
        const b = addBlob(w, { spec: 2, mealsTotal: 10, mealsDeliberate: 1 });
        refreshMateRanks(w);
        expect(w.mateRank[lone]).toBe(0.5);
        expect([w.mateRank[a], w.mateRank[b]]).toEqual([1, 0]);
        w.mealsDeliberate[b] = 9;
        refreshMateRanks(w);
        expect([w.mateRank[a], w.mateRank[b]]).toEqual([0.5, 0.5]);
    });

    it.each(['rank', 'offspring'])('agrees with a sort-based percentile on random worlds under %s', (mode) => {
        for (let seed = 1; seed <= 30; seed++) {
            const rng = createRng(seed);
            const w = lifeWorld({ maxAgents: 40, mateRank: mode });
            const count = 1 + Math.floor(nextFloat(rng) * 39);
            for (let i = 0; i < count; i++) {
                addBlob(w, {
                    spec: Math.floor(nextFloat(rng) * 5),
                    deliberateKills: Math.floor(nextFloat(rng) * 3),
                    maturedKids: Math.floor(nextFloat(rng) * 3),
                    mealsTotal: Math.floor(nextFloat(rng) * 12),
                    mealsDeliberate: Math.floor(nextFloat(rng) * 4),
                });
            }
            refreshMateRanks(w);
            for (const [slot, expected] of naivePercentiles(w, mode)) {
                expect(w.mateRank[slot], `seed ${seed} slot ${slot}`).toBeCloseTo(expected, 6);
            }
        }
    });

    it('reads the same from the scores the observer fills', () => {
        const w = lifeWorld({ maxAgents: 8 });
        const [a, b, c] = [3, 9, 6].map((k) => addBlob(w, { spec: 2, mealsTotal: 10, mealsDeliberate: k }));
        const scores = new Float64Array(8);
        const out = new Float64Array(8);
        fillScores(w, scores, 'rank');
        refreshMateRanks(w);
        for (const slot of [a, b, c]) {
            percentileInto(w, scores, { slot, out });
            expect(out[slot]).toBe(w.mateRank[slot]);
        }
    });

    it('ranks a slot born since the last pass, and a freed slot, at 0', () => {
        const w = lifeWorld({ maxAgents: 8 });
        const old = addBlob(w, { mealsTotal: 10, mealsDeliberate: 9 });
        const other = addBlob(w, { mealsTotal: 10, mealsDeliberate: 1 });
        refreshMateRanks(w);
        expect(w.mateRank[old]).toBe(1);
        const born = addBlob(w);
        expect(w.mateRank[born]).toBe(0);
        freeAgent(w, old);
        expect(w.mateRank[old]).toBe(0);
        refreshMateRanks(w);
        expect([w.mateRank[other], w.mateRank[born]]).toEqual([1, 0]);
    });
});

describe('the pass', () => {
    it('runs from the reproduction phase on a tick that is a multiple of the interval, and not between', () => {
        const w = lifeWorld({ maxAgents: 8 });
        const slot = addBlob(w, { mealsTotal: 10, mealsDeliberate: 9 });
        addBlob(w, { mealsTotal: 10, mealsDeliberate: 1 });
        w.tick = MATE_RANK_INTERVAL - 1;
        mate(w, recordingPolicy([]));
        expect(w.mateRank[slot]).toBe(0);
        w.tick = MATE_RANK_INTERVAL;
        mate(w, recordingPolicy([]));
        expect(w.mateRank[slot]).toBe(1);
    });

    it('allocates nothing', () => {
        // Collect before each window and keep the smallest growth of several (an allocation per pass shows in every one).
        v8.setFlagsFromString('--expose-gc');
        const gc = vm.runInNewContext('gc');
        const w = lifeWorld({ maxAgents: 64 });
        for (let i = 0; i < 60; i++) {
            addBlob(w, { spec: i % 3, mealsTotal: 10, mealsDeliberate: i % 7 });
        }
        const passes = 300;
        const run = () => {
            for (let i = 0; i < passes; i++) {
                refreshMateRanks(w);
            }
        };
        for (let warm = 0; warm < 5; warm++) {
            run();
        }
        let best = Infinity;
        for (let window = 0; window < 10; window++) {
            gc();
            const before = process.memoryUsage().heapUsed;
            run();
            best = Math.min(best, process.memoryUsage().heapUsed - before);
        }
        expect(best).toBeLessThan(passes * 4);
    });
});
