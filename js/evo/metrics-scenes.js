import { detectorMetrics } from './observer-detectors.js';
// The scene metrics (natural-selection.md, Detectors): instruments for the scenes the world should show, read from
// `observer.scenes`. Each is `null` with a reason when nothing fed it.
// They change no sim state and cost no per-tick allocation. Directions live in `js/evo/metric-registry/`.

import { alarmReachMetrics } from './observer-alarm-reach.js';
import { divergenceMetrics } from './scene-divergence.js';
import { familyMetrics } from './scene-families.js';
import { guildMetrics } from './scene-guilds.js';
import { kinProximityMetrics } from './scene-kin-proximity.js';
import { rewardMetrics } from './metrics-reward.js';
import { spendMetrics } from './scene-spend.js';
import { styleMetrics } from './style.js';

/**
 * @param {Record<string, any>} observer the observer, fed every tick
 * @param {Record<string, any>} world the world at the run's last tick
 * @returns {import('./metrics-stats.js').MetricRecord} the scene metrics
 */
export function sceneMetrics(observer, world) {
    const s = observer.scenes;
    return {
        ...familyMetrics(s.families, world),
        ...divergenceMetrics(s.divergence, world),
        ...spendMetrics(s.spend),
        ...styleMetrics(s.style),
        ...guildMetrics(s.guilds),
        ...kinProximityMetrics(s.kin),
        ...alarmReachMetrics(observer),
        ...rewardMetrics(observer, world),
        ...detectorMetrics(observer.plan, observer, world),
    };
}
