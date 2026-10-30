// Rule 2, the proof rule (natural-selection.md, Detectors), read from the sim's proof arrays (js/sim/proof.js):
//
// - `eval.proven_share`, `eval.established_share`: of the agents that died at or after `BURN_IN_TICKS`, the share that
//   had proven themselves and the share that were established (proven, with a proven child). The sim's arrays are zeroed
//   when a slot is freed, so the scene keeps a copy of each alive slot at the end of every tick; a death reads the copy
//   of the previous tick, which is the state at death because meals are credited after the reap.
// - `eval.lineage_persistence`: two kinds of sample. At the start of each winter, the established lineages (a lineage
//   with an alive established member) and, at the start of the next spring, the share of them with an alive member. And
//   at the start of each year, the established lineages, those of them that lost a bearer to a bite during the year
//   ("hunted"), and at the start of the next year the share of the hunted ones with an alive member. The metric is the
//   mean of the shares of all the samples. Failed lines are not scored: they are meant to drop.
//
// Per-slot arrays and fixed tables of at most `maxAgents` lineages; nothing is allocated per tick.

import { DEATH_CAUSE } from '../sim/events.js';
import { WINTER } from '../sim/eras.js';
import { isEstablished } from '../sim/proof.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { none, ok } from './metrics-stats.js';

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} an empty scene
 */
export function createProofScene(config) {
    const n = config.maxAgents;
    return {
        proven: new Uint8Array(n),
        established: new Uint8Array(n),
        deaths: 0,
        provenDeaths: 0,
        establishedDeaths: 0,
        winter: { ids: new Float64Array(n), count: 0 },
        year: { ids: new Float64Array(n), hunted: new Uint8Array(n), count: 0 },
        shareSum: 0,
        samples: 0,
    };
}

/**
 * Counts a death after burn-in as proven and as established, from the copy of the slot at the end of the last tick.
 * @param {Record<string, any>} scene the proof scene
 * @param {Record<string, any>} observer the observer
 * @param {{slot: number, genomeId: number, tick: number}} death the dying agent
 * @returns {void}
 */
export function noteProofDeath(scene, observer, { slot, genomeId, tick }) {
    if (tick < BURN_IN_TICKS) {
        return;
    }
    const tracked = observer.genomeId[slot] === genomeId;
    scene.deaths += 1;
    scene.provenDeaths += tracked ? scene.proven[slot] : 0;
    scene.establishedDeaths += tracked ? scene.established[slot] : 0;
}

/**
 * @param {{ids: Float64Array, count: number}} table a lineage table
 * @param {number} id a lineage id
 * @returns {number} the id's index among the first `count` entries, or -1
 */
function indexOfId(table, id) {
    for (let i = 0; i < table.count; i++) {
        if (table.ids[i] === id) {
            return i;
        }
    }
    return -1;
}

/**
 * Marks the year's snapshot lineage as hunted when one of its bearers was eaten.
 * @param {Record<string, any>} scene the proof scene
 * @param {{cause: number, lineageId: number}} death a dead agent's cause and lineage
 * @returns {void}
 */
export function noteProofKill(scene, { cause, lineageId }) {
    if (cause !== DEATH_CAUSE.EATEN) {
        return;
    }
    const at = indexOfId(scene.year, lineageId);
    if (at >= 0) {
        scene.year.hunted[at] = 1;
    }
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} lineageId a lineage id
 * @returns {boolean} whether an agent of the lineage is alive
 */
function lineageAlive(world, lineageId) {
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1 && world.lineageId[slot] === lineageId) {
            return true;
        }
    }
    return false;
}

/**
 * Fills a table with the lineages that have an established alive member, each once.
 * @param {Record<string, any>} world the world
 * @param {{ids: Float64Array, count: number, hunted?: Uint8Array}} table the table
 * @returns {void}
 */
function snapshot(world, table) {
    table.count = 0;
    table.hunted?.fill(0);
    for (let slot = 0; slot < world.alive.length; slot++) {
        const id = world.lineageId[slot];
        if (world.alive[slot] === 1 && isEstablished(world, slot) && indexOfId(table, id) < 0) {
            table.ids[table.count++] = id;
        }
    }
}

/**
 * Adds one sample: the share of the first `count` lineages of a table (those `keep` allows) with an alive member.
 * @param {Record<string, any>} scene the proof scene
 * @param {Record<string, any>} world the world
 * @param {{ids: Float64Array, count: number, hunted?: Uint8Array}} table the table
 * @returns {void}
 */
function sample(scene, world, table) {
    let total = 0;
    let alive = 0;
    for (let i = 0; i < table.count; i++) {
        if (table.hunted === undefined || table.hunted[i] === 1) {
            total += 1;
            alive += lineageAlive(world, table.ids[i]) ? 1 : 0;
        }
    }
    if (total > 0) {
        scene.shareSum += alive / total;
        scene.samples += 1;
    }
}

/**
 * Runs the season boundaries: the winter sample at the start of spring, the hunted-year sample at the start of the next
 * year, and the snapshots that begin at the start of winter and of a year. Does nothing before burn-in.
 * @param {Record<string, any>} scene the proof scene
 * @param {Record<string, any>} world the world after a step
 * @returns {void}
 */
function trackSeasons(scene, world) {
    const { eraSeasonTicks } = world.config;
    if (world.tick < BURN_IN_TICKS || eraSeasonTicks <= 0 || world.tick % eraSeasonTicks !== 0) {
        return;
    }
    const season = world.season[0];
    if (season === 0) {
        sample(scene, world, scene.winter);
        scene.winter.count = 0;
        sample(scene, world, scene.year);
        snapshot(world, scene.year);
    } else if (season === WINTER) {
        snapshot(world, scene.winter);
    }
}

/**
 * Copies the alive slots' proof flags (the end-of-tick state a death reads next tick) and runs the season boundaries.
 * @param {Record<string, any>} scene the proof scene
 * @param {Record<string, any>} world the world after a step
 * @returns {void}
 */
export function trackProof(scene, world) {
    for (let slot = 0; slot < world.alive.length; slot++) {
        const alive = world.alive[slot] === 1;
        scene.proven[slot] = alive ? world.proven[slot] : 0;
        scene.established[slot] = alive && isEstablished(world, slot) ? 1 : 0;
    }
    trackSeasons(scene, world);
}

/**
 * @param {Record<string, any>} scene the proof scene
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the three proof metrics
 */
export function proofMetrics(scene) {
    const deaths = scene.deaths > 0;
    const reason = 'no death after burn-in';
    return {
        'eval.proven_share': deaths ? ok(scene.provenDeaths / scene.deaths) : none(reason),
        'eval.established_share': deaths ? ok(scene.establishedDeaths / scene.deaths) : none(reason),
        'eval.lineage_persistence':
            scene.samples > 0
                ? ok(scene.shareSum / scene.samples)
                : none('no established lineage at a winter start or in a hunted year after burn-in'),
    };
}
