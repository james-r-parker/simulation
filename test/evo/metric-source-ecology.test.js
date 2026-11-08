// Source answers for the ecology scene family (metric-trust T18): real steps, observer reads and computeMetrics.
import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { METRICS } from '../../js/evo/metric-registry/index.js';
import { plantFood, sourceRun, starve } from './helpers/source-world.js';
import expected from './helpers/metric-source-scenes-ecology-baseline.js';

const SOURCE_METRICS = [
    'eval.seasonal_diet_shift',
    'eval.pollination_rate',
    'eval.flora_hue_spread',
    'eval.flora_patch_pool_full_share',
    'eval.flora_patch_death_rate',
    'eval.flora_seed_bank_occupancy_share',
    'eval.toxic_avoidance',
    'eval.toxic_death_share',
    'eval.sick_share',
    'eval.food_species_share.grass',
    'eval.food_species_share.berry',
    'eval.food_species_share.nut',
    'eval.food_species_share.flower',
    'eval.food_species_share.fungus',
    'eval.food_species_share.toxiccap',
    'eval.trampled_share',
    'eval.dodge_skill',
    'eval.herd_grazed_share',
    'eval.trample_unavoidable_share',
    'eval.herd_stampede_rate',
    'eval.herd_animals',
    'eval.herd_gap_crossings',
    'eval.herd_recolonisations',
    'eval.herd_follow_share',
    'eval.dung_food_share',
    'eval.herd_seeded_patches',
    'eval.herd_carcass_meal_share',
    'eval.carcass_meal_share',
    'eval.carcass_hunter_share',
    'eval.herd_carcass_share.forager',
    'eval.herd_carcass_share.predator',
    'eval.herd_carcass_share.reproducer',
    'eval.herd_carcass_share.scout',
    'eval.herd_carcass_share.defender',
    'eval.disease_deaths_share',
    'eval.strains_per_100k',
    'eval.strain_family_focus',
    'eval.disease_frequency_slope',
    'eval.winter_basin_density',
    'eval.winter_shelter_distance',
    'eval.winter_band_shift',
    'eval.winter_patch_proximity',
    'eval.season_map_distance',
    'eval.herd_season_shift',
    'eval.basin_pop_cv',
    'eval.basin_recolonisations',
    'eval.predators_at_end',
    'eval.prey_types_at_end',
    'eval.basin_lineages_alive',
    'eval.basin_lineage_effective',
    'eval.refuge_prey_use_under_threat',
    'eval.refuge_episode_entry',
    'eval.refuge_dwell_ticks',
    'eval.refuge_exit_fed',
    'eval.refuge_crowding',
    'eval.refuge_eligible_share',
    'eval.cold_margin_use_under_threat',
    'eval.refuge_bite_deficit',
    'eval.refuge_use_under_threat',
    'eval.gap_crossers',
    'eval.gap_never_share',
    'eval.patch_leave_depleted',
    'eval.patch_stay_depleted',
    'eval.prey_extinctions',
    'eval.boom_bust_count',
    'eval.prey_summer_min',
    'eval.prey_cover_distance',
    'eval.prey_within_dash_share',
    'eval.prey_in_patch_share',
];

const FLORA = ['grass', 'berry', 'nut', 'flower', 'fungus', 'toxiccap'];

function ecologySourceRun() {
    const run = sourceRun({ runTicks: BURN_IN_TICKS + 2 });
    const [firstDeath, finalDeath] = [run.spawn(), run.spawn()];
    run.jump(BURN_IN_TICKS);
    run.tick((world) => starve(world, firstDeath, 20));
    run.tick((world) => starve(world, finalDeath, 20));
    return run;
}

/** @param {number} target @param {'never' | 'middle' | 'always'} pattern */
function speciesShareRun(target, pattern) {
    const run = sourceRun({ runTicks: BURN_IN_TICKS + 2, over: { maxAgents: 16, maxFood: 4 } });
    const [eater, firstDeath, finalDeath] = [run.spawn(), run.spawn(), run.spawn()];
    const other = (target + 1) % FLORA.length;
    const species = pattern === 'never' ? [other, other] : pattern === 'always' ? [target, target] : [target, other];
    run.jump(BURN_IN_TICKS);
    run.tick((world) => {
        plantFood(world, eater, 10);
        world.foodSpecies[world.foodAlive.findIndex((/** @type {number} */ alive) => alive === 1)] = species[0];
        starve(world, firstDeath, 20);
    });
    run.tick((world) => {
        plantFood(world, eater, 10);
        world.foodSpecies[world.foodAlive.findIndex((/** @type {number} */ alive) => alive === 1)] = species[1];
        starve(world, finalDeath, 20);
    });
    return run;
}

function seasonalDietRun(pattern = 'separated') {
    const run = sourceRun({ runTicks: BURN_IN_TICKS + 20, over: { eraSeasonTicks: 4, maxAgents: 16, maxFood: 4 } });
    const [eater, firstDeath, finalDeath] = [run.spawn(), run.spawn(), run.spawn()];
    run.jump(BURN_IN_TICKS);
    run.tick((world) => {
        plantFood(world, eater, 10);
        world.foodSpecies[world.foodAlive.findIndex((/** @type {number} */ alive) => alive === 1)] = 0;
        starve(world, firstDeath, 20);
    });
    if (pattern === 'middle') {
        run.jump(BURN_IN_TICKS + 4);
        run.tick((world) => {
            plantFood(world, eater, 10);
            world.foodSpecies[world.foodAlive.findIndex((/** @type {number} */ alive) => alive === 1)] = 0;
        });
        run.tick((world) => {
            plantFood(world, eater, 10);
            world.foodSpecies[world.foodAlive.findIndex((/** @type {number} */ alive) => alive === 1)] = 1;
            starve(world, finalDeath, 20);
        });
    } else {
        run.jump(BURN_IN_TICKS + 7);
        run.tick((world) => {
            plantFood(world, eater, 10);
            world.foodSpecies[world.foodAlive.findIndex((/** @type {number} */ alive) => alive === 1)] =
                pattern === 'same' ? 0 : 1;
            starve(world, finalDeath, 20);
        });
    }
    return run;
}

describe('ecology metrics from a scripted source run', () => {
    it('reads every ecology metric at its no-activity end and observes deaths in the earlier and final ticks', () => {
        const run = ecologySourceRun();
        const actual = run.metrics();
        const names = SOURCE_METRICS;
        const registryNames = Object.entries(METRICS)
            .filter(([, entry]) => entry.family === 'scenes-ecology')
            .map(([name]) => name);
        expect(names).toHaveLength(69);
        expect(names).toEqual(registryNames);
        expect(Object.fromEntries(names.map((name) => [name, actual[name]]))).toEqual(expected);
        expect(run.observer.deathCount).toBe(2);
        expect(run.observer.scenes.flora.deaths).toBe(2);
        expect(actual['eval.toxic_death_share']).toEqual({ value: 0 });
    });

    it.each(FLORA)('plants never, a mixed diet and only %s meals with real feed steps', (name) => {
        const species = FLORA.indexOf(name);
        const metric = `eval.food_species_share.${name}`;
        const cases = /** @type {Array<['never' | 'middle' | 'always', number]>} */ ([
            ['never', 0],
            ['middle', 0.5],
            ['always', 1],
        ]);
        for (const [pattern, value] of cases) {
            const run = speciesShareRun(species, pattern);
            expect(run.metrics()[metric]).toEqual({ value });
            expect(run.observer.deathCount).toBe(2);
        }
    });

    it('reads seasonal diet shift as zero, the midpoint and complete turnover', () => {
        const same = seasonalDietRun('same');
        const middle = seasonalDietRun('middle');
        const separated = seasonalDietRun();
        expect(same.metrics()['eval.seasonal_diet_shift']).toEqual({ value: 0 });
        expect(middle.metrics()['eval.seasonal_diet_shift']).toEqual({ value: 0.5 });
        expect(separated.metrics()['eval.seasonal_diet_shift']).toEqual({ value: 1 });
        expect(same.observer.deathCount).toBe(2);
        expect(middle.observer.deathCount).toBe(2);
        expect(separated.observer.deathCount).toBe(2);
    });
});
