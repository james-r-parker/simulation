// The query-string parameters the page reads: seed, agents, speed, quality, scale, look, tv, audio, policy and merit. A value that is missing or
// invalid is ignored (null, or false for a flag), never an error: a bad link still opens the app.

import { TICKS_PER_SECOND_CHOICES } from '../worker/protocol.js';
import { appLog } from './app-log.js';
import { LOOK_ALL, LOOK_ITEMS, parseLook } from './renderer/quality.js';

/** The most agents `?agents=` accepts. */
export const MAX_AGENTS_PARAM = 4096;

/**
 * @typedef {object} Params
 * @property {number | null} seed an unsigned 32-bit integer
 * @property {number | null} agents the starting agent count, 1 to `MAX_AGENTS_PARAM`
 * @property {number | null} speed a multiple of 60 ticks a second: 0.25, 0.5, 1, 2, 4, 8 or 16
 * @property {0 | 1 | 2 | null} quality a pinned quality level
 * @property {number | null} scale a pinned render scale, 0.25 to 1
 * @property {number} look the Phase 6 look items that draw, a mask over `LOOK_ITEMS`; `LOOK_ALL` by default
 * @property {boolean} tv TV mode: HUD hidden, director running, wake lock on
 * @property {boolean} audio start with audio on
 * @property {string | null} policy a registered policy name to preview (dev switch); the worker rejects an unknown one
 * @property {boolean} merit preview in-world merit with the `MERIT_PREVIEW` settings (dev switch)
 */

/**
 * The merit settings `?merit=1` previews: the `MERIT_ON` bench row of fitness-and-selection T25, before Phase 4 tunes
 * them. Kept in step with `scripts/bench.mjs` by hand, since the page cannot import scripts.
 */
export const MERIT_PREVIEW = Object.freeze({
    meritEnabled: true,
    meritMateWeight: 0.05,
    meritBirthBoost: 0.25,
    splitDeliberateMin: 200,
});

/**
 * @param {string | null} text a parameter value
 * @returns {number | null} the unsigned integer it spells, else null
 */
function uintOf(text) {
    return text !== null && /^\d{1,10}$/.test(text) ? Number(text) : null;
}

/**
 * @param {string | null} text a flag value
 * @returns {boolean} whether it is `1` or `true`
 */
function flagOf(text) {
    return text === '1' || text === 'true';
}

/**
 * @param {string | null} text the `policy` value
 * @returns {string | null} the name when it is a lower-case word of letters, digits and hyphens, else null
 */
function policyOf(text) {
    return text !== null && /^[a-z0-9][a-z0-9-]{0,63}$/.test(text) ? text : null;
}

/**
 * @param {number | null} n a parsed value
 * @param {number} min the lowest valid value
 * @param {number} max the highest valid value
 * @returns {number | null} `n` when it is in range, else null
 */
function inRange(n, min, max) {
    return n !== null && n >= min && n <= max ? n : null;
}

/**
 * @param {string | null} text the `speed` value
 * @returns {number | null} the multiple it spells when it is one of the speeds the worker accepts
 */
function speedOf(text) {
    const speed = text !== null && /^\d*\.?\d+$/.test(text) ? Number(text) : null;
    return speed !== null && TICKS_PER_SECOND_CHOICES.includes(speed * 60) ? speed : null;
}

/**
 * @param {string | null} text the `scale` value
 * @returns {number | null} the render scale it spells when it is from 0.25 to 1
 */
function scaleOf(text) {
    const scale = text !== null && /^\d*\.?\d+$/.test(text) ? Number(text) : null;
    return scale !== null && scale >= 0.25 && scale <= 1 ? scale : null;
}

/**
 * @param {string | null} text the `look` value
 * @returns {number} the mask it names; `LOOK_ALL` when it is missing, and when it names an unknown item (logged as
 *   `LookParamIgnored` with the allowed list)
 */
function lookOf(text) {
    if (text === null) {
        return LOOK_ALL;
    }
    const mask = parseLook(text);
    if (mask === null) {
        appLog('warn', 'LookParamIgnored', { value: text, allowed: ['all', 'none', ...LOOK_ITEMS].join(',') });
        return LOOK_ALL;
    }
    return mask;
}

/**
 * @param {string} search the query string, e.g. `location.search`
 * @returns {Params} the validated parameters
 */
export function readParams(search) {
    const query = new URLSearchParams(search);
    const quality = inRange(uintOf(query.get('quality')), 0, 2);
    return {
        seed: inRange(uintOf(query.get('seed')), 0, 0xffffffff),
        agents: inRange(uintOf(query.get('agents')), 1, MAX_AGENTS_PARAM),
        speed: speedOf(query.get('speed')),
        quality: /** @type {0 | 1 | 2 | null} */ (quality),
        scale: scaleOf(query.get('scale')),
        look: lookOf(query.get('look')),
        tv: flagOf(query.get('tv')),
        audio: flagOf(query.get('audio')),
        policy: policyOf(query.get('policy')),
        merit: flagOf(query.get('merit')),
    };
}

/** The most agents the default world holds; `?agents=` above it raises `maxAgents` to match. */
const DEFAULT_MAX_AGENTS = 500;
/** The population floor of the default world. */
const DEFAULT_MIN_AGENTS = 100;

/**
 * @param {Params} params the validated parameters
 * @returns {Record<string, number | boolean>} the config overrides they imply: `agents` sets `initialAgents`, raises
 *   `maxAgents` when it exceeds the default and lowers `minAgents` when it is under the default, and `merit` adds
 *   `MERIT_PREVIEW`; empty when neither is given
 */
export function configOverrides({ agents, merit }) {
    const merited = merit ? MERIT_PREVIEW : {};
    if (agents === null) {
        return { ...merited };
    }
    return {
        initialAgents: agents,
        maxAgents: Math.max(DEFAULT_MAX_AGENTS, agents),
        minAgents: Math.min(DEFAULT_MIN_AGENTS, agents),
        ...merited,
    };
}
