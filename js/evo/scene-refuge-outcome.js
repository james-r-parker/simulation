// What cover does for the prey that use it (refuge.md, Detectors), beside the visits of `scene-refuge.js`. Every 10 ticks
// after burn-in, over alive non-hunting agents:
//
// - `eval.refuge_crowding`: the mean prey inside a ring, over the rings that hold a threatened prey (the stack).
// - `eval.refuge_eligible_share`: the share of prey-samples whose body radius is `REFUGE_CLEARANCE_PX` or more under
//   `refugeSizeMax`, so the gap lets them through (the clearance is what `test/sim/refuge-access.test.js` measures).
// - `eval.cold_margin_use_under_threat`: the threatened share in the two cold bands minus the calm share (prey only).
//
// And every tick, for a prey bitten that tick:
//
// - `eval.refuge_bite_deficit`: bites per prey-tick inside a ring over bites per prey-tick outside. Prey-ticks are the
//   samples, ten ticks each. Below 1, cover protects.
//
// Per-slot work only; the per-ring tallies are preallocated and nothing is allocated per sample or per tick.

import { refugeIndexAt, ringRadius } from '../sim/terrain.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { none, ok } from './metrics-stats.js';
import { BITTEN_THIS_TICK } from './observer-intent-episode.js';
import { GROUP_SAMPLE_TICKS, THREAT_PROXIMITY } from './observer-intent-state.js';
import { refugeCentres } from './scene-terrain.js';

/** The room, in px, a body needs between its radius and `refugeSizeMax` to count as able to enter a ring. The largest eligible radius enters from every angle (`test/sim/refuge-access.test.js`), so none. */
export const REFUGE_CLEARANCE_PX = 0;

/** Fewest prey-samples inside a ring that `eval.refuge_bite_deficit` needs. */
export const MIN_RING_PREY_SAMPLES = 100;

/**
 * @param {Readonly<Record<string, any>>} config the world's config (`refugeCount`)
 * @returns {Record<string, any>} an empty outcome scene
 */
export function createRefugeOutcomeScene(config) {
    return {
        ringPrey: new Uint32Array(config.refugeCount),
        ringThreat: new Uint32Array(config.refugeCount),
        crowdSum: 0,
        crowdRings: 0,
        preySamples: 0,
        eligible: 0,
        samplesIn: 0,
        bitesIn: 0,
        bitesOut: 0,
        threatened: 0,
        threatenedCold: 0,
        calm: 0,
        calmCold: 0,
    };
}

/**
 * Counts the bites this tick on prey, by whether the victim stands in a ring. Call it every tick.
 * @param {Record<string, any>} scene the outcome scene
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world after the step
 * @returns {void}
 */
export function tickRefugeBites(scene, observer, world) {
    if (world.tick < BURN_IN_TICKS) {
        return;
    }
    const { hunterSpec } = observer.intent;
    const { alive, bittenTimer, spec, x, y } = world;
    let centres = null;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] !== 1 || bittenTimer[slot] !== BITTEN_THIS_TICK || hunterSpec[spec[slot]] === 1) {
            continue;
        }
        centres ??= refugeCentres(observer.scenes.terrain, world);
        if (refugeIndexAt(centres, ringRadius(world.config), x[slot], y[slot]) >= 0) {
            scene.bitesIn += 1;
        } else {
            scene.bitesOut += 1;
        }
    }
}

/**
 * Closes the per-ring tallies of a sample into the crowding sum and clears them.
 * @param {Record<string, any>} scene the outcome scene
 * @returns {void}
 */
function closeCrowd(scene) {
    for (let ring = 0; ring < scene.ringPrey.length; ring++) {
        if (scene.ringThreat[ring] > 0) {
            scene.crowdSum += scene.ringPrey[ring];
            scene.crowdRings += 1;
        }
        scene.ringPrey[ring] = 0;
        scene.ringThreat[ring] = 0;
    }
}

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @param {number} y a position
 * @returns {boolean} whether the position is in one of the two cold bands
 */
function inColdBand(config, y) {
    return y < config.coldMarginWidth || y > config.worldHeight - config.coldMarginWidth;
}

/**
 * Tallies one prey agent: its size, the threat and cold shares, and its ring.
 * @param {Record<string, any>} scene the outcome scene
 * @param {Record<string, any>} world the world
 * @param {{ring: number, threatened: boolean, slot: number}} prey the prey's ring index (-1 outside), threat and slot
 * @returns {void}
 */
function tallyPrey(scene, world, { ring, threatened, slot }) {
    const { config } = world;
    const cold = inColdBand(config, world.y[slot]) ? 1 : 0;
    scene.preySamples += 1;
    scene.eligible += world.size[slot] <= config.refugeSizeMax - REFUGE_CLEARANCE_PX ? 1 : 0;
    scene[threatened ? 'threatened' : 'calm'] += 1;
    scene[threatened ? 'threatenedCold' : 'calmCold'] += cold;
    if (ring >= 0) {
        scene.samplesIn += 1;
        scene.ringPrey[ring] += 1;
        scene.ringThreat[ring] += threatened ? 1 : 0;
    }
}

/**
 * Runs one 10-tick sample at or after burn-in.
 * @param {Record<string, any>} scene the outcome scene
 * @param {Record<string, any>} observer the observer, with its intent state current for this tick
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleRefugeOutcome(scene, observer, world) {
    if (world.tick < BURN_IN_TICKS) {
        return;
    }
    const { hunterSpec, threatProx } = observer.intent;
    const centres = refugeCentres(observer.scenes.terrain, world);
    const radius = ringRadius(world.config);
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1 && hunterSpec[world.spec[slot]] !== 1) {
            const ring = refugeIndexAt(centres, radius, world.x[slot], world.y[slot]);
            tallyPrey(scene, world, { ring, threatened: threatProx[slot] >= THREAT_PROXIMITY, slot });
        }
    }
    closeCrowd(scene);
}

/**
 * @param {Record<string, any>} scene the outcome scene
 * @returns {import('./metrics-stats.js').MetricResult} bites per prey-tick inside over outside
 */
function biteDeficit(scene) {
    const ticksIn = scene.samplesIn * GROUP_SAMPLE_TICKS;
    const ticksOut = (scene.preySamples - scene.samplesIn) * GROUP_SAMPLE_TICKS;
    if (scene.samplesIn < MIN_RING_PREY_SAMPLES || ticksOut === 0 || scene.bitesOut === 0) {
        return none(`under ${MIN_RING_PREY_SAMPLES} prey-samples in a ring, or no bite outside one, after burn-in`);
    }
    return ok(scene.bitesIn / ticksIn / (scene.bitesOut / ticksOut));
}

/**
 * @param {Record<string, any>} scene the outcome scene
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the four outcome metrics
 */
export function refugeOutcomeMetrics(scene) {
    return {
        'eval.refuge_crowding':
            scene.crowdRings > 0 ? ok(scene.crowdSum / scene.crowdRings) : none('no ring held a threatened prey'),
        'eval.refuge_bite_deficit': biteDeficit(scene),
        'eval.refuge_eligible_share':
            scene.preySamples > 0 ? ok(scene.eligible / scene.preySamples) : none('no prey sample after burn-in'),
        'eval.cold_margin_use_under_threat':
            scene.threatened > 0 && scene.calm > 0
                ? ok(scene.threatenedCold / scene.threatened - scene.calmCold / scene.calm)
                : none('no threatened and calm prey sample after burn-in'),
    };
}
