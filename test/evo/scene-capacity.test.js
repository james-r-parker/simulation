// The capacity detectors (carrying-capacity.md T2): cap share, food standing share and the two within-season density
// slopes, against hand-built checkpoints, and the slope fit against a naive reference.

import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE } from '../../js/sim/events.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import {
    MIN_SEASON_WINDOWS,
    capacityMetrics,
    createCapacityScene,
    noteCapacityDeath,
    olsSlope,
    sampleCapacity,
    withinSeasonSlope,
} from '../../js/evo/scene-capacity.js';
import { directionOf, intendedOf, namesOf } from './helpers/metric-registry.js';

const CONFIG = { maxAgents: 500, splitCapMargin: 50, maxFood: 10 };
const T = Math.ceil(BURN_IN_TICKS / 1000) * 1000;
const SLOTS = 8;

/**
 * @param {{tick: number, pop?: number, season?: number, food?: number[], tox?: number[], eaten?: number[]}} spec the tick,
 *   the alive count, the season, the food slots alive (1) or not (0), their toxicity, and the `foodEnergy` of the first
 *   alive agents
 * @returns {Record<string, any>} a hand-built world
 */
function world({ tick, pop = 1, season = 0, food = [], tox = [], eaten = [] }) {
    const w = {
        tick,
        population: pop,
        season: new Float64Array([season, 0]),
        alive: new Uint8Array(SLOTS),
        foodEnergy: new Float64Array(SLOTS),
        foodAlive: Uint8Array.from(food),
        foodTox: Float32Array.from(food.map((_, i) => tox[i] ?? 0)),
    };
    eaten.forEach((energy, slot) => {
        w.alive[slot] = 1;
        w.foodEnergy[slot] = energy;
    });
    return w;
}

/**
 * Feeds one checkpoint per row: the deaths since the last one (starved, and a death of old age that took `intake` energy
 * over its life), then the checkpoint at tick `T + 1000 * row`.
 * @param {{pop: number, season?: number, starved?: number, intake?: number}[]} rows the population at the checkpoint, its
 *   season, and the starvation deaths and food energy taken in the window that ends at it
 * @returns {Record<string, any>} the scene
 */
function run(rows) {
    const scene = createCapacityScene(CONFIG);
    rows.forEach(({ pop, season = 0, starved = 0, intake = 0 }, row) => {
        for (let i = 0; i < starved; i++) {
            noteCapacityDeath(scene, { cause: DEATH_CAUSE.STARVED, foodEnergy: 0 });
        }
        noteCapacityDeath(scene, { cause: DEATH_CAUSE.OLD_AGE, foodEnergy: intake });
        sampleCapacity(scene, world({ tick: T + 1000 * row, pop, season }));
    });
    return scene;
}

/**
 * Windows with a per-agent starvation rate of `0.001 * x + season` (deaths `x * x / 1000 + season * x`) and intake `3 x - 0.002
 * x ** 2` in the window that starts at population `x` in `season`: inside a season the slopes are exactly 0.001 and -0.002,
 * and the seasons differ only by the starvation intercept.
 * @param {{pop: number, season: number}[]} points the population and the season at each checkpoint
 * @returns {{pop: number, season: number, starved: number, intake: number}[]} the rows
 */
function lawSeries(points) {
    return points.map(({ pop, season }, row) => {
        const { pop: x, season: s } = points[row - 1] ?? { pop: 0, season: 0 };
        return { pop, season, starved: (x * x) / 1000 + s * x, intake: 3 * x - 0.002 * x * x };
    });
}

/**
 * @param {number[]} pops the population at each checkpoint
 * @param {number} season the season of every row
 * @returns {{pop: number, season: number, starved: number, intake: number}[]} the rows of `lawSeries`
 */
const lawRows = (pops, season) => lawSeries(pops.map((pop) => ({ pop, season })));

/** @param {number} seed a seed @returns {() => number} a seeded generator of floats in [0, 1) */
function lcg(seed) {
    let state = seed;
    return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
}

/**
 * The naive reference: the normal equations of a line fit, by Cramer's rule on the raw sums.
 * @param {number[]} x the regressor
 * @param {number[]} y the response
 * @returns {number} the slope
 */
function cramer(x, y) {
    const n = x.length;
    const sx = x.reduce((a, b) => a + b, 0);
    const sy = y.reduce((a, b) => a + b, 0);
    const sxy = x.reduce((a, b, i) => a + b * y[i], 0);
    const sxx = x.reduce((a, b) => a + b * b, 0);
    return (n * sxy - sx * sy) / (n * sxx - sx * sx);
}

/**
 * The naive reference elasticity: the normal-equations slope times mean x over mean y.
 * @param {number[]} x the regressor
 * @param {number[]} y the response
 * @returns {number} the elasticity at the means
 */
const elasticity = (x, y) =>
    (cramer(x, y) * (x.reduce((a, b) => a + b, 0) / x.length)) / (y.reduce((a, b) => a + b, 0) / y.length);

describe('eval.cap_share', () => {
    it('is the share of checkpoints at maxAgents less splitCapMargin or more', () => {
        const scene = run([{ pop: 449 }, { pop: 450 }, { pop: 500 }, { pop: 300 }]);
        expect(capacityMetrics(scene)['eval.cap_share']).toEqual({ value: 0.5 });
    });

    it('samples nothing before burn-in or off the 1000-tick grid, and reads null with a reason', () => {
        const scene = createCapacityScene(CONFIG);
        sampleCapacity(scene, world({ tick: BURN_IN_TICKS - 1000, pop: 500 }));
        sampleCapacity(scene, world({ tick: T + 500, pop: 500 }));
        const m = capacityMetrics(scene);
        expect(scene.rows).toBe(0);
        for (const name of namesOf('js/evo/scene-capacity.js')) {
            expect(m[/** @type {keyof typeof m} */ (name)]).toEqual({
                value: null,
                reason: 'no 1000-tick checkpoint after burn-in',
            });
        }
    });

    it('is lower-is-better', () => {
        expect(directionOf('eval.cap_share')).toBe('lower');
    });
});

describe('eval.food_standing_share', () => {
    it('is the mean over checkpoints of the alive, non-toxic food slots over maxFood', () => {
        const scene = createCapacityScene(CONFIG);
        // 10 slots: 6 alive of which 2 toxic (4 edible), then 10 alive and edible.
        sampleCapacity(
            scene,
            world({ tick: T, food: [1, 1, 1, 1, 1, 1, 0, 0, 0, 0], tox: [0, 0, 0, 0, 0.5, 1, 0, 0, 0, 0] }),
        );
        sampleCapacity(scene, world({ tick: T + 1000, food: Array.from({ length: 10 }, () => 1) }));
        expect(capacityMetrics(scene)['eval.food_standing_share']).toEqual({ value: 0.7 });
    });

    it('is a watch metric whose intended direction is lower', () => {
        expect(directionOf('eval.food_standing_share')).toBe('watch');
        expect(intendedOf('eval.food_standing_share')).toBe('lower');
    });
});

describe('the density slopes', () => {
    const pops = [100, 200, 300, 400, 500, 600, 700];

    it('read the elasticity at the season means of the per-agent rate on the population at the window start', () => {
        const m = capacityMetrics(run(lawRows(pops, 0)));
        // Windows start at 100..600 (mean 350): starvation x / 1000 is proportional to x, so the elasticity is 1; intake
        // 3 - 0.002 x has mean 2.3 and slope -0.002.
        expect(m['eval.density_starve_slope']?.value).toBeCloseTo(1, 12);
        expect(m['eval.density_intake_slope']?.value).toBeCloseTo((-0.002 * 350) / 2.3, 12);
        expect(directionOf('eval.density_starve_slope')).toBe('higher');
        expect(directionOf('eval.density_intake_slope')).toBe('lower');
    });

    it('count the energy of the living agents too, not only of the dead', () => {
        const scene = createCapacityScene(CONFIG);
        // One living agent whose lifetime intake grows by 10 each window; the population is 10, 20, ... so x varies.
        for (let row = 0; row < 7; row++) {
            sampleCapacity(scene, world({ tick: T + 1000 * row, pop: 10 * (row + 1), eaten: [10 * row] }));
        }
        // Window j: intake 10 over a start population of 10 j + 10, a rate of 1 / (j + 1): decreasing in x.
        const rate = (/** @type {number} */ j) => 10 / (10 * (j + 1));
        const xs = [10, 20, 30, 40, 50, 60];
        expect(capacityMetrics(scene)['eval.density_intake_slope']?.value).toBeCloseTo(
            elasticity(
                xs,
                xs.map((_, j) => rate(j)),
            ),
            12,
        );
    });

    it('read 0 on a flat series', () => {
        const flat = pops.map((pop, row) => ({ pop, starved: row === 0 ? 0 : (pops[row - 1] * 2) / 10, intake: 0 }));
        expect(capacityMetrics(run(flat))['eval.density_starve_slope']?.value).toBeCloseTo(0, 12);
    });

    it('fit inside each season, so the season does not tilt the slope', () => {
        // Season 0 holds 100 to 600 agents, season 1 holds 1000 to 1600 with 1 more starvation per agent per window.
        const points = [100, 200, 300, 400, 500, 600].map((pop) => ({ pop, season: 0 }));
        points.push(...[1000, 1100, 1200, 1300, 1400, 1500, 1600].map((pop) => ({ pop, season: 1 })));
        const rows = lawSeries(points);
        const m = capacityMetrics(run(rows));
        // Season 0: starvation elasticity 1, intake -0.002 * 350 / 2.3. Season 1 (windows start at 1000..1500, mean 1250):
        // starvation 0.001 x + 1 has mean 2.25, intake 3 - 0.002 x has mean 0.5.
        expect(m['eval.density_starve_slope']?.value).toBeCloseTo((1 + 1.25 / 2.25) / 2, 12);
        expect(m['eval.density_intake_slope']?.value).toBeCloseTo((-0.7 / 2.3 + -2.5 / 0.5) / 2, 12);
        const windows = rows.slice(1).map((r, i) => ({ x: rows[i].pop, y: r.starved / rows[i].pop }));
        const pooled = cramer(
            windows.map((w) => w.x),
            windows.map((w) => w.y),
        );
        expect(pooled).toBeGreaterThan(0.0015);
    });

    it('average the per-season elasticities, ignore a season with too few windows or a mean rate of 0', () => {
        expect(MIN_SEASON_WINDOWS).toBe(5);
        const full = { x: [1, 2, 3, 4, 5], y: [2, 4, 6, 8, 10], season: [0, 0, 0, 0, 0] };
        expect(withinSeasonSlope(full)).toBe(1);
        // Season 3: slope 1, mean x 3, mean y 4: 0.75.
        const two = {
            x: [...full.x, 1, 2, 3, 4, 5],
            y: [...full.y, 2, 3, 4, 5, 6],
            season: [...full.season, 3, 3, 3, 3, 3],
        };
        expect(withinSeasonSlope(two)).toBe(0.875);
        const short = { x: [...full.x, 1, 2, 3, 4], y: [...full.y, 9, 9, 9, 9], season: [...full.season, 1, 1, 1, 1] };
        expect(withinSeasonSlope(short)).toBe(1);
        const zero = {
            x: [...full.x, 1, 2, 3, 4, 5],
            y: [...full.y, 0, 0, 0, 0, 0],
            season: [...full.season, 2, 2, 2, 2, 2],
        };
        expect(withinSeasonSlope(zero)).toBe(1);
        expect(withinSeasonSlope({ x: full.x, y: [0, 0, 0, 0, 0], season: full.season })).toBeNull();
    });

    it('are null with a reason when no season has the windows or the population never varies', () => {
        const few = capacityMetrics(run(lawRows([100, 200, 300, 400, 500], 0)));
        expect(few['eval.density_starve_slope']).toEqual({
            value: null,
            reason: 'no season with 5 spans of varying population and a mean rate above 0 after burn-in',
        });
        const still = capacityMetrics(run(lawRows([100, 100, 100, 100, 100, 100, 100], 0)));
        expect(still['eval.density_intake_slope']?.value).toBeNull();
        expect(still['eval.cap_share']).toEqual({ value: 0 });
    });

    it('leave out a window that starts with nobody alive', () => {
        const x = [100, 200, 300, 400, 500, 600];
        const rows = [{ pop: 0 }, ...x.map((pop, i) => ({ pop, starved: i === 0 ? 0 : 0.2 * x[i - 1] }))];
        // The first window (start pop 0) is dropped; six remain at a rate of 0.2: elasticity 0, not a division by 0.
        expect(capacityMetrics(run(rows))['eval.density_starve_slope']?.value).toBeCloseTo(0, 12);
    });

    it('are null when the season has no starvation at all, whatever the population does', () => {
        const rows = lawRows(pops, 0).map((r) => ({ ...r, starved: 0 }));
        expect(capacityMetrics(run(rows))['eval.density_starve_slope']).toEqual({
            value: null,
            reason: 'no season with 5 spans of varying population and a mean rate above 0 after burn-in',
        });
    });
});

describe('olsSlope against the naive reference', () => {
    it('matches the normal equations on random data', () => {
        const next = lcg(7);
        for (let trial = 0; trial < 50; trial++) {
            const n = 2 + Math.floor(next() * 30);
            const x = Array.from({ length: n }, () => 10 + Math.floor(next() * 490));
            const y = Array.from({ length: n }, () => next());
            if (new Set(x).size > 1) {
                expect(olsSlope(x, y)).toBeCloseTo(cramer(x, y), 10);
            }
        }
    });

    it('is null for fewer than two points and for a regressor with no spread', () => {
        expect(olsSlope([], [])).toBeNull();
        expect(olsSlope([3], [4])).toBeNull();
        expect(olsSlope([3, 3, 3], [1, 2, 3])).toBeNull();
        expect(olsSlope([1, 2], [1, 3])).toBe(2);
    });
});

describe('the death totals', () => {
    it('count only starvation as starved, and every death lifetime intake as intake', () => {
        const scene = createCapacityScene(CONFIG);
        noteCapacityDeath(scene, { cause: DEATH_CAUSE.STARVED, foodEnergy: 5 });
        noteCapacityDeath(scene, { cause: DEATH_CAUSE.EATEN, foodEnergy: 7 });
        expect(scene).toMatchObject({ starved: 1, intakeDead: 12, capAt: 450, maxFood: 10 });
    });
});
