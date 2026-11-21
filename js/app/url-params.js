// The query-string parameters the page reads: seed, agents, speed, backend, gputime, tv, dim, board, reel, audio, policy, merit, hold and config. A value that is missing or
// invalid is ignored (null, or false for a flag), never an error: a bad link still opens the app.

import { TICKS_PER_SECOND_CHOICES } from '../worker/protocol.js';
import { DIM_MIN } from './prefs.js';

/** The most agents `?agents=` accepts. */
export const MAX_AGENTS_PARAM = 4096;

/**
 * @typedef {object} Params
 * @property {number | null} seed an unsigned 32-bit integer
 * @property {number | null} agents the starting agent count, 1 to `MAX_AGENTS_PARAM`
 * @property {number | null} speed a multiple of 60 ticks a second: 0.25, 0.5, 1, 2, 4, 8 or 16
 * @property {'webgpu' | 'webgl2' | null} backend a forced GPU backend; null lets the stage choose
 * @property {boolean} gputime record GPU frame times through timestamp queries
 * @property {boolean} tv TV mode: HUD hidden, director running, wake lock on
 * @property {boolean} board start with the insights drawer open as a full-screen board, the world small in a corner
 * @property {boolean} reel frame each scene moment of the reel by following its subject (`npm run reel`, dev switch)
 * @property {'auto' | number | null} dim the night dim: `auto`, or a fixed brightness from 0.3 to 1; null leaves it to the
 *   `dim` preference
 * @property {boolean} audio start with audio on
 * @property {string | null} policy a registered policy name to preview (dev switch); the worker rejects an unknown one
 * @property {boolean} merit preview in-world merit with the `MERIT_PREVIEW` settings (dev switch)
 * @property {Record<string, number | boolean> | null} config config overrides from a base64url-encoded JSON object of numbers
 *   and booleans (`npm run reel --config`, dev switch); the parameters above that set a config value win over it
 * @property {boolean} hold keep the population at `agents`: the floor refills to it whenever it drops below, so a
 *   timing run (`perf:browser`) draws that many bodies for its whole window (dev switch)
 */

/**
 * The merit settings `?merit=1` previews: the `MERIT_ON` bench row of fitness-and-selection T25, before Phase 4 tunes
 * them. Kept in step with `scripts/bench.mjs` by hand, since the page cannot import scripts.
 */
export const MERIT_PREVIEW = Object.freeze({
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
 * @param {string | null} text the `dim` value
 * @returns {'auto' | number | null} `auto`, or the level when it is a decimal from `DIM_MIN` to 1, else null
 */
function dimOf(text) {
    if (text === 'auto') {
        return 'auto';
    }
    return text !== null && /^\d*\.?\d+$/.test(text) ? inRange(Number(text), DIM_MIN, 1) : null;
}

/**
 * @param {string | null} text the `policy` value
 * @returns {string | null} the name when it is a lower-case word of letters, digits and hyphens, else null
 */
function policyOf(text) {
    return text !== null && /^[a-z0-9][a-z0-9-]{0,63}$/.test(text) ? text : null;
}

/** The most characters and keys a `config` parameter holds. */
const CONFIG_MAX_CHARS = 4000;
const CONFIG_MAX_KEYS = 64;

/**
 * @param {unknown} value a parsed JSON value
 * @returns {boolean} whether it is a non-empty object, at most `CONFIG_MAX_KEYS` long, of booleans and finite numbers
 */
function isConfigObject(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    const values = Object.values(value);
    const plain = values.every((v) => typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)));
    return values.length > 0 && values.length <= CONFIG_MAX_KEYS && plain;
}

/**
 * @param {string | null} text the `config` value: base64url of a JSON object
 * @returns {Record<string, number | boolean> | null} the object when every value is a finite number or a boolean, else null
 */
function configOf(text) {
    if (text === null || text.length > CONFIG_MAX_CHARS || !/^[A-Za-z0-9_-]+$/.test(text)) {
        return null;
    }
    try {
        const parsed = JSON.parse(atob(text.replace(/-/g, '+').replace(/_/g, '/')));
        return isConfigObject(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * A normal link with a bad `config` still opens the default world; a reel run must not silently measure the wrong one.
 * @param {string} search the query string, e.g. `location.search`
 * @returns {string | null} a message naming the `config` parameter when `reel=1` carries one that does not parse, else null
 */
export function reelConfigError(search) {
    const query = new URLSearchParams(search);
    if (!flagOf(query.get('reel')) || !query.has('config') || configOf(query.get('config')) !== null) {
        return null;
    }
    return 'The config parameter is not base64url of a non-empty JSON object of numbers and booleans, so the reel will not run.';
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
 * @param {string | null} text the `backend` value
 * @returns {'webgpu' | 'webgl2' | null} the backend it names, null for anything else
 */
function backendOf(text) {
    return text === 'webgpu' || text === 'webgl2' ? text : null;
}

/**
 * @param {string} search the query string, e.g. `location.search`
 * @returns {Params} the validated parameters
 */
export function readParams(search) {
    const query = new URLSearchParams(search);
    return {
        seed: inRange(uintOf(query.get('seed')), 0, 0xffffffff),
        agents: inRange(uintOf(query.get('agents')), 1, MAX_AGENTS_PARAM),
        speed: speedOf(query.get('speed')),
        backend: backendOf(query.get('backend')),
        gputime: flagOf(query.get('gputime')),
        tv: flagOf(query.get('tv')),
        dim: dimOf(query.get('dim')),
        board: flagOf(query.get('board')),
        reel: flagOf(query.get('reel')),
        audio: flagOf(query.get('audio')),
        policy: policyOf(query.get('policy')),
        merit: flagOf(query.get('merit')),
        hold: flagOf(query.get('hold')),
        config: configOf(query.get('config')),
    };
}

/** The most agents the default world holds; `?agents=` above it raises `maxAgents` to match. */
const DEFAULT_MAX_AGENTS = 500;
/** The population floor of the default world. */
const DEFAULT_MIN_AGENTS = 100;

/**
 * @param {Params} params the validated parameters
 * @returns {Record<string, number | boolean>} the config overrides they imply: `agents` sets `initialAgents`, raises
 *   `maxAgents` when it exceeds the default and lowers `minAgents` when it is under the default; `hold` with `agents`
 *   sets the floor (`minAgents` and `floorTrigger`) to `agents`; `merit` adds `MERIT_PREVIEW`; `config` is the base, which the others override; empty when none is given
 */
export function configOverrides({ agents, merit, hold, config }) {
    const merited = merit ? MERIT_PREVIEW : {};
    if (agents === null) {
        return { ...config, ...merited };
    }
    /** @type {Record<string, number>} */
    const floor = hold
        ? { minAgents: agents, floorTrigger: agents }
        : { minAgents: Math.min(DEFAULT_MIN_AGENTS, agents) };
    return {
        ...config,
        initialAgents: agents,
        maxAgents: Math.max(DEFAULT_MAX_AGENTS, agents),
        ...floor,
        ...merited,
    };
}
