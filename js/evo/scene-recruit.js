// Predator recruitment (honest-budgets T33a): does a newborn hunter become a hunter that replaces itself? The cohort is every
// hunter born at or after `BURN_IN_TICKS`, followed by genome id (never by slot, which the sim reuses) through maturity
// (`maturityTicks`), its first deliberate kill, its first birth and a hunter child that itself breeds. The shares divide by the
// hunters whose outcome is known: a hunter alive and under `maturityTicks` at the last tick is censored, counted neither as a
// survivor nor as a death. A hunter born with an unlisted source (an immigrant) is counted with the `floor` entrants.
//
// - `eval.recruit_cohort`, `eval.recruit_matured_hunters`: the cohort and the hunters of it that reached maturity.
// - `eval.recruit_censored_share`: the cohort alive and under `maturityTicks` at the last tick, over the cohort.
// - `eval.recruit_matured_share`: matured over the cohort that is not censored.
// - `eval.recruit_first_kill_share`, `eval.recruit_lineage_share`: of the matured, the share with a deliberate kill, and the
//   share with a hunter child that bred.
// - `eval.recruit_replaced_share.<source>`: of the matured of that birth source, the share that gave birth to any child.
// - `eval.hunter_starve_age_median`: the median age of the cohort hunters that starved.
// - `eval.hunter_lineage_extinctions`: a lineage whose last hunter died on a tick that left hunters of another lineage alive.
// - `eval.hunter_global_extinctions`: the `LastHunterDied` records (no hunter left in the world), after burn-in.
//
// Observer state outside `worldHash`; a birth or death appends one row to a growable log, and nothing is allocated per tick.

import { DEATH_CAUSE, EVENT_TYPE, EVENT, EVENT_TICK } from '../sim/events.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { createLog, ensureRoom } from './growable-log.js';
import { bySuffix, none, ok, quantile } from './metrics-stats.js';
import { cohortSource, hunterBirthParents } from './scene-recruit-source.js';

/** The birth sources the replaced share names, in order; the last also holds the entrants of an unlisted source. */
export const RECRUIT_SOURCES = Object.freeze(['mate-hunter-parent', 'split-hunter-parent', 'spec-flip', 'floor']);

const BRED = 1;
const CHILD_BRED = 2;
const KILLED = 4;
const ENDED = 8;
const NO_ROW = -1;

/**
 * @param {Readonly<Record<string, any>>} config the world's config (`maturityTicks`)
 * @returns {Record<string, any>} an empty recruit scene: one row per cohort hunter (source, parent rows, flag bits, end age), the
 *   rows by genome id, the lineage of each alive hunter, the hunters alive per lineage and the extinction counts
 */
export function createRecruitScene(config) {
    return {
        maturity: config.maturityTicks,
        log: createLog(['source', 'parentA', 'parentB', 'flags', 'endAge']),
        rows: 0,
        rowOf: new Map(),
        starved: createLog(['age']),
        starvedRows: 0,
        lineageOf: new Map(),
        lineageHunters: new Map(),
        alive: 0,
        pendingLineages: 0,
        lineageExtinctions: 0,
        globalExtinctions: 0,
    };
}

/**
 * Sets a flag on a cohort row; a first birth also tells the row's parents that a child of theirs bred.
 * @param {Record<string, any>} scene the recruit scene
 * @param {number} row the cohort row
 * @param {number} flag a flag bit
 * @returns {void}
 */
function setFlag(scene, row, flag) {
    const { log } = scene;
    const first = flag === BRED && (log.flags[row] & BRED) === 0;
    log.flags[row] |= flag;
    if (first) {
        for (const parent of [log.parentA[row], log.parentB[row]]) {
            if (parent !== NO_ROW) {
                log.flags[parent] |= CHILD_BRED;
            }
        }
    }
}

/**
 * Starts a hunter's lineage count, from any tick.
 * @param {Record<string, any>} scene the recruit scene
 * @param {number} genomeId the hunter
 * @param {number} lineage its lineage id
 * @returns {void}
 */
function startHunter(scene, genomeId, lineage) {
    scene.lineageOf.set(genomeId, lineage);
    scene.lineageHunters.set(lineage, (scene.lineageHunters.get(lineage) ?? 0) + 1);
    scene.alive += 1;
}

/**
 * Notes one `AgentBorn` record after the tick: a parent's first birth, then a hunter child joins the lineage counts and, from burn-in,
 * the cohort. A record whose slot holds another agent (born and died within the tick) is skipped, as its death record is.
 * @param {Record<string, any>} scene the recruit scene
 * @param {Record<string, any>} world the world
 * @param {Float64Array} d the event ring data
 * @param {number} o the record offset
 * @returns {void}
 */
export function noteRecruitBirth(scene, world, d, o) {
    const slot = d[o + EVENT.AGENT_BORN.SLOT];
    if (world.genomeId[slot] !== d[o + EVENT.AGENT_BORN.GENOME_ID]) {
        return;
    }
    const { parentA, parentB } = hunterBirthParents(scene, d, o);
    for (const parent of [parentA, parentB]) {
        if (parent !== NO_ROW) {
            setFlag(scene, parent, BRED);
        }
    }
    if (world.huntBySpec[d[o + EVENT.AGENT_BORN.SPEC]] !== 1) {
        return;
    }
    startHunter(scene, d[o + EVENT.AGENT_BORN.GENOME_ID], d[o + EVENT.AGENT_BORN.LINEAGE_ID]);
    if (d[o + EVENT_TICK] < BURN_IN_TICKS) {
        return;
    }
    const row = scene.rows++;
    ensureRoom(scene.log, row);
    const { log } = scene;
    log.source[row] = cohortSource(world.birthSource[slot]);
    log.parentA[row] = parentA;
    log.parentB[row] = parentB;
    scene.rowOf.set(d[o + EVENT.AGENT_BORN.GENOME_ID], row);
}

/**
 * Ends a hunter's lineage count; a lineage left with no hunter is pending until the tick ends.
 * @param {Record<string, any>} scene the recruit scene
 * @param {number} genomeId the dead hunter
 * @param {number} tick the tick of its death
 * @returns {void}
 */
function endHunter(scene, genomeId, tick) {
    const lineage = scene.lineageOf.get(genomeId);
    if (lineage === undefined) {
        return;
    }
    scene.lineageOf.delete(genomeId);
    scene.alive -= 1;
    const left = (scene.lineageHunters.get(lineage) ?? 1) - 1;
    if (left > 0) {
        scene.lineageHunters.set(lineage, left);
        return;
    }
    scene.lineageHunters.delete(lineage);
    scene.pendingLineages += tick >= BURN_IN_TICKS ? 1 : 0;
}

/**
 * Closes a cohort hunter's row with the age it died at, and logs a starvation age.
 * @param {Record<string, any>} scene the recruit scene
 * @param {Float64Array} d the event ring data
 * @param {number} o the `HunterLedger` record offset
 * @returns {void}
 */
function closeRow(scene, d, o) {
    const row = scene.rowOf.get(d[o + EVENT.HUNTER_LEDGER.GENOME_ID]);
    if (row === undefined) {
        return;
    }
    scene.log.endAge[row] = d[o + EVENT.HUNTER_LEDGER.AGE_TICKS];
    scene.log.flags[row] |= ENDED;
    if (Math.floor(d[o + EVENT.HUNTER_LEDGER.PACKED] / 8) % 8 === DEATH_CAUSE.STARVED) {
        ensureRoom(scene.starved, scene.starvedRows);
        scene.starved.age[scene.starvedRows++] = d[o + EVENT.HUNTER_LEDGER.AGE_TICKS];
    }
}

/**
 * Notes one event record when it is a hunter's first kill (`HunterKill`: genome id, age, kills so far), a hunter's death
 * (`HunterLedger`) or the last hunter's death (`LastHunterDied`).
 * @param {Record<string, any>} scene the recruit scene
 * @param {Float64Array} d the event ring data
 * @param {number} o the record offset
 * @returns {void}
 */
export function noteRecruitRecord(scene, d, o) {
    const type = d[o];
    if (type === EVENT_TYPE.HUNTER_KILL && d[o + EVENT.HUNTER_KILL.KILLS] === 1) {
        const row = scene.rowOf.get(d[o + EVENT.HUNTER_KILL.GENOME_ID]);
        if (row !== undefined) {
            scene.log.flags[row] |= KILLED;
        }
    } else if (type === EVENT_TYPE.HUNTER_LEDGER) {
        closeRow(scene, d, o);
        endHunter(scene, d[o + EVENT.HUNTER_LEDGER.GENOME_ID], d[o + EVENT_TICK]);
    } else if (type === EVENT_TYPE.LAST_HUNTER_DIED && d[o + EVENT_TICK] >= BURN_IN_TICKS) {
        scene.globalExtinctions += 1;
    }
}

/**
 * Ends a tick: the lineages that lost their last hunter are local extinctions when hunters of another lineage are alive
 * (the world's last hunters are the global extinction, counted from `LastHunterDied`).
 * @param {Record<string, any>} scene the recruit scene
 * @returns {void}
 */
export function tickRecruit(scene) {
    if (scene.pendingLineages > 0 && scene.alive > 0) {
        scene.lineageExtinctions += scene.pendingLineages;
    }
    scene.pendingLineages = 0;
}

/**
 * @param {Record<string, any>} scene the recruit scene
 * @param {Record<string, any>} world the world at the last tick; one without agents leaves every open row censored
 * @returns {Float64Array} each cohort row's age at its end: the age it died at, or the age of the hunter alive at the last tick
 */
function endAges(scene, world) {
    const ages = Float64Array.from(scene.log.endAge.subarray(0, scene.rows));
    for (let slot = 0; world.alive !== undefined && slot < world.alive.length; slot++) {
        const row = world.alive[slot] === 1 ? scene.rowOf.get(world.genomeId[slot]) : undefined;
        if (row !== undefined && (scene.log.flags[row] & ENDED) === 0) {
            ages[row] = world.ageTicks[slot];
        }
    }
    return ages;
}

/**
 * @param {Record<string, any>} scene the recruit scene
 * @param {Record<string, any>} world the world at the last tick
 * @returns {{matured: number, censored: number, killed: number, lineage: number, bredBySource: Float64Array, maturedBySource: Float64Array}} the
 *   funnel counts, over the matured hunters for the milestones
 */
function funnel(scene, world) {
    const ages = endAges(scene, world);
    const out = {
        matured: 0,
        censored: 0,
        killed: 0,
        lineage: 0,
        bredBySource: new Float64Array(RECRUIT_SOURCES.length),
        maturedBySource: new Float64Array(RECRUIT_SOURCES.length),
    };
    for (let row = 0; row < scene.rows; row++) {
        const flags = scene.log.flags[row];
        if (ages[row] < scene.maturity) {
            out.censored += (flags & ENDED) === 0 ? 1 : 0;
            continue;
        }
        const source = scene.log.source[row];
        out.matured += 1;
        out.killed += (flags & KILLED) !== 0 ? 1 : 0;
        out.lineage += (flags & CHILD_BRED) !== 0 ? 1 : 0;
        out.maturedBySource[source] += 1;
        out.bredBySource[source] += (flags & BRED) !== 0 ? 1 : 0;
    }
    return out;
}

/**
 * @param {number} count a count
 * @param {number} whole its denominator
 * @param {string} reason why there is none
 * @returns {import('./metrics-stats.js').MetricResult} the share, or null with the reason when the denominator is 0
 */
function shareOf(count, whole, reason) {
    return whole > 0 ? ok(count / whole) : none(reason);
}

const NO_COHORT = 'no hunter born after burn-in';
const NO_MATURED = 'no cohort hunter reached maturity';

/**
 * @param {Record<string, any>} scene the recruit scene
 * @param {Record<string, any>} world the world at the last tick; one without agents leaves the living hunters censored
 * @returns {import('./metrics-stats.js').MetricRecord} the cohort and extinction metrics
 */
export function recruitMetrics(scene, world) {
    const f = funnel(scene, world);
    const cohort = scene.rows;
    const starve =
        scene.starvedRows > 0
            ? ok(quantile(scene.starved.age.subarray(0, scene.starvedRows), 0.5))
            : none('no cohort hunter starved');
    return {
        'eval.recruit_cohort': cohort > 0 ? ok(cohort) : none(NO_COHORT),
        'eval.recruit_matured_hunters': cohort > 0 ? ok(f.matured) : none(NO_COHORT),
        'eval.recruit_censored_share': shareOf(f.censored, cohort, NO_COHORT),
        'eval.recruit_matured_share': shareOf(
            f.matured,
            cohort - f.censored,
            'every cohort hunter is a living juvenile',
        ),
        'eval.recruit_first_kill_share': shareOf(f.killed, f.matured, NO_MATURED),
        'eval.recruit_lineage_share': shareOf(f.lineage, f.matured, NO_MATURED),
        ...bySuffix('eval.recruit_replaced_share', RECRUIT_SOURCES, (i) =>
            shareOf(f.bredBySource[i], f.maturedBySource[i], NO_MATURED),
        ),
        'eval.hunter_starve_age_median': starve,
        'eval.hunter_lineage_extinctions': ok(scene.lineageExtinctions),
        'eval.hunter_global_extinctions': ok(scene.globalExtinctions),
    };
}

/** @type {import('./observer-detectors.js').Detector} */
export const recruitDetector = {
    name: 'recruit',
    modules: ['js/evo/scene-recruit.js'],
    atStart: true,
    create: (config) => createRecruitScene(config),
    on: {
        HUNTER_KILL: (scene, world, o) => noteRecruitRecord(scene, world.events.data, o),
        HUNTER_LEDGER: (scene, world, o) => noteRecruitRecord(scene, world.events.data, o),
        LAST_HUNTER_DIED: (scene, world, o) => noteRecruitRecord(scene, world.events.data, o),
        AGENT_BORN: (scene, world, o) => noteRecruitBirth(scene, world, world.events.data, o),
    },
    onTick: (scene) => tickRecruit(scene),
    metrics: (scene, world) => recruitMetrics(scene, world),
};
