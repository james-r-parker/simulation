// The scene metrics (natural-selection.md, Detectors): instruments for the scenes the world should show, read from
// `observer.scenes`. Each is `watch` unless its direction is set below, and each is `null` with a reason when nothing
// fed it. They change no sim state and cost no per-tick allocation.

import { approachMetrics } from './scene-approach.js';
import { balanceMetrics } from './scene-balance.js';
import { basinMetrics } from './scene-basin.js';
import { carcassMetrics } from './scene-carcass.js';
import { PATCH_DIRECTIONS, patchMetrics } from './scene-patch.js';
import { conditionMetrics } from './scene-condition.js';
import { seasonMetrics } from './scene-season.js';
import { spendMetrics } from './scene-spend.js';
import { terrainMetrics } from './scene-terrain.js';
import { styleMetrics } from './style.js';

const WATCH = [
    'eval.hunt_abort_rate',
    'eval.chase_catch_share',
    'eval.chase_escape_share',
    'eval.chase_giveup_share',
    'eval.refuge_use_under_threat',
    'eval.carcass_meal_share',
    'eval.carcass_hunter_share',
    'eval.gap_crossers',
    'eval.gap_never_share',
    'eval.basin_pop_cv',
    'eval.basin_recolonisations',
    'eval.condition_gait_shift',
    'eval.mother_wait_by_condition',
    'eval.childshare_by_condition',
    'eval.winter_basin_density',
    'eval.winter_shelter_distance',
    'eval.style_separation',
];

/** The direction of each scene metric, as the Detectors table names them. */
export const SCENE_DIRECTIONS = Object.freeze({
    ...PATCH_DIRECTIONS,
    'eval.predators_at_end': 'higher',
    'eval.prey_types_at_end': 'higher',
    'eval.basin_lineages_alive': 'higher',
    'eval.basin_lineage_effective': 'higher',
    ...Object.fromEntries(WATCH.map((name) => [name, 'watch'])),
});

/**
 * @param {Record<string, any>} observer the observer, fed every tick
 * @param {Record<string, any>} world the world at the run's last tick
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the scene metrics
 */
export function sceneMetrics(observer, world) {
    const s = observer.scenes;
    return {
        ...patchMetrics(s.patch),
        ...approachMetrics(s.approach),
        ...terrainMetrics(s.terrain),
        ...carcassMetrics(s.carcass, observer),
        ...basinMetrics(s.basin),
        ...balanceMetrics(s.balance, world),
        ...conditionMetrics(s.condition, observer),
        ...spendMetrics(s.spend),
        ...seasonMetrics(s.season),
        ...styleMetrics(s.style),
    };
}
