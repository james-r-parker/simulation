// Level-filtered sim log: records go to an injected sink, and event-ring records become named log events.

import { EVENT_STRIDE, EVENT_TYPE, readEvents } from './events.js';

/** Log levels by severity; a record is kept when its value is at least the log's level. */
export const LOG_LEVEL = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

const BORN_NAMES = Object.freeze(['initial', 'mate', 'split', 'floor', 'immigrant']);
const DIED_NAMES = Object.freeze(['starved', 'eaten', 'collision', 'old-age', 'poisoned', 'trampled']);
const SEED_REFUSED_NAMES = Object.freeze(['pool', 'cooldown', 'placement']);
const BLOCKED_NAMES = Object.freeze(['capacity', 'energy']);

/**
 * @typedef {object} SimLog
 * @property {keyof typeof LOG_LEVEL} level the minimum level kept
 * @property {(level: keyof typeof LOG_LEVEL, event: string, fields?: Record<string, any>) => void} log
 */

/**
 * Looks a level name up, throwing on an unknown one.
 * @param {string} name a `LOG_LEVEL` key
 * @returns {number} the level's severity
 */
function levelValue(name) {
    if (!Object.hasOwn(LOG_LEVEL, name)) {
        throw new Error(`log: unknown level "${name}", expected one of ${Object.keys(LOG_LEVEL).join(', ')}`);
    }
    return LOG_LEVEL[/** @type {keyof typeof LOG_LEVEL} */ (name)];
}

/**
 * Creates a logger that passes `{ level, event, ...fields }` to the sink for records at or above `level`.
 * @param {(record: Record<string, any>) => void} sink receives each kept record
 * @param {{ level?: keyof typeof LOG_LEVEL }} [options] the minimum level, default `info`
 * @returns {SimLog}
 */
export function createSimLog(sink, { level = 'info' } = {}) {
    const min = levelValue(level);
    return {
        level,
        log(recordLevel, event, fields) {
            if (levelValue(recordLevel) >= min) {
                sink({ level: recordLevel, event, ...fields });
            }
        },
    };
}

/**
 * Names a cause code, throwing on one outside the table.
 * @param {readonly string[]} names cause names indexed by code
 * @param {number} code the stored cause code
 * @param {string} event the event the code belongs to
 * @returns {string} the cause name
 */
function causeName(names, code, event) {
    const name = names[code];
    if (name === undefined) {
        throw new Error(`drainEvents: ${event} has unknown cause code ${code}`);
    }
    return name;
}

/**
 * Emits one `AgentBorn` event.
 * @param {SimLog} log the log
 * @param {Float64Array} d ring data
 * @param {number} o record offset
 * @returns {void}
 */
function emitBorn(log, d, o) {
    log.log('debug', 'AgentBorn', {
        tick: d[o + 1],
        slot: d[o + 2],
        genomeId: d[o + 3],
        lineageId: d[o + 4],
        spec: d[o + 5],
        parentA: d[o + 6],
        parentB: d[o + 7],
        cause: causeName(BORN_NAMES, d[o + 8], 'AgentBorn'),
    });
}

/**
 * Emits one `AgentDied` event.
 * @param {SimLog} log the log
 * @param {Float64Array} d ring data
 * @param {number} o record offset
 * @returns {void}
 */
function emitDied(log, d, o) {
    log.log('debug', 'AgentDied', {
        tick: d[o + 1],
        slot: d[o + 2],
        genomeId: d[o + 3],
        cause: causeName(DIED_NAMES, d[o + 4], 'AgentDied'),
        by: d[o + 5],
        spec: d[o + 6],
        lineageId: d[o + 7],
        ageTicks: d[o + 8],
        foodEnergy: d[o + 9],
        biteEnergy: d[o + 10],
        prevBiter: d[o + 11],
    });
}

/**
 * Emits one `BirthBlocked` event.
 * @param {SimLog} log the log
 * @param {Float64Array} d ring data
 * @param {number} o record offset
 * @returns {void}
 */
function emitBlocked(log, d, o) {
    log.log('warn', 'BirthBlocked', {
        tick: d[o + 1],
        slot: d[o + 2],
        cause: causeName(BLOCKED_NAMES, d[o + 3], 'BirthBlocked'),
    });
}

/**
 * Emits one `PopulationFloor` event, and the `FloorGuard` record beside it (the population before the refill and
 * the agents spawned).
 * @param {SimLog} log the log
 * @param {Float64Array} d ring data
 * @param {number} o record offset
 * @returns {void}
 */
function emitFloor(log, d, o) {
    log.log('info', 'PopulationFloor', { tick: d[o + 1], added: d[o + 2] });
    log.log('info', 'FloorGuard', { tick: d[o + 1], population: d[o + 3], spawned: d[o + 2] });
}

/**
 * @param {Float64Array} d ring data
 * @param {number} o record offset
 * @returns {{slot: number, genomeId: number, spec: number, x: number, y: number}} the caller fields of a call record
 */
function callerFields(d, o) {
    return { slot: d[o + 2], genomeId: d[o + 3], spec: d[o + 4], x: d[o + 5], y: d[o + 6] };
}

/**
 * Emits one `AlarmCalled` event.
 * @param {SimLog} log the log
 * @param {Float64Array} d ring data
 * @param {number} o record offset
 * @returns {void}
 */
function emitAlarm(log, d, o) {
    log.log('debug', 'AlarmCalled', { tick: d[o + 1], ...callerFields(d, o) });
}

/**
 * Emits one `PackCalled` event.
 * @param {SimLog} log the log
 * @param {Float64Array} d ring data
 * @param {number} o record offset
 * @returns {void}
 */
function emitPack(log, d, o) {
    log.log('debug', 'PackCalled', { tick: d[o + 1], ...callerFields(d, o) });
}

/**
 * Emits one `SmokeReleased` event.
 * @param {SimLog} log the log
 * @param {Float64Array} d ring data
 * @param {number} o record offset
 * @returns {void}
 */
function emitSmoke(log, d, o) {
    log.log('debug', 'SmokeReleased', { tick: d[o + 1], ...callerFields(d, o), cloud: d[o + 7] });
}

/**
 * Emits one `SmokeRefused` event.
 * @param {SimLog} log the log
 * @param {Float64Array} d ring data
 * @param {number} o record offset
 * @returns {void}
 */
function emitRefused(log, d, o) {
    log.log('debug', 'SmokeRefused', { tick: d[o + 1], slot: d[o + 2], genomeId: d[o + 3] });
}

/**
 * Emits one `FoodPatchesCreated` event.
 * @param {SimLog} log the log
 * @param {Float64Array} d ring data
 * @param {number} o record offset
 * @returns {void}
 */
function emitPatches(log, d, o) {
    log.log('info', 'FoodPatchesCreated', { tick: d[o + 1], count: d[o + 2], radius: d[o + 3] });
}

/**
 * Emits one `SeasonChanged` event.
 * @param {SimLog} log the log
 * @param {Float64Array} d ring data
 * @param {number} o record offset
 * @returns {void}
 */
function emitSeason(log, d, o) {
    log.log('info', 'SeasonChanged', { tick: d[o + 1], season: d[o + 2], year: d[o + 3] });
}

/**
 * Emits one `DroughtStarted` event.
 * @param {SimLog} log the log
 * @param {Float64Array} d ring data
 * @param {number} o record offset
 * @returns {void}
 */
function emitDrought(log, d, o) {
    log.log('info', 'DroughtStarted', { tick: d[o + 1], basin: d[o + 2], year: d[o + 3] });
}

/**
 * Emits one `MeritSummary` event.
 * @param {SimLog} log the log
 * @param {Float64Array} d ring data
 * @param {number} o record offset
 * @returns {void}
 */
function emitMeritSummary(log, d, o) {
    log.log('debug', 'MeritSummary', {
        tick: d[o + 1],
        meritMean: d[o + 2],
        meritP90: d[o + 3],
        readyToSplit: d[o + 4],
        gatedSplits: d[o + 5],
        deliberateReadyShare: d[o + 6],
    });
}

/**
 * Emits one `LineProven` event: a child proved itself, so its parents' line is established.
 * @param {SimLog} log the log
 * @param {Float64Array} d ring data
 * @param {number} o record offset
 * @returns {void}
 */
function emitLineProven(log, d, o) {
    log.log('debug', 'LineProven', {
        tick: d[o + 1],
        slot: d[o + 2],
        genomeId: d[o + 3],
        parentA: d[o + 4],
        parentB: d[o + 5],
        lineageId: d[o + 6],
    });
}

/**
 * @param {SimLog} log the log
 * @param {Float64Array} d event data
 * @param {number} o event offset
 * @returns {void}
 */
function emitSickened(log, d, o) {
    log.log('debug', 'AgentSickened', { tick: d[o + 1], slot: d[o + 2], genomeId: d[o + 3], dose: d[o + 4] });
}

/**
 * @param {SimLog} log the log
 * @param {Float64Array} d event data
 * @param {number} o event offset
 * @returns {void}
 */
function emitPatchDied(log, d, o) {
    log.log('debug', 'PatchDied', { tick: d[o + 1], patch: d[o + 2], species: d[o + 3] });
}

/**
 * @param {SimLog} log the log
 * @param {Float64Array} d event data
 * @param {number} o event offset
 * @returns {void}
 */
function emitPatchSeeded(log, d, o) {
    log.log('debug', 'PatchSeeded', {
        tick: d[o + 1],
        species: d[o + 2],
        patch: d[o + 3],
        parentA: d[o + 4],
        parentB: d[o + 5],
        hue: d[o + 6],
        x: d[o + 7],
        y: d[o + 8],
    });
}

/**
 * @param {SimLog} log the log
 * @param {Float64Array} d event data
 * @param {number} o event offset
 * @returns {void}
 */
function emitSeedingRefused(log, d, o) {
    log.log('debug', 'SeedingRefused', {
        tick: d[o + 1],
        species: d[o + 2],
        reason: causeName(SEED_REFUSED_NAMES, d[o + 3], 'SeedingRefused'),
    });
}

/** @param {SimLog} log @param {Float64Array} d @param {number} o @returns {void} */
function emitHerdRouteChanged(log, d, o) {
    log.log('debug', 'HerdRouteChanged', { tick: d[o + 1], group: d[o + 2], patch: d[o + 3] });
}

/** @param {SimLog} log @param {Float64Array} d @param {number} o @returns {void} */
function emitHerdStampede(log, d, o) {
    log.log('debug', 'HerdStampede', { tick: d[o + 1], group: d[o + 2], hunter: d[o + 3], animals: d[o + 4] });
}

/** Emitter and level per event type; the level lets a record be skipped before any object is built. */
/** @type {Readonly<Record<number, { level: number, emit: (log: SimLog, d: Float64Array, o: number) => void }>>} */
const EMITTERS = Object.freeze({
    [EVENT_TYPE.AGENT_BORN]: { level: LOG_LEVEL.debug, emit: emitBorn },
    [EVENT_TYPE.AGENT_DIED]: { level: LOG_LEVEL.debug, emit: emitDied },
    [EVENT_TYPE.BIRTH_BLOCKED]: { level: LOG_LEVEL.warn, emit: emitBlocked },
    [EVENT_TYPE.POPULATION_FLOOR]: { level: LOG_LEVEL.info, emit: emitFloor },
    [EVENT_TYPE.ALARM_CALLED]: { level: LOG_LEVEL.debug, emit: emitAlarm },
    [EVENT_TYPE.SMOKE_RELEASED]: { level: LOG_LEVEL.debug, emit: emitSmoke },
    [EVENT_TYPE.PACK_CALLED]: { level: LOG_LEVEL.debug, emit: emitPack },
    [EVENT_TYPE.SMOKE_REFUSED]: { level: LOG_LEVEL.debug, emit: emitRefused },
    [EVENT_TYPE.FOOD_PATCHES_CREATED]: { level: LOG_LEVEL.info, emit: emitPatches },
    [EVENT_TYPE.SEASON_CHANGED]: { level: LOG_LEVEL.info, emit: emitSeason },
    [EVENT_TYPE.DROUGHT_STARTED]: { level: LOG_LEVEL.info, emit: emitDrought },
    [EVENT_TYPE.MERIT_SUMMARY]: { level: LOG_LEVEL.debug, emit: emitMeritSummary },
    [EVENT_TYPE.LINE_PROVEN]: { level: LOG_LEVEL.debug, emit: emitLineProven },
    [EVENT_TYPE.PATCH_SEEDED]: { level: LOG_LEVEL.debug, emit: emitPatchSeeded },
    [EVENT_TYPE.SEEDING_REFUSED]: { level: LOG_LEVEL.debug, emit: emitSeedingRefused },
    [EVENT_TYPE.PATCH_DIED]: { level: LOG_LEVEL.debug, emit: emitPatchDied },
    [EVENT_TYPE.AGENT_SICKENED]: { level: LOG_LEVEL.debug, emit: emitSickened },
    [EVENT_TYPE.HERD_ROUTE_CHANGED]: { level: LOG_LEVEL.debug, emit: emitHerdRouteChanged },
    [EVENT_TYPE.HERD_STAMPEDE]: { level: LOG_LEVEL.debug, emit: emitHerdStampede },
});

/**
 * Turns the world's event-ring records into log events, in order. Call it after each step.
 * Records below the log's level are skipped without building any object.
 * @param {import('./world.js').World} world the world
 * @param {SimLog} log the log
 * @returns {void}
 */
export function drainEvents(world, log) {
    const min = levelValue(log.level);
    const count = readEvents(world.events);
    const d = world.events.data;
    for (let i = 0; i < count; i++) {
        const o = i * EVENT_STRIDE;
        const entry = EMITTERS[d[o]];
        if (entry === undefined) {
            throw new Error(`drainEvents: unknown event type ${d[o]} at record ${i}`);
        }
        if (entry.level >= min) {
            entry.emit(log, d, o);
        }
    }
}
