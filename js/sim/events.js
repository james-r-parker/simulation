// Fixed-stride per-tick event ring: codes for births, deaths, blocked births, floor spawns, calls and smoke, and the push/read/clear helpers.

/** Number of Float64 fields per event record. */
export const EVENT_STRIDE = 13;

/** Worst-case number of events an agent can emit in one tick. */
export const MAX_EVENTS_PER_SLOT = 8;

/**
 * @typedef {object} EventDef
 * @property {number} code the event type, stored in field 0 of each record
 * @property {string} name the `UPPER_SNAKE` name; the key of `EVENT_TYPE` and `EVENT`
 * @property {string | null} log the log event's name, or null for a code the log never carries
 * @property {'debug' | 'info' | 'warn'} level the severity of the log record
 * @property {readonly string[]} fields the names of the positional fields from offset 2 (offset 0 is the type, offset 1
 *   the tick); a name is `lowerCamel`, and its offset is `EVENT[name].UPPER_SNAKE`
 */

/** @type {readonly EventDef[]} */
const DEFS = [
    {
        code: 1,
        name: 'AGENT_BORN',
        log: 'AgentBorn',
        level: 'debug',
        fields: ['slot', 'genomeId', 'lineageId', 'spec', 'parentA', 'parentB', 'cause', 'sex'],
    },
    {
        code: 2,
        name: 'AGENT_DIED',
        log: 'AgentDied',
        level: 'debug',
        fields: [
            'slot',
            'genomeId',
            'cause',
            'by',
            'spec',
            'lineageId',
            'ageTicks',
            'foodEnergy',
            'biteEnergy',
            'partner',
            'size',
        ],
    },
    { code: 3, name: 'BIRTH_BLOCKED', log: 'BirthBlocked', level: 'warn', fields: ['slot', 'cause'] },
    { code: 4, name: 'POPULATION_FLOOR', log: 'PopulationFloor', level: 'info', fields: ['added', 'population'] },
    {
        code: 5,
        name: 'ALARM_CALLED',
        log: 'AlarmCalled',
        level: 'debug',
        fields: ['slot', 'genomeId', 'spec', 'x', 'y'],
    },
    {
        code: 6,
        name: 'SMOKE_RELEASED',
        log: 'SmokeReleased',
        level: 'debug',
        fields: ['slot', 'genomeId', 'spec', 'x', 'y', 'cloud'],
    },
    { code: 7, name: 'PACK_CALLED', log: 'PackCalled', level: 'debug', fields: ['slot', 'genomeId', 'spec', 'x', 'y'] },
    { code: 8, name: 'SMOKE_REFUSED', log: 'SmokeRefused', level: 'debug', fields: ['slot', 'genomeId'] },
    { code: 9, name: 'FOOD_PATCHES_CREATED', log: 'FoodPatchesCreated', level: 'info', fields: ['count', 'radius'] },
    { code: 10, name: 'SEASON_CHANGED', log: 'SeasonChanged', level: 'info', fields: ['season', 'year'] },
    { code: 11, name: 'DROUGHT_STARTED', log: 'DroughtStarted', level: 'info', fields: ['basin', 'year'] },
    {
        code: 14,
        name: 'MERIT_SUMMARY',
        log: 'MeritSummary',
        level: 'debug',
        fields: ['meritMean', 'meritP90', 'readyToSplit', 'gatedSplits', 'deliberateReadyShare'],
    },
    {
        code: 15,
        name: 'LINE_PROVEN',
        log: 'LineProven',
        level: 'debug',
        fields: ['slot', 'genomeId', 'parentA', 'parentB', 'lineageId'],
    },
    { code: 16, name: 'AGENT_SICKENED', log: 'AgentSickened', level: 'debug', fields: ['slot', 'genomeId', 'dose'] },
    {
        code: 17,
        name: 'PATCH_SEEDED',
        log: 'PatchSeeded',
        level: 'debug',
        fields: ['species', 'patch', 'parentA', 'parentB', 'hue', 'x', 'y'],
    },
    { code: 18, name: 'PATCH_DIED', log: 'PatchDied', level: 'debug', fields: ['patch', 'species'] },
    {
        code: 19,
        name: 'SEEDING_REFUSED',
        log: 'SeedingRefused',
        level: 'debug',
        fields: ['species', 'reason', 'source'],
    },
    { code: 20, name: 'HERD_ROUTE_CHANGED', log: 'HerdRouteChanged', level: 'debug', fields: ['group', 'patch'] },
    {
        code: 21,
        name: 'HERD_STAMPEDE',
        log: 'HerdStampede',
        level: 'debug',
        fields: ['group', 'hunter', 'animals', 'x', 'y'],
    },
    {
        code: 22,
        name: 'HERD_ANIMAL_DIED',
        log: 'HerdAnimalDied',
        level: 'debug',
        fields: ['herd', 'animal', 'age', 'store', 'old'],
    },
    { code: 23, name: 'HERD_ANIMAL_BORN', log: 'HerdAnimalBorn', level: 'debug', fields: ['herd', 'animal'] },
    { code: 24, name: 'HERD_CARCASS_LOST', log: 'HerdCarcassLost', level: 'warn', fields: ['herd'] },
    {
        code: 25,
        name: 'HERD_SEEDED',
        log: 'HerdSeeded',
        level: 'debug',
        fields: ['herd', 'animal', 'source', 'patch', 'species', 'x', 'y'],
    },
    {
        code: 26,
        name: 'STRAIN_EMERGED',
        log: 'StrainEmerged',
        level: 'info',
        fields: ['strain', 'hostSlot', 'hostGenomeId', 'hostLineageId'],
    },
    {
        code: 27,
        name: 'AGENT_INFECTED',
        log: 'AgentInfected',
        level: 'debug',
        fields: ['slot', 'genomeId', 'strain', 'distance'],
    },
    {
        code: 28,
        name: 'STRAIN_EXTINCT',
        log: 'StrainExtinct',
        level: 'info',
        fields: ['strain', 'infectedTotal', 'ticksAlive'],
    },
    {
        code: 29,
        name: 'HUNTER_LEDGER',
        log: 'HunterLedger',
        level: 'debug',
        fields: [
            'genomeId',
            'ageTicks',
            'packed',
            'carcassEnergy',
            'standingEnergy',
            'moveEnergy',
            'sprintEnergy',
            'killEnergy',
            'biteGainEnergy',
            'biteCostEnergy',
        ],
    },
    {
        code: 30,
        name: 'LAST_HUNTER_DIED',
        log: 'LastHunterDied',
        level: 'debug',
        fields: ['genomeId', 'basin', 'nonPredatorsWest', 'nonPredatorsEast'],
    },
    {
        code: 31,
        name: 'HUNTER_KILL',
        log: 'HunterKill',
        level: 'debug',
        fields: ['genomeId', 'ageTicks', 'kills', 'dependent'],
    },
    // Unused since realistic-keepers T20 deleted provisioning; the code stays so later codes do not renumber.
    { code: 32, name: 'PROVISIONED', log: null, level: 'debug', fields: [] },
    {
        code: 33,
        name: 'COVER_CONFIG',
        log: 'CoverConfig',
        level: 'info',
        fields: ['refugeCount', 'aperturePx', 'interiorRadius'],
    },
    {
        code: 34,
        name: 'COVER_TOTALS',
        log: 'CoverTotals',
        level: 'debug',
        fields: ['agentsInRings', 'agentTicksInRings', 'concealedHits', 'foodRejected'],
    },
    { code: 35, name: 'HUNTER_RECOIL_LIFE', log: 'HunterRecoilLife', level: 'debug', fields: ['slot', 'energy'] },
    { code: 36, name: 'SPRINT_SPENT', log: 'SprintSpent', level: 'debug', fields: ['slot', 'genomeId', 'spec'] },
    // A stack gained, once per stack and never per tick (status-effects.md, Logging and diagnostics).
    {
        code: 37,
        name: 'EFFECT_APPLIED',
        log: 'EffectApplied',
        level: 'debug',
        fields: ['slot', 'effect', 'stacks', 'source'],
    },
    // A stack dropped at the effect's cap.
    { code: 38, name: 'EFFECT_CAPPED', log: 'EffectCapped', level: 'debug', fields: ['slot', 'effect'] },
    // A defender's active repel landed on a hunter (`tryDefenderRepel`): the defender's slot and the hunter's.
    { code: 39, name: 'DEFENDER_SHOVED', log: 'DefenderShoved', level: 'debug', fields: ['slot', 'target'] },
];

/** Offset of the event type in a record. */
export const EVENT_TYPE_AT = 0;

/** Offset of the tick in a record. */
export const EVENT_TICK = 1;

/** Offset of the first named field in a record. */
export const EVENT_FIELDS_AT = 2;

/**
 * @param {string} name a `lowerCamel` field name
 * @returns {string} the `UPPER_SNAKE` key of its offset
 */
function offsetKey(name) {
    return name.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase();
}

/**
 * @param {EventDef} def an event definition
 * @returns {Readonly<Record<string, number>>} the offsets of its record: `TYPE`, `TICK` and one per field
 */
export function offsetsOf(def) {
    if (def.fields.length > EVENT_STRIDE - EVENT_FIELDS_AT) {
        throw new Error(
            `events: ${def.name} has ${def.fields.length} fields, the record holds ${EVENT_STRIDE - EVENT_FIELDS_AT}`,
        );
    }
    /** @type {Record<string, number>} */
    const offsets = { TYPE: EVENT_TYPE_AT, TICK: EVENT_TICK };
    def.fields.forEach((field, i) => {
        const key = offsetKey(field);
        if (key in offsets) {
            throw new Error(`events: ${def.name} names the field "${field}" twice or reuses TYPE or TICK`);
        }
        offsets[key] = EVENT_FIELDS_AT + i;
    });
    return Object.freeze(offsets);
}

/** Every event, in code order: the one list the codes, the offsets, the log and its table are built from. */
export const EVENTS = Object.freeze(
    DEFS.map((def) => Object.freeze({ ...def, fields: Object.freeze([...def.fields]) })),
);

/** Event type codes, stored in field 0 of each record. */
export const EVENT_TYPE = Object.freeze(Object.fromEntries(EVENTS.map((def) => [def.name, def.code])));

/** The record offsets of each event: `EVENT.AGENT_DIED.CAUSE` is where an `AGENT_DIED` record keeps its cause. */
export const EVENT = Object.freeze(Object.fromEntries(EVENTS.map((def) => [def.name, offsetsOf(def)])));

/** @type {Readonly<Record<number, EventDef>>} */
export const EVENT_BY_CODE = Object.freeze(Object.fromEntries(EVENTS.map((def) => [def.code, def])));

/**
 * @typedef {object} Cause
 * @property {number} code the stored code
 * @property {string} key the `UPPER_SNAKE` key of the keyed map
 * @property {string} name the name the log writes
 * @property {string} colour the CSS colour the app's charts draw it in
 */

/**
 * @param {Array<[string, string, string]>} rows `[key, name, colour]` in code order
 * @returns {readonly Cause[]} the causes, code `i` for row `i`
 */
export function causeList(rows) {
    return Object.freeze(rows.map(([key, name, colour], code) => Object.freeze({ code, key, name, colour })));
}

/**
 * @param {readonly Cause[]} list a cause list
 * @returns {Readonly<Record<string, number>>} the keyed map of its codes
 */
export function causeMap(list) {
    return Object.freeze(Object.fromEntries(list.map((cause) => [cause.key, cause.code])));
}

/** Why an agent was born, in code order. The colours are the born flow chart's series, INITIAL having none. */
export const BORN_CAUSES = causeList([
    ['INITIAL', 'initial', '#8a9bb0'],
    ['MATE', 'mate', '#5ee6a8'],
    ['SPLIT', 'split', '#6cc6ff'],
    ['FLOOR', 'floor', '#ffb454'],
    ['IMMIGRANT', 'immigrant', '#ff5d73'],
]);

/** Why an agent died, in code order. DISEASE shares STARVED's colour, as the chart palette of six always wrapped. */
export const DEATH_CAUSES = causeList([
    ['STARVED', 'starved', '#5ee6a8'],
    ['EATEN', 'eaten', '#6cc6ff'],
    ['COLLISION', 'collision', '#ffb454'],
    ['OLD_AGE', 'old-age', '#ff5d73'],
    ['POISONED', 'poisoned', '#b48cff'],
    ['TRAMPLED', 'trampled', '#8a9bb0'],
    ['DISEASE', 'disease', '#5ee6a8'],
]);

/** Why an agent was born, stored in the `cause` field of `AGENT_BORN`. */
export const BORN_CAUSE = causeMap(BORN_CAUSES);

/** Why an agent died, stored in the `cause` field of `AGENT_DIED`. */
export const DEATH_CAUSE = causeMap(DEATH_CAUSES);

/** Why a birth was blocked, stored in the `cause` field of `BIRTH_BLOCKED`. */
export const BLOCKED_CAUSE = Object.freeze({
    CAPACITY: 0,
    ENERGY: 1,
});

/**
 * @typedef {object} EventRing
 * @property {Float64Array} data `capacity * EVENT_STRIDE` fields, one record per event
 * @property {number} count records pushed since the last `clearEvents`
 * @property {number} capacity the most records the ring holds
 */

/**
 * Allocates an empty event ring.
 * @param {number} capacity the most records the ring can hold; a positive integer
 * @returns {EventRing}
 */
export function createEventRing(capacity) {
    if (!Number.isInteger(capacity) || capacity < 1) {
        throw new Error(`createEventRing: capacity must be a positive integer, got ${capacity}`);
    }
    return { data: new Float64Array(capacity * EVENT_STRIDE), count: 0, capacity };
}

/**
 * Appends a record with its type and tick, zeroing the remaining fields.
 * @param {EventRing} ring the ring to append to
 * @param {number} type an `EVENT_TYPE` code
 * @param {number} tick the simulation tick of the event
 * @returns {number} the offset of the record's first field in `ring.data`
 */
export function pushEvent(ring, type, tick) {
    if (ring.count === ring.capacity) {
        throw new Error(`pushEvent: event ring is full at tick ${tick} (eventCapacity ${ring.capacity})`);
    }
    const offset = ring.count * EVENT_STRIDE;
    const { data } = ring;
    data[offset] = type;
    data[offset + EVENT_TICK] = tick;
    data.fill(0, offset + EVENT_FIELDS_AT, offset + EVENT_STRIDE);
    ring.count += 1;
    return offset;
}

/**
 * Returns the number of records; callers read `ring.data` directly.
 * @param {EventRing} ring the ring
 * @returns {number} the record count
 */
export function readEvents(ring) {
    return ring.count;
}

/**
 * Empties the ring without touching its data.
 * @param {EventRing} ring the ring
 * @returns {void}
 */
export function clearEvents(ring) {
    ring.count = 0;
}
