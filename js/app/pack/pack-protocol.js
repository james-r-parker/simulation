// The messages between the main thread and the pack worker (docs/designs/pack-worker.md, "Lifecycle"): `packInit` to the
// worker, `packReady` and `packError` back. After `packInit` the worker takes no messages: everything it reads per frame
// is shared memory. `validatePackMessage` checks each one as `validateMessage` does for the sim worker.

/** The message types. */
export const PACK_MESSAGES = Object.freeze({ INIT: 'packInit', READY: 'packReady', ERROR: 'packError' });

const isObject = (/** @type {unknown} */ v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (/** @type {unknown} */ v) => Number.isInteger(v) && /** @type {number} */ (v) >= 0;
const isMemory = (/** @type {unknown} */ v) =>
    typeof SharedArrayBuffer !== 'undefined' && v instanceof SharedArrayBuffer;
const isString = (/** @type {unknown} */ v) => typeof v === 'string';

/**
 * @param {unknown} info `ready.info`
 * @returns {boolean} whether it has what the pack reads: an agent cap and the spec list
 */
function isInfo(info) {
    const i = /** @type {any} */ (info);
    return isObject(i) && Number.isInteger(i.maxAgents) && i.maxAgents > 0 && Array.isArray(i.specs);
}

/**
 * @param {unknown} layout the layout parts the pack reads
 * @returns {boolean} whether it holds the flag bits and the state bits
 */
function isLayout(layout) {
    const l = /** @type {any} */ (layout);
    return isObject(l) && isObject(l.flags) && isObject(l.stateBits);
}

/** @type {Record<string, {direction: 'toWorker' | 'fromWorker', fields: [string, (v: unknown) => boolean, string][]}>} */
const SHAPES = {
    [PACK_MESSAGES.INIT]: {
        direction: 'toWorker',
        fields: [
            ['epoch', isCount, 'a non-negative integer'],
            ['info', isInfo, 'ready.info with maxAgents and specs'],
            ['layout', isLayout, 'an object with flags and stateBits'],
            ['ring', isMemory, 'a SharedArrayBuffer'],
            ['slotBytes', (v) => isCount(v) && /** @type {number} */ (v) > 0, 'a positive integer'],
            ['slots', isMemory, 'a SharedArrayBuffer'],
            ['stores', isMemory, 'a SharedArrayBuffer'],
            ['causeNames', (v) => Array.isArray(v) && v.every(isString), 'an array of strings'],
        ],
    },
    [PACK_MESSAGES.READY]: { direction: 'fromWorker', fields: [['epoch', isCount, 'a non-negative integer']] },
    [PACK_MESSAGES.ERROR]: {
        direction: 'fromWorker',
        fields: [
            ['epoch', isCount, 'a non-negative integer'],
            ['message', isString, 'a string'],
            ['stack', isString, 'a string'],
        ],
    },
};

/**
 * @param {unknown} value a field value
 * @returns {string} a short description for an error message
 */
function describe(value) {
    return value === null ? 'null' : Array.isArray(value) ? 'an array' : typeof value;
}

/**
 * @param {unknown} message a message
 * @param {{direction?: 'toWorker' | 'fromWorker'}} [context] `direction` rejects a message that travels the other way
 * @returns {Record<string, any>} `message`
 * @throws {Error} when the message is not an object, has an unknown type, travels the wrong way or has a bad field
 */
export function validatePackMessage(message, { direction } = {}) {
    if (!isObject(message)) {
        throw new Error(`pack protocol: a message must be an object, got ${describe(message)}`);
    }
    const m = /** @type {Record<string, any>} */ (message);
    const shape = Object.hasOwn(SHAPES, m.type) ? SHAPES[m.type] : null;
    if (shape === null) {
        throw new Error(`pack protocol: unknown message type ${String(m.type)}`);
    }
    if (direction !== undefined && direction !== shape.direction) {
        throw new Error(`pack protocol: ${m.type} travels ${shape.direction}, not ${direction}`);
    }
    for (const [name, check, expected] of shape.fields) {
        if (!check(m[name])) {
            throw new Error(`pack protocol: ${m.type}.${name} must be ${expected}, got ${describe(m[name])}`);
        }
    }
    return m;
}
