// Prey guild detectors (prey-guilds.md, Detectors): tracks post-burn-in guild headcount shares, mean lifespans
// relative to `maxAgeTicks`, active defender repels per 1,000 defender-ticks, scout alarm lead share (threats detected
// before a hunter closes within `callRadius * 0.5`), and reproducer share of births during post-bust recovery ticks
// (`population < 120`). Observer state only; zero per-tick allocations.

import { BORN_CAUSE, DEATH_CAUSE } from '../sim/events.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { metricName } from './metric-registry/index.js';
import { none, ok, per1k } from './metrics-stats.js';

const NO_SHARE_SAMPLE = 'no 100-tick checkpoint after burn-in';
const NO_GUILD_DEATH = 'no death of this guild after burn-in';
const NO_PREY_SELECTIVITY = 'no eaten prey death or prey checkpoint after burn-in';
const NO_DEFENDER_TICKS = 'no defender tick after burn-in';
const NO_SCOUT_ALARM = 'no scout alarm with a threat after burn-in';
const NO_RECOVERY_BIRTH = 'no birth during post-bust recovery after burn-in';

const GUILDS = /** @type {const} */ ([
    ['forager', 0],
    ['reproducer', 2],
    ['scout', 3],
    ['defender', 4],
]);

const RECOVERY_POP_FLOOR = 120;
const SCOUT_SPEC = 3;
const REPRODUCER_SPEC = 2;
const DEFENDER_SPEC = 4;

/** @param {Record<string, any>} scene the guild scene @param {number} idx the prey guild index */
function preySelectivity(scene, idx) {
    const preyShare = scene.preyShareSamples === 0 ? 0 : scene.preyShareSum[idx] / scene.preyShareSamples;
    return scene.totalEatenDeaths === 0 || preyShare === 0
        ? none(NO_PREY_SELECTIVITY)
        : ok(scene.eatenDeaths[idx] / scene.totalEatenDeaths / preyShare);
}

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} empty guild scene state
 */
export function createGuildScene(config) {
    return {
        maxAgeTicks: config.maxAgeTicks,
        callRadius: config.callRadius,
        shareSum: new Float64Array(5),
        shareSamples: 0,
        preyShareSum: new Float64Array(5),
        preyShareSamples: 0,
        eatenDeaths: new Uint32Array(5),
        totalEatenDeaths: 0,
        deathAgeSum: new Float64Array(5),
        deathCount: new Uint32Array(5),
        defenderTicks: 0,
        repelCount: 0,
        scoutThreatAlarms: 0,
        scoutLeadAlarms: 0,
        recoveryBirths: 0,
        recoveryReproducerBirths: 0,
        prevPop: config.initialAgents ?? 0,
    };
}

/**
 * Samples alive guild headcount shares after burn-in.
 * @param {Record<string, any>} scene the guild scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleGuilds(scene, world) {
    if (world.tick < BURN_IN_TICKS) {
        return;
    }
    const { alive, spec } = world;
    let total = 0;
    const counts = [0, 0, 0, 0, 0];
    for (let s = 0; s < alive.length; s++) {
        if (alive[s] === 1) {
            counts[spec[s]] += 1;
            total += 1;
        }
    }
    if (total === 0) {
        return;
    }
    for (const [, idx] of GUILDS) {
        scene.shareSum[idx] += counts[idx] / total;
    }
    scene.shareSamples += 1;
    const preyCount = total - counts[1];
    if (preyCount > 0) {
        for (const [, idx] of GUILDS) {
            scene.preyShareSum[idx] += counts[idx] / preyCount;
        }
        scene.preyShareSamples += 1;
    }
}

/**
 * Records one death's normalised lifespan for non-hunter guilds after burn-in.
 * @param {Record<string, any>} scene the guild scene
 * @param {{tick: number, spec: number, age: number, cause?: number}} death the death record
 * @returns {void}
 */
export function noteGuildDeath(scene, { tick, spec, age, cause }) {
    if (tick < BURN_IN_TICKS || spec === 1) {
        return;
    }
    scene.deathAgeSum[spec] += age / scene.maxAgeTicks;
    scene.deathCount[spec] += 1;
    if (cause === DEATH_CAUSE.EATEN) {
        scene.eatenDeaths[spec] += 1;
        scene.totalEatenDeaths += 1;
    }
}

/**
 * Records a birth during a post-bust recovery tick (`prevPop < RECOVERY_POP_FLOOR` after burn-in).
 * @param {Record<string, any>} scene the guild scene
 * @param {{tick: number, spec: number, cause: number}} birth the birth record
 * @returns {void}
 */
export function noteGuildBirth(scene, { tick, spec, cause }) {
    if (tick < BURN_IN_TICKS || (cause !== BORN_CAUSE.MATE && cause !== BORN_CAUSE.SPLIT)) {
        return;
    }
    if (scene.prevPop < RECOVERY_POP_FLOOR) {
        scene.recoveryBirths += 1;
        if (spec === REPRODUCER_SPEC) {
            scene.recoveryReproducerBirths += 1;
        }
    }
}

/**
 * Records a scout alarm call with a threat on its rays, checking whether the nearest hunter is still outside half `callRadius`.
 * @param {Record<string, any>} scene the guild scene
 * @param {Record<string, any>} world the world
 * @param {number} caller the calling slot
 * @returns {void}
 */
export function noteGuildAlarm(scene, world, caller) {
    if (world.tick < BURN_IN_TICKS || world.spec[caller] !== SCOUT_SPEC || world.alarmSeen[caller] !== 1) {
        return;
    }
    const leadDist = 0.5 * scene.callRadius;
    const leadSq = leadDist * leadDist;
    const cx = world.x[caller];
    const cy = world.y[caller];
    const { alive, spec, huntBySpec, x, y } = world;
    let close = false;
    for (let s = 0; s < alive.length; s++) {
        if (alive[s] !== 1 || huntBySpec[spec[s]] !== 1) {
            continue;
        }
        const dx = x[s] - cx;
        const dy = y[s] - cy;
        if (dx * dx + dy * dy < leadSq) {
            close = true;
            break;
        }
    }
    scene.scoutThreatAlarms += 1;
    if (!close) {
        scene.scoutLeadAlarms += 1;
    }
}

/**
 * Advances per-tick guild counters (`defenderTicks` and `prevPop`).
 * @param {Record<string, any>} scene the guild scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function tickGuilds(scene, world) {
    scene.prevPop = world.population;
    if (world.tick < BURN_IN_TICKS) {
        return;
    }
    const { alive, spec } = world;
    for (let s = 0; s < alive.length; s++) {
        if (alive[s] === 1 && spec[s] === DEFENDER_SPEC) {
            scene.defenderTicks += 1;
        }
    }
}

/**
 * @param {Record<string, any>} scene the guild scene
 * @returns {import('./metrics-stats.js').MetricRecord} the 11 prey-guild metrics
 */
export function guildMetrics(scene) {
    /** @type {import('./metrics-stats.js').MetricRecord} */
    const out = {};
    for (const [name, idx] of GUILDS) {
        out[metricName('eval.guild_share', name)] =
            scene.shareSamples === 0 ? none(NO_SHARE_SAMPLE) : ok(scene.shareSum[idx] / scene.shareSamples);
    }
    for (const [name, idx] of GUILDS) {
        out[metricName('eval.guild_survival', name)] =
            scene.deathCount[idx] === 0 ? none(NO_GUILD_DEATH) : ok(scene.deathAgeSum[idx] / scene.deathCount[idx]);
    }
    for (const [name, idx] of GUILDS) {
        out[metricName('eval.prey_selectivity', name)] = preySelectivity(scene, idx);
    }
    out['eval.defender_repel_per_1k'] =
        scene.defenderTicks === 0 ? none(NO_DEFENDER_TICKS) : per1k(scene.repelCount, scene.defenderTicks);
    out['eval.scout_alarm_lead_share'] =
        scene.scoutThreatAlarms === 0 ? none(NO_SCOUT_ALARM) : ok(scene.scoutLeadAlarms / scene.scoutThreatAlarms);
    out['eval.reproducer_recovery_rate'] =
        scene.recoveryBirths === 0
            ? none(NO_RECOVERY_BIRTH)
            : ok(scene.recoveryReproducerBirths / scene.recoveryBirths);
    return out;
}
