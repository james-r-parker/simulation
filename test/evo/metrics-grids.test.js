import { describe, expect, it } from 'vitest';
import { bin, behaviourCoverage, GRID_SAMPLE, sampleDeaths } from '../../js/evo/metrics-grids.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { observed } from './helpers/observer-world.js';
import { addDeath, bareObserver } from './helpers/metrics-observer.js';

/** A mature death with samples. */
const mature = { ageTicks: 100, samples: 1 };

describe('bin', () => {
    it('is min(9, floor(v * 10)), 0 for negatives', () => {
        expect([bin(0), bin(0.099), bin(0.1), bin(0.95), bin(1), bin(7), bin(-1), bin(NaN)]).toEqual([
            0, 0, 1, 9, 9, 9, 0, 0,
        ]);
    });
});

describe('sampleDeaths', () => {
    it('keeps only mature deaths with samples', () => {
        const o = bareObserver();
        addDeath(o, { ageTicks: 19, samples: 1 });
        addDeath(o, { ageTicks: 20, samples: 0 });
        addDeath(o, { ageTicks: 20, samples: 1 });
        expect([...sampleDeaths(o)]).toEqual([2]);
    });

    it('draws 300 distinct rows of many, and all of fewer', () => {
        const o = bareObserver();
        for (let i = 0; i < 500; i++) {
            addDeath(o, mature);
        }
        const rows = sampleDeaths(o);
        expect(rows).toHaveLength(GRID_SAMPLE);
        expect(new Set(rows).size).toBe(GRID_SAMPLE);
        const p = bareObserver();
        for (let i = 0; i < 5; i++) {
            addDeath(p, mature);
        }
        expect([...sampleDeaths(p)].sort()).toEqual([0, 1, 2, 3, 4]);
    });

    it('is deterministic for the same rng state and advances only observer.rng', () => {
        const make = () => {
            const o = bareObserver();
            o.rng = fork(createRng(3), 'eval');
            for (let i = 0; i < 400; i++) {
                addDeath(o, mature);
            }
            return o;
        };
        const [a, b] = [make(), make()];
        expect([...sampleDeaths(a)]).toEqual([...sampleDeaths(b)]);
        expect(a.rng).toEqual(b.rng);
    });

    it('draws nothing without eligible deaths', () => {
        const o = bareObserver();
        const before = JSON.stringify(o.rng);
        sampleDeaths(o);
        expect(JSON.stringify(o.rng)).toBe(before);
    });
});

describe('behaviourCoverage', () => {
    it('is null with a reason when no mature death was sampled', () => {
        const o = bareObserver();
        addDeath(o, { ageTicks: 5, samples: 3 });
        const r = behaviourCoverage(o);
        expect(r.life).toEqual({ value: null, reason: 'no sampled mature death' });
        expect(r.motion.value).toBeNull();
    });

    it('bins the life grid: bite share on x, children per 10000 ticks over 0..5 on y', () => {
        const o = bareObserver();
        addDeath(o, { ageTicks: 1000, samples: 1 }); // share 0 (both 0), 0 children: cell (0,0)
        addDeath(o, { ageTicks: 1000, samples: 1, foodEnergy: 1, biteEnergy: 1, children: 1 }); // (5, 2)
        addDeath(o, { ageTicks: 1000, samples: 1, biteEnergy: 4, children: 100 }); // (9, 9) open-ended
        addDeath(o, { ageTicks: 1000, samples: 1, biteEnergy: 4, children: 100 }); // same cell
        expect(behaviourCoverage(o).life.value).toBe(0.03);
    });

    it('puts a death at age 0 in the bottom row of the life grid', () => {
        const o = observed({ maturityTicks: 0 }).observer;
        addDeath(o, { ageTicks: 0, samples: 1, children: 3 });
        expect(behaviourCoverage(o).life.value).toBe(0.01);
    });

    it('bins the motion grid by mean speed and turn, clamped to 1', () => {
        const o = bareObserver();
        addDeath(o, { ageTicks: 100, samples: 2, speedSum: 1, turnSum: 0 }); // (5, 0)
        addDeath(o, { ageTicks: 100, samples: 2, speedSum: 1.8, turnSum: 3 }); // (9, 9) clamped
        addDeath(o, { ageTicks: 100, samples: 2, speedSum: 1, turnSum: 1 }); // (5, 5)
        expect(behaviourCoverage(o).motion.value).toBe(0.03);
    });
});
