import { floraMetrics } from './scene-flora.js';
// The scene metrics (natural-selection.md, Detectors): instruments for the scenes the world should show, read from
// `observer.scenes`. Each is `null` with a reason when nothing fed it.
// They change no sim state and cost no per-tick allocation. Directions live in `js/evo/metric-registry/`.

import { alarmReachMetrics } from './observer-alarm-reach.js';
import { biteMetrics } from './scene-bite.js';
import { biteLifeMetrics } from './scene-bite-life.js';
import { approachMetrics } from './scene-approach.js';
import { balanceMetrics } from './scene-balance.js';
import { basinMetrics } from './scene-basin.js';
import { divergenceMetrics } from './scene-divergence.js';
import { familyMetrics } from './scene-families.js';
import { diseaseMetrics } from './scene-disease.js';
import { carcassMetrics } from './scene-carcass.js';
import { competenceMetrics } from './scene-competence.js';
import { guardMetrics, summerMetrics } from './scene-guards.js';
import { kinProximityMetrics } from './scene-kin-proximity.js';
import { hunterMetrics } from './scene-hunters.js';
import { matchedMetrics } from './scene-matched.js';
import { patchMetrics } from './scene-patch.js';
import { rewardMetrics } from './metrics-reward.js';
import { conditionMetrics } from './scene-condition.js';
import { seasonMetrics } from './scene-season.js';
import { seasonMapMetrics } from './scene-season-map.js';
import { spendMetrics } from './scene-spend.js';
import { reachMetrics } from './scene-reach.js';
import { refugeMetrics } from './scene-refuge.js';
import { refugeOutcomeMetrics } from './scene-refuge-outcome.js';
import { terrainMetrics } from './scene-terrain.js';
import { styleMetrics } from './style.js';
import { herdMetrics } from './scene-herd-metrics.js';

/**
 * @param {Record<string, any>} observer the observer, fed every tick
 * @param {Record<string, any>} world the world at the run's last tick
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the scene metrics
 */
export function sceneMetrics(observer, world) {
    const s = observer.scenes;
    return {
        ...floraMetrics(s.flora),
        ...patchMetrics(s.patch),
        ...approachMetrics(s.approach),
        ...terrainMetrics(s.terrain),
        ...refugeMetrics(s.refuge),
        ...reachMetrics(s.reach),
        ...refugeOutcomeMetrics(s.refugeOutcome),
        ...carcassMetrics(s.carcass, observer),
        ...basinMetrics(s.basin),
        ...balanceMetrics(s.balance, world),
        ...familyMetrics(s.families, world),
        ...divergenceMetrics(s.divergence, world),
        ...conditionMetrics(s.condition, observer),
        ...spendMetrics(s.spend),
        ...seasonMetrics(s.season),
        ...seasonMapMetrics(s.seasonMap),
        ...styleMetrics(s.style),
        ...herdMetrics(s.herd, s.carcass, observer),
        ...diseaseMetrics(s.disease),
        ...hunterMetrics(s.hunters, world),
        ...competenceMetrics(s.competence, world),
        ...matchedMetrics(s.matched),
        ...guardMetrics(s.guards),
        ...summerMetrics(s.guards),
        ...kinProximityMetrics(s.kin),
        ...alarmReachMetrics(observer),
        ...rewardMetrics(observer, world),
        ...biteMetrics(s.bite),
        ...biteLifeMetrics(s.biteLife, world),
    };
}
