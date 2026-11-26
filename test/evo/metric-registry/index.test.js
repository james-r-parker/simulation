// The metric registry's index: the names it holds against the live report's names, and `metricName`.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MIN_SEEDS, metricDirection } from '../../../js/evo/compare.js';
import { TRAITS } from '../../../js/sim/body-traits.js';
import {
    DEFAULT_MIN_SEEDS,
    METRICS,
    metricName,
    minSeedsFor,
    withLiveness,
    withPower,
} from '../../../js/evo/metric-registry/index.js';

/** @type {string[]} the names of a live eval report, sorted */
const REPORT_NAMES = JSON.parse(readFileSync(new URL('../../fixtures/metric-names.json', import.meta.url), 'utf8'));

describe('METRICS', () => {
    it('is frozen and keyed by exactly the names of the live report', () => {
        expect(Object.isFrozen(METRICS)).toBe(true);
        expect(REPORT_NAMES).toHaveLength(430);
        expect(Object.keys(METRICS).sort()).toEqual(REPORT_NAMES);
    });

    it('puts every metric in one of the eight families', () => {
        const families = new Set(Object.values(METRICS).map((e) => e.family));
        expect([...families].sort()).toEqual([
            'brain',
            'core',
            'hunters',
            'intent',
            'scenes-ecology',
            'scenes-effects',
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
        const reading = {
            nullShare: 0.05,
            distinct: 3,
            offModeShare: 0.5,
            report: 'evals/power/defaults-floor-on.json',
        };
        const merged = withLiveness(family, { 'eval.food_energy_per_1k': reading });

        expect(merged['eval.food_energy_per_1k'].liveness).toEqual(reading);
        expect(Object.isFrozen(merged)).toBe(true);
        expect(family['eval.food_energy_per_1k']).toBe(original);
    });

    it('leaves an entry with no reading as it was', () => {
        const bare = METRICS['eval.food_energy_per_1k'];
        const merged = withLiveness({ 'eval.food_energy_per_1k': bare }, {});

        expect(merged['eval.food_energy_per_1k']).toBe(bare);
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

    it('reads a signed entry against the absolute bar near 0 and leaves minSeeds null for an entry with unverifiedWhy (metric-noise T30)', () => {
        const power = {
            fpr16: 0.05,
            fpr32: 0.05,
            fpr64: 0.05,
            mde16: 0.5,
            mde32: 0.5,
            mde64: 0.5,
            referenceMean: 0.005,
            report: 'r.json',
        };
        const base = { ...METRICS['eval.food_energy_per_1k'], unit: 'ticks' };
        const merged = withPower(
            {
                plain: base,
                signed: { ...base, signed: true },
                scaled: { ...base, signed: true, unverifiedWhy: 'scale' },
            },
            { plain: power, signed: power, scaled: power },
        );
        expect([merged.plain.minSeeds, merged.signed.minSeeds, merged.scaled.minSeeds]).toEqual([null, 16, null]);
    });
});

/**
 * @type {{directions: Record<string, string>, intendedLower: string[], minSeeds: Record<string, number>}} what
 *   `DIRECTIONS` (js/evo/compare.js), `WATCH_INTENDED_LOWER` (scripts/lib/watch-intent.mjs) and `METRIC_MIN_SEEDS`
 *   (js/evo/compare-seeds.js) held when they were deleted for the registry (metric-trust T8)
 */
/** The body-gene metrics of body-genes.md T9: a spread for each trait of the registry and the edge share. */
const GENE_METRICS = [
    ...TRAITS.map((trait) => `eval.gene_spread.${trait.name}`),
    ...TRAITS.filter((trait) => trait.kind !== 'raw').map((trait) => `eval.gene_sd.${trait.name}`),
    'eval.gene_edge_share',
];
/** Metrics registered after the snapshot was taken (T25 added the mean beside the renamed median). */
const ADDED_AFTER_T8 = [
    'eval.hunter_catches_per_1k_settled',
    'eval.hunter_kills_per_life_mean_settled',
    'eval.hunter_juvenile_death_share_settled',
    'eval.pursuit_kill_share_settled',
    'eval.food_energy_per_1k@20k',
    'eval.carcass_loss_share.lost',
    'eval.carcass_loss_share.eaten',
    'eval.carcass_loss_share.faded',
    'eval.carcass_lost_per_1k',
    'eval.recruit_cohort',
    'eval.recruit_matured_hunters',
    'eval.recruit_censored_share',
    'eval.recruit_matured_share',
    'eval.recruit_first_kill_share',
    'eval.recruit_lineage_share',
    'eval.recruit_replaced_share.mate-hunter-parent',
    'eval.recruit_replaced_share.split-hunter-parent',
    'eval.recruit_replaced_share.spec-flip',
    'eval.recruit_replaced_share.floor',
    'eval.hunter_starve_age_median',
    'eval.hunter_lineage_extinctions',
    'eval.hunter_global_extinctions',
    'eval.chase_net_energy',
    'eval.chase_failed_energy',
    'eval.hunter_territory_blocked_share',
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
    'eval.edge_split_blocked_share.seen',
    'eval.edge_split_blocked_share.energy',
    'eval.prey_selectivity.forager',
    'eval.prey_selectivity.reproducer',
    'eval.prey_selectivity.scout',
    'eval.prey_selectivity.defender',
    'eval.edge_split_blocked_share.merit',
    'eval.edge_split_blocked_share.proof',
    'eval.edge_split_blocked_share.other',
    'eval.food_contact_bite_share',
    'eval.full_contact_bite_share',
    'eval.fat_speed_ratio',
    'eval.graze_time_share',
    'eval.graze_speed_ratio',
    'eval.hunter_plant_linger_share',
    'eval.strike_miss_energy_ratio',
    'eval.guild_share.forager',
    'eval.guild_share.reproducer',
    'eval.guild_share.scout',
    'eval.guild_share.defender',
    'eval.guild_survival.forager',
    'eval.guild_survival.reproducer',
    'eval.guild_survival.scout',
    'eval.guild_survival.defender',
    'eval.defender_repel_per_1k',
    'eval.scout_alarm_lead_share',
    'eval.reproducer_recovery_rate',
    'eval.chase_overshoot_share',
    'eval.chase_cover_use_share',
    'eval.chase_turn_jitter',
    'eval.predators_at_end_terminal_window',
    'eval.chase_quit_share',
    'eval.chase_lost_share',
    'eval.chase_outrun_share',
    'eval.chase_shaken_share',
    'eval.chase_ticks_p50',
    'eval.chase_ticks_p90',
    'eval.pack_lift',
    'eval.pack_prey_size_ratio',
    'eval.style_lineage_share',
    'eval.herd_dodge_share',
    'eval.chase_sprint_lift',
    'eval.flee_sprint_lift',
    'eval.sprint_cost_share',
    'eval.sprint_share.hunter',
    'eval.sprint_share.prey',
    'eval.freeze_under_threat',
    'eval.freeze_survival_gain',
    'eval.ambush_kill_share',
    'eval.chase_reacquire_share',
    'eval.scavenge_approach_share',
    'eval.hunter_defender_bite_ratio',
    'eval.hunter_size_choice',
    'eval.hunter_slow_choice',
    ...GENE_METRICS,
    'eval.effect_share.chilled',
    'eval.effect_share.wounded',
    'eval.effect_share.panicked',
    'eval.effect_share.shaken',
    'eval.effect_share.rallied',
    'eval.effect_share.answered',
    'eval.effect_share.hoarse',
    'eval.effect_share.alert',
    'eval.effect_share.huddled',
    'eval.effect_share.staggered',
    'eval.rally_bite_share',
    'eval.hoarse_call_share',
    'eval.huddle_cold_gain',
    'eval.defender_bite_break_share',
];
/** Watch metrics registered after the snapshot whose intended direction is lower. */
const ADDED_INTENDED_LOWER = [
    'eval.hoarse_call_share',
    'eval.huddle_cold_gain',
    'eval.carcass_loss_share.lost',
    'eval.carcass_loss_share.faded',
    'eval.carcass_lost_per_1k',
    'eval.recruit_censored_share',
    'eval.hunter_lineage_extinctions',
    'eval.hunter_global_extinctions',
    'eval.hunter_territory_blocked_share',
    'eval.food_standing_share',
    'eval.edge_deaths_per_prey',
    'eval.edge_ref_starve_per_prey',
    'eval.edge_ref_eaten_per_prey',
    'eval.edge_split_blocked_share.seen',
    'eval.edge_split_blocked_share.energy',
    'eval.edge_split_blocked_share.merit',
    'eval.edge_split_blocked_share.proof',
    'eval.edge_split_blocked_share.other',
    'eval.fat_speed_ratio',
    'eval.graze_speed_ratio',
    'eval.hunter_plant_linger_share',
    'eval.prey_selectivity.forager',
    'eval.prey_selectivity.reproducer',
    'eval.prey_selectivity.scout',
    'eval.prey_selectivity.defender',
    'eval.sprint_share.hunter',
    'eval.sprint_share.prey',
    'eval.hunter_defender_bite_ratio',
    'eval.gene_edge_share',
    'eval.winter_shelter_distance', // metric-noise T25: negative is towards shelter, so lower is intended (was higher)
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
    it('gives the four noisy metrics at least the 32 METRIC_MIN_SEEDS did, at their E276 readings', () => {
        for (const [metric, seeds] of Object.entries(SNAPSHOT.minSeeds)) {
            expect(minSeedsFor(metric)).toBeGreaterThanOrEqual(seeds);
        }
        // lineages_alive needs 64 at the step 5 defaults (E276); it needed 32 on E254.
        expect(
            ['eval.floor_episodes', 'eval.lineages_alive', 'eval.lineage_turnover', 'eval.predator_share_cv'].map(
                minSeedsFor,
            ),
        ).toEqual([32, 64, 32, 32]);
        expect(Object.keys(SNAPSHOT.minSeeds)).toHaveLength(4);
    });

    it('uses measured minima for registered metrics and defaults to 16 for unknown and inherited names', () => {
        expect(DEFAULT_MIN_SEEDS).toBe(16);
        expect(MIN_SEEDS).toBe(DEFAULT_MIN_SEEDS);
        expect(minSeedsFor('eval.food_energy_per_1k@20k')).toBe(16);
        expect(minSeedsFor('eval.diversity')).toBe(32);
        expect(minSeedsFor('eval.qd_score')).toBe(64);
        for (const metric of ['mystery', 'toString', 'constructor']) {
            expect(minSeedsFor(metric)).toBe(16);
        }
    });
});
