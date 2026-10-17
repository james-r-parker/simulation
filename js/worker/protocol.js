// The worker protocol: every message type, its direction and the shape of its fields, and the check both sides run
// on each message they receive. Imported by the app too, so it depends on nothing.

/** The message types, keyed by constant name. */
export const MESSAGE_TYPES = Object.freeze({
    INIT: 'init',
    RESET: 'reset',
    SET_SPEED: 'setSpeed',
    PAUSE: 'pause',
    RESUME: 'resume',
    STEP: 'step',
    RETURN_BUFFER: 'returnBuffer',
    SELECT: 'select',
    SET_LENSES: 'setLenses',
    EXPORT_ARCHIVE: 'exportArchive',
    FLUSH: 'flush',
    READY: 'ready',
    SNAPSHOT: 'snapshot',
    STATS: 'stats',
    FIELD: 'field',
    TICKER: 'ticker',
    SELECTION: 'selection',
    ARCHIVE: 'archive',
    LOG: 'log',
    ERROR: 'error',
});

/** Which way a message travels. */
export const DIRECTION = Object.freeze({ TO_WORKER: 'toWorker', TO_MAIN: 'toMain' });

/** The speeds `setSpeed` accepts: 0.25, 0.5, 1, 2, 4, 8 and 16 times 60 ticks a second. */
export const TICKS_PER_SECOND_CHOICES = Object.freeze([15, 30, 60, 120, 240, 480, 960]);

/** The buffer pools a `returnBuffer` names. */
export const POOLS = Object.freeze({ SNAPSHOT: 'snapshot', FIELD: 'field' });

/** The selection states a `selection` message carries. */
export const SELECTION_STATES = Object.freeze({ TRACKING: 'tracking', GONE: 'gone' });

/** @typedef {(value: any) => boolean} Check */

/** @type {Check} */
const isUint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
/** @type {Check} */
const isPositiveInt = (value) => Number.isInteger(value) && value > 0;
/** @type {Check} */
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
/** @type {Check} */
const isString = (value) => typeof value === 'string';
/** @type {Check} */
const isBoolean = (value) => typeof value === 'boolean';
/** @type {Check} */
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
/** @type {Check} */
const isBuffer = (value) => value instanceof ArrayBuffer;
/** @type {Check} */
const isSpeed = (value) => TICKS_PER_SECOND_CHOICES.includes(value);
/** @type {Check} */
const isPool = (value) => value === POOLS.SNAPSHOT || value === POOLS.FIELD;
/** @type {Check} */
const isSelectionState = (value) => value === SELECTION_STATES.TRACKING || value === SELECTION_STATES.GONE;
/** @type {Check} */
const isTickerItems = (value) =>
    Array.isArray(value) &&
    value.every((item) => isObject(item) && isUint(item.tick) && isString(item.kind) && isString(item.text));
/** @type {Check} */
const isStats = (value) => isObject(value) && isNumber(value.tick) && isNumber(value.ticksPerSecond);

/** @typedef {[string, Check, string]} Field a field's name, its check and what it must be */

/** @type {Field} */
const SEED = ['seed', isUint, 'an unsigned integer'];
/** @type {Field} */
const CONFIG = ['config', isObject, 'an object'];
/** @type {Field} */
const EPOCH = ['epoch', isUint, 'an unsigned integer'];
/** @type {Field} */
const TICK = ['tick', isUint, 'an unsigned integer'];
/** @type {Field} */
const BUFFER = ['buffer', isBuffer, 'an ArrayBuffer'];
/** @type {Field} */
const CONFIG_HASH = ['configHash', isString, 'a string'];

/**
 * Each type's direction and fields. A field not listed is not checked; a listed one is required.
 * @type {Readonly<Record<string, {direction: string, fields: readonly Field[]}>>}
 */
const SHAPES = Object.freeze({
    init: { direction: DIRECTION.TO_WORKER, fields: [SEED, CONFIG] },
    reset: { direction: DIRECTION.TO_WORKER, fields: [SEED, CONFIG] },
    setSpeed: {
        direction: DIRECTION.TO_WORKER,
        fields: [['ticksPerSecond', isSpeed, `one of ${TICKS_PER_SECOND_CHOICES.join(', ')}`]],
    },
    pause: { direction: DIRECTION.TO_WORKER, fields: [] },
    resume: { direction: DIRECTION.TO_WORKER, fields: [] },
    step: { direction: DIRECTION.TO_WORKER, fields: [['ticks', isPositiveInt, 'a positive integer']] },
    returnBuffer: {
        direction: DIRECTION.TO_WORKER,
        fields: [['pool', isPool, '"snapshot" or "field"'], BUFFER],
    },
    select: { direction: DIRECTION.TO_WORKER, fields: [['genomeId', isUint, 'an unsigned integer']] },
    setLenses: { direction: DIRECTION.TO_WORKER, fields: [['rays', isBoolean, 'a boolean']] },
    exportArchive: { direction: DIRECTION.TO_WORKER, fields: [] },
    flush: { direction: DIRECTION.TO_WORKER, fields: [] },
    ready: {
        direction: DIRECTION.TO_MAIN,
        fields: [
            EPOCH,
            CONFIG_HASH,
            ['rulesHash', isString, 'a string'],
            ['layout', isObject, 'an object'],
            ['info', isObject, 'an object'],
            ['labels', isObject, 'an object'],
            ['policy', isString, 'a string'],
            SEED,
        ],
    },
    snapshot: { direction: DIRECTION.TO_MAIN, fields: [EPOCH, BUFFER, TICK] },
    stats: {
        direction: DIRECTION.TO_MAIN,
        fields: [EPOCH, ['stats', isStats, 'an object with tick and ticksPerSecond']],
    },
    field: { direction: DIRECTION.TO_MAIN, fields: [EPOCH, TICK, BUFFER] },
    ticker: { direction: DIRECTION.TO_MAIN, fields: [['items', isTickerItems, 'an array of { tick, kind, text }']] },
    selection: {
        direction: DIRECTION.TO_MAIN,
        fields: [
            ['genomeId', isUint, 'an unsigned integer'],
            ['state', isSelectionState, '"tracking" or "gone"'],
        ],
    },
    archive: { direction: DIRECTION.TO_MAIN, fields: [['json', isString, 'a string']] },
    log: { direction: DIRECTION.TO_MAIN, fields: [['record', isObject, 'an object']] },
    error: {
        direction: DIRECTION.TO_MAIN,
        fields: [['message', isString, 'a string'], ['stack', isString, 'a string'], SEED, TICK, CONFIG_HASH],
    },
});

/**
 * @param {any} value a rejected field value
 * @returns {string} a short description of it for an error message
 */
function describe(value) {
    if (value === null) {
        return 'null';
    }
    if (value === undefined) {
        return 'missing';
    }
    return Array.isArray(value)
        ? 'an array'
        : typeof value === 'object'
          ? 'an object'
          : `${typeof value} ${String(value)}`;
}

/**
 * @param {any} message the message as received
 * @param {string | undefined} direction the direction the receiver expects, if it checks
 * @returns {{direction: string, fields: readonly Field[]}} the message's shape
 * @throws {Error} when the message is not an object, has an unknown type or travels the wrong way
 */
function shapeOf(message, direction) {
    if (!isObject(message)) {
        throw new Error(`protocol: a message must be an object, got ${describe(message)}`);
    }
    const type = message.type;
    if (!isString(type) || !Object.hasOwn(SHAPES, type)) {
        throw new Error(`protocol: unknown message type ${describe(type)}`);
    }
    const shape = SHAPES[type];
    if (direction !== undefined && shape.direction !== direction) {
        throw new Error(`protocol: ${type} is a ${shape.direction} message, received as ${direction}`);
    }
    return shape;
}

/**
 * Checks one message and returns it. Throws naming the type and the field. Allocates nothing when the message is good.
 * @param {any} message the message as received
 * @param {{direction?: string, paused?: boolean}} [context] `direction` rejects a message that travels the other way;
 *   `paused` (the receiver's state) rejects a `step` while the sim is running
 * @returns {Record<string, any>} `message`
 * @throws {Error} when the message is not an object, has an unknown type, travels the wrong way or has a bad field
 */
export function validateMessage(message, context = {}) {
    const { fields } = shapeOf(message, context.direction);
    for (let i = 0; i < fields.length; i++) {
        const [name, check, expected] = fields[i];
        if (!check(message[name])) {
            throw new Error(`protocol: ${message.type}.${name} must be ${expected}, got ${describe(message[name])}`);
        }
    }
    if (message.type === MESSAGE_TYPES.STEP && context.paused === false) {
        throw new Error('protocol: step is accepted only while paused');
    }
    return message;
}
