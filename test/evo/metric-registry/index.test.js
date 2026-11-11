// The metric registry's index: the names it holds against the live report's names, and `metricName`.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MIN_SEEDS, metricDirection } from '../../../js/evo/compare.js';
import {
    DEFAULT_MIN_SEEDS,
    METRICS,
    metricName,
    minSeedsFor,
    withLiveness,
    withPower,
} from '../../../js/evo/metric-registry/index.js';

/** @type {string[]} the 300 names of a live eval report, sorted */
const REPORT_NAMES = JSON.parse(readFileSync(new URL('../../fixtures/metric-names.json', import.meta.url), 'utf8'));

describe('METRICS', () => {
    it('is frozen and keyed by exactly the names of the live report', () => {
        expect(Object.isFrozen(METRICS)).toBe(true);
        expect(REPORT_NAMES).toHaveLength(300);
        expect(Object.keys(METRICS).sort()).toEqual(REPORT_NAMES);
    });

    it('puts every metric in one of the seven families', () => {
        const families = new Set(Object.values(METRICS).map((e) => e.family));
        expect([...families].sort()).toEqual([
            'brain',
            'core',
            'hunters',
            'intent',
            'scenes-ecology',
            'scenes-social',
            'world',
        ]);
    });

    it('gives each entry the family and fields the registry requires', () => {
        for (const [name, e] of Object.entries(METRICS)) {
            expect(e.meaning.length, name).toBeGreaterThan(0);
            expect(e.counts.length, name).toBeGreaterThan(0);
            expect(['higher', 'lower', 'watch'], name).toContain(e.direction);
            expect(e.direction === 'watch' ? ['higher', 'lower'] : [undefined], name).toContain(e.intended);
        }
    });
});

describe('metricName', () => {
    it('joins a registered base and suffix', () => {
        expect(metricName('eval', 'median_lifespan')).toBe('eval.median_lifespan');
    });

    it('throws on a name with no entry', () => {
        expect(() => metricName('eval', 'nothing')).toThrow('unknown metric eval.nothing');
    });
});

describe('withLiveness', () => {
    it('applies a generated reading to a fresh frozen entry without mutating its family', () => {
        const original = METRICS['eval.food_energy_per_1k'];
        const family = { 'eval.food_energy_per_1k': original };
        const reading = { nullShare: 0.05, distinct: 3, report: 'evals/power/defaults-floor-on.json' };
        const merged = withLiveness(family, { 'eval.food_energy_per_1k': reading });

        expect(merged['eval.food_energy_per_1k'].liveness).toEqual(reading);
        expect(Object.isFrozen(merged)).toBe(true);
        expect(family['eval.food_energy_per_1k']).toBe(original);
    });
});

describe('withPower', () => {
    it('applies a reading and its seed minimum, and leaves an entry with no reading as it was', () => {
        const read = METRICS['eval.food_energy_per_1k'];
        const bare = METRICS['eval.births_per_1k'];
        const power = {
            fpr16: 0.05,
            fpr32: 0.05,
            fpr64: 0.05,
            mde16: 0.5,
            mde32: 0.5,
            mde64: 0.2,
            referenceMean: 10,
            report: 'r.json',
        };
        const merged = withPower(
            { 'eval.food_energy_per_1k': read, 'eval.births_per_1k': bare },
            { 'eval.food_energy_per_1k': power },
        );
        expect(merged['eval.food_energy_per_1k']).toMatchObject({ power, minSeeds: 64 });
        expect(merged['eval.births_per_1k']).toBe(bare);
        expect(Object.isFrozen(merged)).toBe(true);
    });
});

/**
 * @type {{directions: Record<string, string>, intendedLower: string[], minSeeds: Record<string, number>}} what
 *   `DIRECTIONS` (js/evo/compare.js), `WATCH_INTENDED_LOWER` (scripts/lib/watch-intent.mjs) and `METRIC_MIN_SEEDS`
 *   (js/evo/compare-seeds.js) held when they were deleted for the registry (metric-trust T8)
 */
/** Metrics registered after the snapshot was taken (T25 added the mean beside the renamed median). */
const ADDED_AFTER_T8 = [
    'eval.hunter_kills_per_life_mean',
    'eval.basin_families.east',
    'eval.basin_families.west',
    'eval.basin_family_effective.east',
    'eval.basin_family_effective.west',
    'eval.basin_lineage_effective.east',
    'eval.basin_lineage_effective.west',
    'eval.basin_lineages_alive.east',
    'eval.basin_lineages_alive.west',
    'eval.hunter_zero_kill_carcass_share',
    'eval.hunter_reflex_column_split_share',
    'eval.hunter_reflex_column_split_kill_rate',
    'eval.hunter_reflex_column_same_kill_rate',
    'eval.bite_off_kin_view',
    'eval.bite_off_other_view',
    'eval.bite_on_prey_view',
    'eval.bite_wish_with_kin_in_jaws',
    'eval.bite_wish_with_other_in_jaws',
    'eval.bite_wish_with_prey_in_jaws',
    'eval.cap_share',
    'eval.density_intake_slope',
    'eval.density_starve_slope',
    'eval.food_standing_share',
    'eval.edge_birth_death_ratio',
    'eval.edge_deaths_per_prey',
    'eval.edge_eaten_per_prey',
    'eval.edge_hunters_per_prey',
    'eval.edge_intake_ratio',
    'eval.edge_mate_births_per_prey',
    'eval.edge_ref_eaten_per_prey',
    'eval.edge_ref_mate_births_per_prey',
    'eval.edge_ref_split_births_per_prey',
    'eval.edge_ref_starve_per_prey',
    'eval.edge_split_births_per_prey',
    'eval.edge_starve_per_prey',
];
/** Watch metrics registered after the snapshot whose intended direction is lower. */
const ADDED_INTENDED_LOWER = [
    'eval.food_standing_share',
    'eval.edge_deaths_per_prey',
    'eval.edge_ref_starve_per_prey',
    'eval.edge_ref_eaten_per_prey',
];
const SNAPSHOT = JSON.parse(readFileSync(new URL('../../fixtures/metric-directions.json', import.meta.url), 'utf8'));

describe('the tables the registry replaced', () => {
    it('gives every registered metric the direction DIRECTIONS gave it', () => {
        for (const [name, direction] of Object.entries(SNAPSHOT.directions)) {
            if (Object.hasOwn(METRICS, name)) {
                expect(METRICS[/** @type {keyof typeof METRICS} */ (name)].direction, name).toBe(direction);
            }
        }
    });

    it('gives every registered metric not in DIRECTIONS the fitness prefix direction, higher', () => {
        const unlisted = Object.keys(METRICS).filter(
            (name) => !Object.hasOwn(SNAPSHOT.directions, name) && !ADDED_AFTER_T8.includes(name),
        );
        expect(unlisted).toHaveLength(10);
        for (const name of unlisted) {
            expect(name).toMatch(/^eval\.(mean|p90)_fitness\./);
            expect(METRICS[/** @type {keyof typeof METRICS} */ (name)].direction, name).toBe('higher');
        }
    });

    it('answers metricDirection with the snapshot for every name it listed, and null for an unknown name', () => {
        for (const [name, direction] of Object.entries(SNAPSHOT.directions)) {
            expect(metricDirection(name), name).toBe(direction);
        }
        expect(metricDirection('eval.not_a_metric')).toBeNull();
        expect(metricDirection('toString')).toBeNull();
        expect(metricDirection('bench.step_ms@500')).toBe('lower');
    });

    it('gives a watch metric the intended direction WATCH_INTENDED_LOWER gave it, and none to the rest', () => {
        const lower = new Set(SNAPSHOT.intendedLower);
        for (const [name, e] of Object.entries(METRICS)) {
            if (e.direction === 'watch') {
                expect(e.intended, name).toBe(
                    lower.has(name) || ADDED_INTENDED_LOWER.includes(name) ? 'lower' : 'higher',
                );
            }
        }
        for (const name of lower) {
            expect(METRICS[/** @type {keyof typeof METRICS} */ (name)].direction, name).toBe('watch');
        }
    });
});

describe('minSeedsFor', () => {
    it('gives 32 for the four noisy metrics, as METRIC_MIN_SEEDS did', () => {
        for (const [metric, seeds] of Object.entries(SNAPSHOT.minSeeds)) {
            expect(minSeedsFor(metric)).toBe(seeds);
        }
        expect(
            ['eval.floor_episodes', 'eval.lineages_alive', 'eval.lineage_turnover', 'eval.predator_share_cv'].map(
                minSeedsFor,
            ),
        ).toEqual([32, 32, 32, 32]);
        expect(Object.keys(SNAPSHOT.minSeeds)).toHaveLength(4);
    });

    it('uses measured minima for registered metrics and defaults to 16 for unknown and inherited names', () => {
        expect(DEFAULT_MIN_SEEDS).toBe(16);
        expect(MIN_SEEDS).toBe(DEFAULT_MIN_SEEDS);
        expect(minSeedsFor('eval.diversity')).toBe(16);
        expect(minSeedsFor('eval.qd_score')).toBe(32);
        for (const metric of ['mystery', 'toString', 'constructor']) {
            expect(minSeedsFor(metric)).toBe(16);
        }
    });
});
