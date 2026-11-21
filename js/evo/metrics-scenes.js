import { detectorMetrics } from './observer-detectors.js';
// The scene metrics (natural-selection.md, Detectors): instruments for the scenes the world should show, read from
// `observer.scenes`. Each is `null` with a reason when nothing fed it.
// They change no sim state and cost no per-tick allocation. Directions live in `js/evo/metric-registry/`.

import { alarmReachMetrics } from './observer-alarm-reach.js';
import { biteMetrics } from './scene-bite.js';
import { biteLifeMetrics } from './scene-bite-life.js';
import { balanceMetrics } from './scene-balance.js';
import { basinMetrics } from './scene-basin.js';
import { capacityMetrics } from './scene-capacity.js';
import { eatMetrics } from './scene-eat.js';
import { strikeMissMetrics } from './scene-strike-miss.js';
import { edgeMetrics } from './scene-edge.js';
import { divergenceMetrics } from './scene-divergence.js';
import { familyMetrics } from './scene-families.js';
import { diseaseMetrics } from './scene-disease.js';
import { terminalHunterMetrics } from './scene-terminal-hunters.js';
import { guardMetrics, summerMetrics } from './scene-guards.js';
import { guildMetrics } from './scene-guilds.js';
import { kinProximityMetrics } from './scene-kin-proximity.js';
import { hunterMetrics } from './scene-hunters.js';
import { carcassLossMetrics } from './scene-carcass-loss.js';
import { recruitMetrics } from './scene-recruit.js';
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
 * @returns {import('./metrics-stats.js').MetricRecord} the scene metrics
 */
export function sceneMetrics(observer, world) {
    const s = observer.scenes;
    return {
        ...patchMetrics(s.patch),
        ...terrainMetrics(s.terrain),
        ...refugeMetrics(s.refuge),
        ...reachMetrics(s.reach),
        ...refugeOutcomeMetrics(s.refugeOutcome),
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
        ...recruitMetrics(s.recruit, world),
        ...carcassLossMetrics(s.carcass.loss, world, s.carcass.eaten),
        ...guardMetrics(s.guards),
        ...terminalHunterMetrics(s.guards, world),
        ...summerMetrics(s.guards),
        ...guildMetrics(s.guilds),
        ...capacityMetrics(s.capacity),
        ...edgeMetrics(s.edge),
        ...eatMetrics(s.eat),
        ...strikeMissMetrics(s.strikeMiss, world),
        ...kinProximityMetrics(s.kin),
        ...alarmReachMetrics(observer),
        ...rewardMetrics(observer, world),
        ...biteMetrics(s.bite),
        ...biteLifeMetrics(s.biteLife, world),
        ...detectorMetrics(observer.plan, observer, world),
    };
}
