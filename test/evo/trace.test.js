import { describe, expect, it } from 'vitest';
import { createTrace, finishTrace, observeTrace } from '../../js/evo/trace.js';

const SPECS = { a: {}, b: {}, c: {} };

/**
 * @param {number} tick the world tick
 * @param {number} population the population
 * @returns {Record<string, any>} a world with 3 alive agents in lineages 7, 7, 9 of specs 0, 0, 2 and one dead slot
 */
function world(tick, population) {
    return {
        tick,
        population,
        config: { specialisations: SPECS },
        alive: Uint8Array.from([1, 1, 0, 1]),
        spec: Uint8Array.from([0, 0, 1, 2]),
        lineageId: Uint32Array.from([7, 7, 8, 9]),
    };
}

/**
 * @param {number} mate cumulative mating births
 * @param {number} split cumulative split births
 * @returns {Record<string, any>} an observer
 */
function observer(mate, split) {
    return { births: Float64Array.from([5, mate, split, 0, 0]), deathsByCause: Float64Array.from([4, 3, 2, 1]) };
}

describe('trace', () => {
    it('samples the population at each interval and never at tick 0', () => {
        const trace = createTrace({ ticks: 40, interval: 10 });
        for (let t = 0; t <= 40; t++) {
            observeTrace(trace, world(t, 100 + t), observer(0, 0));
        }
        expect(trace.pop).toEqual([110, 120, 130, 140]);
    });

    it('splits births into equal windows by cause', () => {
        const trace = createTrace({ ticks: 40, interval: 1000, windows: 4 });
        const mate = [10, 20, 30, 50];
        const split = [1, 3, 6, 10];
        for (let t = 1; t <= 40; t++) {
            const w = Math.min(3, Math.floor((t - 1) / 10));
            observeTrace(trace, world(t, 1), observer(mate[w], split[w]));
        }
        const record = finishTrace(trace, world(40, 3), observer(50, 10));
        expect(record.mate).toEqual([10, 10, 10, 20]);
        expect(record.split).toEqual([1, 2, 3, 4]);
    });

    it('reports the end state: specialisations, deaths by cause and distinct lineages', () => {
        const trace = createTrace({ ticks: 4 });
        expect(finishTrace(trace, world(4, 3), observer(0, 0))).toMatchObject({
            spec: [2, 0, 1],
            deaths: [4, 3, 2, 1],
            lineages: 2,
            interval: 1000,
        });
    });
});
