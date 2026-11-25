// The defender detector (docs/designs/metric-noise.md, Phase 6, T22): what the defender's shove does. The sim emits no event
// for a shove (`tryDefenderRepel` in `js/sim/defender-repel.js`), so the detector reads the tick's contact list after the step,
// as `scene-bite.js` does, and applies the sim's own condition: a defender holds `BITE` above 0 with a `canHunt` body in its
// jaws, the shove is on, and the two touch. Positions and outputs are the ones `feed` read; a shove on a hunter that died in
// the same step, or by a defender that did, is not seen.
//
// - `shoves` (the count `eval.defender_repel_per_1k` of `scene-guilds.js` reads): the shoves landed after burn-in.
// - `eval.defender_bite_break_share` (higher): of the bite episodes on non-hunters that resolved after burn-in (the victim died,
//   or `ESCAPE_TICKS` passed from the last bite, as `observer-combat.js` counts them), the share that escaped after a shove
//   landed on the hunter that bit the victim while the episode was open. 0 with the shove off; null with no resolved episode.
//
// Detectors only, never fitness. Nothing is allocated per tick.

import { inJaws } from '../sim/bite-rule.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../sim/brain-layout.js';
import { DEATH_CAUSE, EVENT, EVENT_TICK } from '../sim/events.js';
import { ESCAPE_TICKS } from '../sim/merit-state.js';
import { SPEC } from '../sim/specs.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { none, ok } from './metrics-stats.js';
import { BITTEN_THIS_TICK } from './observer-intent-episode.js';

const NO_EPISODE = 'no bite episode resolved after burn-in';

/**
 * @param {Readonly<Record<string, any>>} config the world's config (`maxAgents`)
 * @returns {Record<string, any>} an empty defender scene: the shoves, and per slot the open episode (its biter's genome id,
 *   last bite tick and whether a shove landed during it) and the episodes resolved
 */
export function createDefenderScene(config) {
    const n = config.maxAgents;
    return {
        shoves: 0,
        open: new Uint8Array(n),
        lastBite: new Float64Array(n),
        shoved: new Uint8Array(n),
        resolved: 0,
        broken: 0,
    };
}

/**
 * Marks the open episodes whose biter is the shoved hunter.
 * @param {Record<string, any>} scene the defender scene
 * @param {Record<string, any>} world the world
 * @param {number} hunter the shoved slot
 * @returns {void}
 */
function markShoved(scene, world, hunter) {
    const id = world.genomeId[hunter];
    for (let s = 0; s < scene.open.length; s++) {
        if (scene.open[s] === 1 && world.lastBiter[s] === id) {
            scene.shoved[s] = 1;
        }
    }
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} defender a slot
 * @param {number} target a slot it touches
 * @returns {boolean} whether the sim's repel fires from `defender` onto `target` (`tryDefenderRepel`, which reads the
 *   defender's per-slot lanes)
 */
function shoves(world, defender, target) {
    const { lanes } = world;
    return (
        (lanes.defenderRepelEnergy[defender] > 0 || lanes.defenderRepelImpulse[defender] > 0) &&
        world.alive[defender] === 1 &&
        world.alive[target] === 1 &&
        world.spec[defender] === SPEC.DEFENDER &&
        world.huntBySpec[world.spec[target]] === 1 &&
        world.outputs[defender * OUTPUT_COUNT + OUTPUT_INDEX.BITE] > 0 &&
        inJaws(world, defender, target)
    );
}

/**
 * Counts the shoves of the step that just ran, over its contact list, and marks the episodes they landed in.
 * @param {Record<string, any>} scene the defender scene
 * @param {Record<string, any>} world the world after the step
 * @returns {void}
 */
function noteShoves(scene, world) {
    for (let c = 0; c < world.contactCount; c++) {
        const a = world.contacts[2 * c];
        const b = world.contacts[2 * c + 1];
        for (let side = 0; side < 2; side++) {
            const defender = side === 0 ? a : b;
            const target = side === 0 ? b : a;
            if (shoves(world, defender, target)) {
                scene.shoves += 1;
                markShoved(scene, world, target);
            }
        }
    }
}

/**
 * Ends a slot's episode: counts it, and counts it broken when it escaped after a shove.
 * @param {Record<string, any>} scene the defender scene
 * @param {number} slot the victim's slot
 * @param {boolean} escaped whether the victim survived it
 * @returns {void}
 */
function resolve(scene, slot, escaped) {
    scene.resolved += 1;
    scene.broken += escaped && scene.shoved[slot] === 1 ? 1 : 0;
    scene.open[slot] = 0;
    scene.shoved[slot] = 0;
}

/**
 * Advances the episodes of the alive non-hunters: a fresh bite opens or extends one, and one whose last bite is
 * `ESCAPE_TICKS` old resolves as escaped.
 * @param {Record<string, any>} scene the defender scene
 * @param {Record<string, any>} world the world after the step
 * @returns {void}
 */
function trackEpisodes(scene, world) {
    for (let s = 0; s < scene.open.length; s++) {
        if (world.alive[s] !== 1 || world.huntBySpec[world.spec[s]] === 1) {
            continue;
        }
        if (world.bittenTimer[s] === BITTEN_THIS_TICK) {
            scene.open[s] = 1;
            scene.lastBite[s] = world.tick;
        } else if (scene.open[s] === 1 && world.tick - scene.lastBite[s] >= ESCAPE_TICKS) {
            resolve(scene, s, true);
        }
    }
}

/**
 * Advances the scene one tick; call it once per tick after the step. Nothing is counted before burn-in.
 * @param {Record<string, any>} scene the defender scene
 * @param {Record<string, any>} world the world after the step
 * @returns {void}
 */
export function tickDefender(scene, world) {
    if (world.tick < BURN_IN_TICKS) {
        return;
    }
    trackEpisodes(scene, world);
    noteShoves(scene, world);
}

/**
 * Closes the episode of a victim that died, as `observer-combat.js` does: any death with an episode open, or an eaten one,
 * counts as caught.
 * @param {Record<string, any>} scene the defender scene
 * A hunter that dies has no episode (only non-hunters open one), so a hunter eaten by a hunter is not counted.
 * @param {{tick: number, slot: number, cause: number, hunter: boolean}} death the death record
 * @returns {void}
 */
export function noteDefenderDeath(scene, { tick, slot, cause, hunter }) {
    if (hunter) {
        return;
    }
    if (tick >= BURN_IN_TICKS && (scene.open[slot] === 1 || cause === DEATH_CAUSE.EATEN)) {
        resolve(scene, slot, false);
    }
}

/**
 * @param {Record<string, any>} scene the defender scene
 * @returns {import('./metrics-stats.js').MetricRecord} the bite-break share
 */
export function defenderMetrics(scene) {
    return {
        'eval.defender_bite_break_share': scene.resolved === 0 ? none(NO_EPISODE) : ok(scene.broken / scene.resolved),
    };
}

/** @type {import('./observer-detectors.js').Detector} */
export const defenderDetector = {
    name: 'defender',
    modules: ['js/evo/scene-defender.js'],
    create: (config) => createDefenderScene(config),
    onTick: (scene, world) => tickDefender(scene, world),
    on: {
        AGENT_DIED: (scene, world, o) => {
            const d = world.events.data;
            noteDefenderDeath(scene, {
                tick: d[o + EVENT_TICK],
                slot: d[o + EVENT.AGENT_DIED.SLOT],
                cause: d[o + EVENT.AGENT_DIED.CAUSE],
                hunter: world.huntBySpec[d[o + EVENT.AGENT_DIED.SPEC]] === 1,
            });
        },
    },
    onSlotFree: (scene, slot) => {
        scene.open[slot] = 0;
        scene.shoved[slot] = 0;
    },
    metrics: (scene) => defenderMetrics(scene),
};
