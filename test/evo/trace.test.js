import { describe, expect, it } from 'vitest';
import { createTrace, finishTrace, observeTrace } from '../../js/evo/trace.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { createGuardScene, sampleGuards, summerMetrics } from '../../js/evo/scene-guards.js';

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
        huntBySpec: Float64Array.from([0, 0, 1]),
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

/**
 * @param {number} tick the world tick
 * @param {number} prey prey alive (specialisation 0)
 * @param {number} hunters hunters alive (specialisation 1)
 * @returns {Record<string, any>} a world with that many alive agents of each, in 400 slots, and one dead hunter slot
 */
function kindsWorld(tick, prey, hunters) {
    const spec = new Uint8Array(400);
    const alive = new Uint8Array(400);
    alive.fill(1, 0, prey + hunters);
    spec.fill(1, prey, 400);
    return {
        tick,
        population: prey + hunters,
        alive,
        spec,
        huntBySpec: Float64Array.from([0, 1]),
        config: { specialisations: { a: {}, b: {} } },
    };
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

    it('samples prey and hunters with the population, counting only alive agents', () => {
        const trace = createTrace({ ticks: 40, interval: 10 });
        observeTrace(trace, kindsWorld(10, 30, 4), observer(0, 0));
        observeTrace(trace, kindsWorld(15, 99, 99), observer(0, 0));
        observeTrace(trace, kindsWorld(20, 12, 0), observer(0, 0));
        const record = finishTrace(trace, world(20, 12), observer(0, 0));
        expect(record.prey).toEqual([30, 12]);
        expect(record.hunters).toEqual([4, 0]);
        expect(record.pop).toEqual([34, 12]);
    });

    it('gives the lowest post-burn-in summer prey count that eval.prey_summer_min reads', () => {
        const era = 3000;
        const prey = [90, 40, 70, 25, 60, 80, 33, 55, 20, 75, 45, 65, 15, 50, 85, 35, 95, 30, 10, 100];
        const trace = createTrace({ ticks: 20000, interval: 1000 });
        const scene = createGuardScene({ eraSeasonTicks: era, specialisations: { a: {}, b: {} } });
        prey.forEach((count, i) => {
            const tick = (i + 1) * 1000;
            observeTrace(trace, kindsWorld(tick, count, 3), observer(0, 0));
            sampleGuards(scene, kindsWorld(tick, count, 3));
        });
        const summerAfterBurnIn = prey.filter((_, i) => {
            const tick = (i + 1) * 1000;
            return tick >= BURN_IN_TICKS && Math.floor(tick / era) % 4 === 1;
        });
        expect(summerAfterBurnIn.length).toBeGreaterThan(1);
        expect(trace.prey).toEqual(prey);
        expect(summerMetrics(scene)['eval.prey_summer_min']).toEqual({ value: Math.min(...summerAfterBurnIn) });
    });
});
