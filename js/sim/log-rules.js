// How the log writes the events that are not a plain copy of their fields: the cause names, the flags, the packed
// ledger word and the fields the log leaves out. `drainEvents` in `log.js` is the one emitter; this is its table.

import { BORN_CAUSES, DEATH_CAUSES, EVENT } from './events.js';

/**
 * @typedef {object} LogRule
 * @property {readonly string[]} [hidden] fields the log does not carry
 * @property {Record<string, (value: number) => any>} [decode] a field's value as the log writes it
 * @property {Record<string, (value: number, written: Record<string, any>) => Record<string, any>>} [expand] a field
 *   replaced, at its place, by the keys the function returns (`written` holds the keys before it)
 * @property {(written: Record<string, any>, d: Float64Array, o: number) => Array<{ level: 'debug' | 'info' | 'warn', event: string, fields: Record<string, any> }>} [also]
 *   further records the same event writes, after its own (`d` and `o` are the ring data and the record offset)
 */

const SOURCE_NAMES = Object.freeze([
    'initial',
    'mate',
    'split',
    'floor',
    'immigrant',
    'spec-flip',
    'mate-hunter-parent',
    'split-hunter-parent',
]);
const SEED_REFUSED_NAMES = Object.freeze(['pool', 'cooldown', 'near']);
const SEED_SOURCE_NAMES = Object.freeze(['pollen', 'herd']);
const BLOCKED_NAMES = Object.freeze(['capacity', 'energy']);
const BORN_NAMES = Object.freeze(BORN_CAUSES.map((cause) => cause.name));
const DIED_NAMES = Object.freeze(DEATH_CAUSES.map((cause) => cause.name));

/**
 * Names a cause code, throwing on one outside the table.
 * @param {readonly string[]} names cause names indexed by code
 * @param {number} code the stored cause code
 * @param {string} label the event the code belongs to, for the message
 * @returns {string} the cause name
 */
function causeName(names, code, label) {
    const name = names[code];
    if (name === undefined) {
        throw new Error(`drainEvents: ${label} has unknown cause code ${code}`);
    }
    return name;
}

/**
 * @param {readonly string[]} names cause names indexed by code
 * @param {string} label the event the code belongs to
 * @returns {(code: number) => string} a decoder from a stored code to its name
 */
const named = (names, label) => (code) => causeName(names, code, label);

/** @param {number} value a stored flag @returns {boolean} whether it is 1 */
const flag = (value) => value === 1;

/** The rule of each event that has one, by `EVENTS` name. */
export const LOG_RULES = Object.freeze(
    /** @type {Record<string, LogRule>} */ ({
        AGENT_BORN: { hidden: ['sex'], decode: { cause: named(BORN_NAMES, 'AgentBorn') } },
        AGENT_DIED: {
            hidden: ['size'],
            decode: { cause: named(DIED_NAMES, 'AgentDied') },
            expand: {
                partner: (value, written) => ({
                    prevBiter: written.cause === 'eaten' ? value : 0,
                    ...(written.cause === 'trampled' ? { pinned: value === 1 } : {}),
                }),
            },
        },
        BIRTH_BLOCKED: { decode: { cause: named(BLOCKED_NAMES, 'BirthBlocked') } },
        POPULATION_FLOOR: {
            hidden: ['population'],
            also: (written, d, o) => [
                {
                    level: 'info',
                    event: 'FloorGuard',
                    fields: {
                        tick: written.tick,
                        population: d[o + EVENT.POPULATION_FLOOR.POPULATION],
                        spawned: written.added,
                    },
                },
            ],
        },
        HERD_STAMPEDE: { hidden: ['x', 'y'] },
        HERD_ANIMAL_DIED: { decode: { old: flag } },
        SEEDING_REFUSED: {
            decode: {
                reason: named(SEED_REFUSED_NAMES, 'SeedingRefused'),
                source: named(SEED_SOURCE_NAMES, 'SeedingRefused source'),
            },
        },
        HUNTER_LEDGER: {
            expand: {
                packed: (packed) => ({
                    cause: causeName(DIED_NAMES, Math.floor(packed / 8) % 8, 'HunterLedger'),
                    birth: causeName(SOURCE_NAMES, packed % 8, 'HunterLedger'),
                    kills: Math.floor(packed / 64),
                }),
            },
        },
        LAST_HUNTER_DIED: { decode: { basin: (value) => (value === 0 ? 'west' : 'east') } },
        HUNTER_KILL: { decode: { dependent: flag } },
    }),
);
