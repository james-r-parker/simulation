// The contagion's detectors (docs/designs/disease.md, Detectors), read from the tick's events and a 1000-tick family
// checkpoint (`BASIN_CHECKPOINT_TICKS`, fed by `observer-scenes.js`). Nothing here touches the world.
//
// - `eval.disease_deaths_share`: deaths with cause `DISEASE` over all deaths after burn-in.
// - `eval.strains_per_100k`: `STRAIN_EMERGED` events per 100000 ticks.
// - `eval.strain_family_focus`: of the infections passed on by contact (an emergence infects its host, which is not
//   counted), the share whose host lay within `FAMILY_DISTANCE` of the strain's genotype.
// - `eval.disease_frequency_slope`: at each checkpoint the living are clustered into families (the `scene-families.js`
//   rule, both basins pooled); over the next 1000 ticks each family's members' infections are counted. Each family is
//   one point, x its share of the living and y its infections per member; the metric is the least-squares slope of y
//   on x over the run. Positive means common families are infected more per head.
//
// All four are `null` with reason `disease-off` while `diseaseSeedRate` is 0. The arrays are sized once from
// `maxAgents`; a checkpoint allocates nothing.

import { DEATH_CAUSE, EVENT_STRIDE, EVENT_TYPE } from '../sim/events.js';
import { geneticDistance } from '../sim/genetics.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { none, ok, share } from './metrics-stats.js';
import { FAMILY_DISTANCE } from './scene-families.js';

/** The fewest (family, window) points the slope needs. */
export const MIN_SLOPE_POINTS = 10;

const OFF = 'disease-off';

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} an empty scene
 */
export function createDiseaseScene(config) {
    const n = config.maxAgents;
    return {
        on: config.diseaseSeedRate > 0,
        deaths: 0,
        diseaseDeaths: 0,
        strains: 0,
        infections: 0,
        inFamily: 0,
        ticks: 0,
        founders: new Int32Array(n),
        sizes: new Float64Array(n),
        hits: new Float64Array(n),
        familyOf: new Int32Array(n).fill(-1),
        genomeAt: new Uint32Array(n),
        families: 0,
        alive: 0,
        fit: new Float64Array(5),
    };
}

/**
 * Counts one infection against the family its host belonged to at the last checkpoint, when it is the same agent.
 * @param {Record<string, any>} scene the scene
 * @param {number} slot the infected slot
 * @param {number} genomeId the infected genome
 * @returns {void}
 */
function creditFamily(scene, slot, genomeId) {
    const family = scene.familyOf[slot];
    if (family >= 0 && scene.genomeAt[slot] === genomeId) {
        scene.hits[family] += 1;
    }
}

/**
 * Reads the tick's contagion events and deaths.
 * @param {Record<string, any>} scene the scene
 * @param {Record<string, any>} world the world after the tick
 * @returns {void}
 */
export function noteDiseaseEvents(scene, world) {
    if (!scene.on) {
        return;
    }
    scene.ticks = world.tick;
    const d = world.events.data;
    const end = world.events.count * EVENT_STRIDE;
    for (let o = 0; o < end; o += EVENT_STRIDE) {
        const type = d[o];
        if (type === EVENT_TYPE.STRAIN_EMERGED) {
            scene.strains += 1;
        } else if (type === EVENT_TYPE.AGENT_INFECTED) {
            scene.infections += 1;
            scene.inFamily += d[o + 5] < FAMILY_DISTANCE ? 1 : 0;
            creditFamily(scene, d[o + 2], d[o + 3]);
        } else if (type === EVENT_TYPE.AGENT_DIED && d[o + 1] > BURN_IN_TICKS) {
            scene.deaths += 1;
            scene.diseaseDeaths += d[o + 4] === DEATH_CAUSE.DISEASE ? 1 : 0;
        }
    }
}

/**
 * Adds the closing window's points (one per family) to the running least-squares sums: n, sum x, sum y, sum xx, sum xy.
 * @param {Record<string, any>} scene the scene
 * @returns {void}
 */
function closeWindow(scene) {
    const { fit, sizes, hits } = scene;
    for (let f = 0; f < scene.families; f++) {
        const x = sizes[f] / scene.alive;
        const y = hits[f] / sizes[f];
        fit[0] += 1;
        fit[1] += x;
        fit[2] += y;
        fit[3] += x * x;
        fit[4] += x * y;
    }
}

/**
 * @param {Record<string, any>} scene the scene
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @returns {number} the family it joins, founding one when none lies within `FAMILY_DISTANCE`
 */
function joinFamily(scene, world, slot) {
    for (let f = 0; f < scene.families; f++) {
        if (geneticDistance(world, scene.founders[f], slot) < FAMILY_DISTANCE) {
            scene.sizes[f] += 1;
            return f;
        }
    }
    const f = scene.families;
    scene.founders[f] = slot;
    scene.sizes[f] = 1;
    scene.hits[f] = 0;
    scene.families = f + 1;
    return f;
}

/**
 * Closes the last window and clusters the living into the next one's families.
 * @param {Record<string, any>} scene the scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleDiseaseFamilies(scene, world) {
    if (!scene.on) {
        return;
    }
    if (scene.alive > 0) {
        closeWindow(scene);
    }
    scene.families = 0;
    scene.alive = 0;
    scene.familyOf.fill(-1);
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            scene.familyOf[slot] = joinFamily(scene, world, slot);
            scene.genomeAt[slot] = world.genomeId[slot];
            scene.alive += 1;
        }
    }
}

/**
 * @param {Float64Array} fit the least-squares sums
 * @returns {import('./metrics-stats.js').MetricResult} the slope, or `null` with too few points or no spread in x
 */
function slopeOf(fit) {
    const [n, sx, sy, sxx, sxy] = fit;
    if (n < MIN_SLOPE_POINTS) {
        return none('few-points');
    }
    const spread = n * sxx - sx * sx;
    return spread > 0 ? ok((n * sxy - sx * sy) / spread) : none('few-points');
}

/**
 * @param {Record<string, any>} scene the scene
 * @returns {import('./metrics-stats.js').MetricRecord} the four contagion metrics
 */
export function diseaseMetrics(scene) {
    if (!scene.on) {
        return {
            'eval.disease_deaths_share': none(OFF),
            'eval.strains_per_100k': none(OFF),
            'eval.strain_family_focus': none(OFF),
            'eval.disease_frequency_slope': none(OFF),
        };
    }
    const passed = scene.infections - scene.strains;
    return {
        'eval.disease_deaths_share': share(scene.diseaseDeaths, scene.deaths, 'no-deaths'),
        'eval.strains_per_100k': scene.ticks > 0 ? ok((scene.strains / scene.ticks) * 100000) : none('no-ticks'),
        'eval.strain_family_focus': share(scene.inFamily - scene.strains, passed, 'no-infections'),
        'eval.disease_frequency_slope': slopeOf(scene.fit),
    };
}
