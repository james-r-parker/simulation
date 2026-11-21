// Level-filtered sim log: records go to an injected sink, and event-ring records become named log events.

import { EVENT_BY_CODE, EVENT_FIELDS_AT, EVENT_STRIDE, EVENT_TICK, readEvents } from './events.js';
import { LOG_RULES } from './log-rules.js';

/** Log levels by severity; a record is kept when its value is at least the log's level. */
export const LOG_LEVEL = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

/** The rule of an event the log copies field for field. */
const NO_RULE = Object.freeze({});

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
 * Builds the keys one record writes: its tick, then each field in order (decoded, expanded or left out as its rule says).
 * @param {import('./events.js').EventDef} def the event
 * @param {import('./log-rules.js').LogRule} rule how the log writes it
 * @param {Float64Array} d ring data
 * @param {number} o record offset
 * @returns {Record<string, any>} the log fields
 */
function writtenFields(def, rule, d, o) {
    /** @type {Record<string, any>} */
    const written = { tick: d[o + EVENT_TICK] };
    for (let i = 0; i < def.fields.length; i++) {
        const field = def.fields[i];
        const value = d[o + EVENT_FIELDS_AT + i];
        if (rule.hidden?.includes(field)) {
            continue;
        }
        const expand = rule.expand?.[field];
        if (expand === undefined) {
            written[field] = rule.decode?.[field]?.(value) ?? value;
        } else {
            Object.assign(written, expand(value, written));
        }
    }
    return written;
}

/**
 * Writes one record of the event ring: the log event of its type, and the records its rule adds.
 * @param {SimLog} log the log
 * @param {import('./events.js').EventDef} def the event
 * @param {Float64Array} d ring data
 * @param {number} o record offset
 * @returns {void}
 */
function emit(log, def, d, o) {
    const rule = LOG_RULES[def.name] ?? NO_RULE;
    const written = writtenFields(def, rule, d, o);
    log.log(def.level, /** @type {string} */ (def.log), written);
    for (const extra of rule.also?.(written, d, o) ?? []) {
        log.log(extra.level, extra.event, extra.fields);
    }
}

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
        const def = EVENT_BY_CODE[d[o]];
        if (def === undefined || def.log === null) {
            throw new Error(`drainEvents: unknown event type ${d[o]} at record ${i}`);
        }
        if (LOG_LEVEL[def.level] >= min) {
            emit(log, def, d, o);
        }
    }
}
