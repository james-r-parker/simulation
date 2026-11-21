// The scene metrics (natural-selection.md, Detectors): instruments for the scenes the world should show, merged from the
// detectors' `metrics` (`detectors.js`) and the two sets that read the observer's own counters. Each is `null` with a
// reason when nothing fed it. They change no sim state and cost no per-tick allocation. Directions live in
// `js/evo/metric-registry/`.

import { detectorMetrics } from './observer-detectors.js';
import { alarmReachMetrics } from './observer-alarm-reach.js';
import { rewardMetrics } from './metrics-reward.js';

/**
 * @param {Record<string, any>} observer the observer, fed every tick
 * @param {Record<string, any>} world the world at the run's last tick
 * @returns {import('./metrics-stats.js').MetricRecord} the scene metrics
 */
export function sceneMetrics(observer, world) {
    return {
        ...detectorMetrics(observer.plan, observer, world),
        ...alarmReachMetrics(observer),
        ...rewardMetrics(observer, world),
    };
}
