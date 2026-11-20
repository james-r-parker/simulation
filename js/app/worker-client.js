// The main thread's end of the worker protocol: sends commands, validates and routes what comes back, holds the two
// newest snapshots (views over slots of the shared snapshot ring) and the newest field, queues every snapshot's effects
// by tick, drops anything from an older world and gives each field buffer back as soon as it is no longer needed.
// Imports only the protocol and the snapshot ring.

import { DIRECTION, MESSAGE_TYPES, POOLS, validateMessage } from '../worker/protocol.js';
import { createRingViews, holdFrom, READER, RELEASED, slotOfSeq } from '../worker/snapshot-ring.js';

/** The least wall time between two `SnapshotLost` warnings. */
export const LOST_LOG_INTERVAL_MS = 5000;

/** Effects the queue holds; when full the oldest are dropped. */
export const EFFECT_QUEUE_CAPACITY = 2048;

/**
 * @typedef {object} Snapshot a view of one ring slot, made once per ring and reused: its fields change when its slot is
 *   published again, so keep nothing of it past the frame, and compare `seq`, never the object
 * @property {number} epoch the world it belongs to
 * @property {number} seq the ring sequence number it shows
 * @property {number} tick the tick it shows
 * @property {Uint32Array} u32 the word view
 * @property {Float32Array} f32 the float view
 */

/**
 * @typedef {object} EffectQueue
 * @property {Uint32Array} u32 `EFFECT_QUEUE_CAPACITY` records as a ring, `words` words each
 * @property {Float32Array} f32 the same words as floats
 * @property {number} words words per record
 * @property {number} start the ring index of the oldest record
 * @property {number} count records queued
 * @property {number} dropped records pushed out because the queue was full
 */

/**
 * @typedef {object} ClientListeners
 * @property {(message: any) => void} [onReady] a world is ready (also after a reset)
 * @property {(stats: any) => void} [onStats] a stats message of the current world
 * @property {(items: any[]) => void} [onTicker] ticker items
 * @property {(message: any) => void} [onSelection] a selection message
 * @property {(json: string) => void} [onArchive] the exported archive
 * @property {(record: any) => void} [onLog] a worker log record
 * @property {(message: any) => void} [onError] the worker reported an error and has stopped
 * @property {(error: Error) => void} [onFailure] a message failed validation or its handler threw
 */

/**
 * @param {number} words words per effect record
 * @returns {EffectQueue} an empty queue
 */
function createEffectQueue(words) {
    const buffer = new ArrayBuffer(EFFECT_QUEUE_CAPACITY * words * 4);
    return { u32: new Uint32Array(buffer), f32: new Float32Array(buffer), words, start: 0, count: 0, dropped: 0 };
}

/**
 * Appends a snapshot's effects part to the queue.
 * @param {EffectQueue} queue the queue
 * @param {Uint32Array} u32 the snapshot's word view
 * @param {number} offset the word offset of the effects part
 * @returns {void}
 */
function queueEffects(queue, u32, offset) {
    const count = u32[offset];
    const { words } = queue;
    for (let i = 0; i < count; i++) {
        let slot;
        if (queue.count === EFFECT_QUEUE_CAPACITY) {
            slot = queue.start;
            queue.start = (queue.start + 1) % EFFECT_QUEUE_CAPACITY;
            queue.dropped += 1;
        } else {
            slot = (queue.start + queue.count) % EFFECT_QUEUE_CAPACITY;
            queue.count += 1;
        }
        const from = offset + 2 + i * words;
        for (let k = 0; k < words; k++) {
            queue.u32[slot * words + k] = u32[from + k];
        }
    }
}

/**
 * @typedef {object} Client
 * @property {(message: Record<string, any>, transfer?: ArrayBuffer[]) => void} post sends a message to the worker
 * @property {ClientListeners} listeners the callbacks
 * @property {number} epoch the world whose messages are current
 * @property {any} ready the last `ready` message, null before one
 * @property {import('../worker/snapshot-ring.js').Ring | null} ring the world's snapshot ring, null before `ready`
 * @property {Snapshot[]} slotSnapshots one `Snapshot` per ring slot
 * @property {((level: 'warn', event: string, fields: Record<string, any>) => void) | undefined} log the app log
 * @property {() => number} now the clock, in ms
 * @property {number} lostLoggedAt when `SnapshotLost` was last logged
 * @property {Snapshot | null} prev the older of the two held snapshots
 * @property {Snapshot | null} latest the newest snapshot
 * @property {{epoch: number, tick: number, buffer: ArrayBuffer, f32: Float32Array} | null} field the newest field,
 *   held until `releaseField`
 * @property {any} stats the newest stats of the current world
 * @property {EffectQueue | null} effects the queued effects, null before `ready`
 * @property {boolean} paused whether the last of `pause` and `resume` sent was `pause`
 * @property {number} pausesPending `pause` commands the worker has not yet acknowledged with `paused`
 * @property {boolean} pausedAck whether the worker has confirmed it is paused: `paused` was requested and every
 *   `pause` sent has been acknowledged, so the newest snapshot is the tick the world stopped on
 * @property {number} droppedMessages snapshot, field and stats messages dropped for an old epoch
 */

/**
 * @param {Client} client the client
 * @param {string} pool `field`
 * @param {ArrayBuffer} buffer the buffer to give back
 * @returns {void}
 */
function giveBack(client, pool, buffer) {
    client.post({ type: MESSAGE_TYPES.RETURN_BUFFER, pool, buffer }, [buffer]);
}

/**
 * Gives the held field back; the renderer calls it once it has copied the field into its texture.
 * @param {Client} client the client
 * @returns {void}
 */
function releaseField(client) {
    if (client.field !== null) {
        giveBack(client, POOLS.FIELD, client.field.buffer);
        client.field = null;
    }
}

/**
 * Releases the ring hold and the held field, so nothing of an old world is drawn or kept alive.
 * @param {Client} client the client
 * @returns {void}
 */
function releaseWorld(client) {
    if (client.ring !== null) {
        holdFrom(client.ring, READER.MAIN, RELEASED);
    }
    client.prev = null;
    client.latest = null;
    releaseField(client);
}

/**
 * @param {Client} client the client
 * @param {Record<string, any>} message a validated `ready`
 * @returns {void}
 */
function onReady(client, message) {
    releaseWorld(client);
    client.epoch = message.epoch;
    client.ready = message;
    client.ring = createRingViews(message.ring, message.slotBytes);
    // Sequences start at 1: hold everything until the first snapshot is read, so none is overwritten unseen.
    holdFrom(client.ring, READER.MAIN, 1);
    client.slotSnapshots = client.ring.slots.map((views) => ({ epoch: 0, seq: 0, tick: 0, ...views }));
    client.stats = null;
    client.effects = createEffectQueue(message.layout.effectWords);
    client.listeners.onReady?.(message);
}

/**
 * Logs `SnapshotLost` at most once per `LOST_LOG_INTERVAL_MS`.
 * @param {Client} client the client
 * @param {Record<string, any>} message the `snapshot` whose slot was overwritten before it was read
 * @returns {void}
 */
function noteLost(client, message) {
    const at = client.now();
    if (client.log !== undefined && at - client.lostLoggedAt >= LOST_LOG_INTERVAL_MS) {
        client.lostLoggedAt = at;
        client.log('warn', 'SnapshotLost', { seq: message.seq, tick: message.tick });
    }
}

/**
 * Points `latest` at the published slot (and `prev` at the one before), queues its effects and holds the ring from
 * `prev`. A slot that is already gone is logged and the message dropped.
 * @param {Client} client the client
 * @param {Record<string, any>} message a validated `snapshot`
 * @returns {void}
 */
function onSnapshot(client, message) {
    const { ring, effects, ready } = client;
    if (message.epoch !== client.epoch || ready === null || effects === null || ring === null) {
        client.droppedMessages += 1;
        return;
    }
    const slot = slotOfSeq(ring, message.seq);
    if (slot < 0) {
        noteLost(client, message);
        return;
    }
    const snapshot = client.slotSnapshots[slot];
    snapshot.epoch = message.epoch;
    snapshot.seq = message.seq;
    snapshot.tick = message.tick;
    queueEffects(effects, snapshot.u32, ready.layout.effectsOffset);
    client.prev = client.latest;
    client.latest = snapshot;
    holdFrom(ring, READER.MAIN, (client.prev ?? snapshot).seq);
}

/**
 * @param {Client} client the client
 * @param {Record<string, any>} message a validated `field`
 * @returns {void}
 */
function onField(client, message) {
    if (message.epoch !== client.epoch) {
        client.droppedMessages += 1;
        giveBack(client, POOLS.FIELD, message.buffer);
        return;
    }
    releaseField(client);
    client.field = {
        epoch: message.epoch,
        tick: message.tick,
        buffer: message.buffer,
        f32: new Float32Array(message.buffer),
    };
}

/**
 * @param {Client} client the client
 * @param {Record<string, any>} message a validated `stats`
 * @returns {void}
 */
function onStats(client, message) {
    if (message.epoch === client.epoch) {
        client.stats = message.stats;
        client.listeners.onStats?.(message.stats);
    } else {
        client.droppedMessages += 1;
    }
}

/**
 * The worker has stopped: the snapshot it posted first has already arrived, so `latest` is the final tick.
 * @param {Client} client the client
 * @returns {void}
 */
function onPaused(client) {
    client.pausesPending = Math.max(0, client.pausesPending - 1);
    client.pausedAck = client.paused && client.pausesPending === 0;
}

/** The pause fields of a client that has sent nothing. */
const NOT_PAUSED = Object.freeze({ paused: false, pausesPending: 0, pausedAck: false });

/**
 * @param {Client} client the client
 * @returns {void}
 */
function notePauseSent(client) {
    client.paused = true;
    client.pausedAck = false;
    client.pausesPending += 1;
}

/**
 * @param {Client} client the client
 * @returns {void}
 */
function noteResumeSent(client) {
    client.paused = false;
    client.pausedAck = false;
}

/**
 * Handlers by message type.
 * @type {Readonly<Record<string, (client: Client, message: any) => void>>}
 */
const HANDLERS = Object.freeze({
    [MESSAGE_TYPES.READY]: onReady,
    [MESSAGE_TYPES.PAUSED]: onPaused,
    [MESSAGE_TYPES.SNAPSHOT]: onSnapshot,
    [MESSAGE_TYPES.FIELD]: onField,
    [MESSAGE_TYPES.STATS]: onStats,
    [MESSAGE_TYPES.TICKER]: (/** @type {Client} */ c, /** @type {any} */ m) => c.listeners.onTicker?.(m.items),
    [MESSAGE_TYPES.SELECTION]: (/** @type {Client} */ c, /** @type {any} */ m) => c.listeners.onSelection?.(m),
    [MESSAGE_TYPES.ARCHIVE]: (/** @type {Client} */ c, /** @type {any} */ m) => c.listeners.onArchive?.(m.json),
    [MESSAGE_TYPES.LOG]: (/** @type {Client} */ c, /** @type {any} */ m) => c.listeners.onLog?.(m.record),
    [MESSAGE_TYPES.ERROR]: (/** @type {Client} */ c, /** @type {any} */ m) => c.listeners.onError?.(m),
});

/**
 * Handles one message from the worker. A message that fails validation, or whose handler throws, goes to `onFailure`
 * instead of throwing.
 * @param {Client} client the client
 * @param {any} data the message
 * @returns {void}
 */
function handle(client, data) {
    try {
        validateMessage(data, { direction: DIRECTION.TO_MAIN });
        HANDLERS[data.type](client, data);
    } catch (error) {
        client.listeners.onFailure?.(error instanceof Error ? error : new Error(String(error)));
    }
}

/**
 * @param {Pick<Client, 'post' | 'listeners' | 'log' | 'now'>} wiring the port, the listeners, the log and the clock
 * @returns {Client} a client that has seen no message
 */
function initialClient({ post, listeners, log, now }) {
    return {
        post,
        listeners,
        epoch: 0,
        ready: null,
        ring: null,
        slotSnapshots: [],
        log,
        now,
        lostLoggedAt: -Infinity,
        prev: null,
        latest: null,
        field: null,
        stats: null,
        effects: null,
        ...NOT_PAUSED,
        droppedMessages: 0,
    };
}

/**
 * Creates the client.
 * @param {{post: (message: Record<string, any>, transfer?: ArrayBuffer[]) => void, listeners?: ClientListeners,
 *   policy?: string, log?: (level: 'warn', event: string, fields: Record<string, any>) => void,
 *   now?: () => number}} options `post` sends a message to the worker; `policy`, when given, names the registered
 *   policy every `init` and `reset` asks for (absent: the worker's live policy); `log` and `now` (ms) rate-limit and
 *   write `SnapshotLost`
 * @returns {Client & Record<string, any>} the client: the state in `Client`; `handle(data)` for each message from the
 *   worker; `releaseField()`; and the commands `init`, `reset`, `setSpeed`, `pause`, `resume`, `step`, `select`,
 *   `setLenses`, `exportArchive` and `flush`
 */
export function createWorkerClient({ post, listeners = {}, policy, log, now = () => 0 }) {
    const client = initialClient({ post, listeners, log, now });
    const send = (/** @type {string} */ type, /** @type {Record<string, any>} */ fields = {}) =>
        post({ type, ...fields });
    const policyField = policy === undefined ? {} : { policy };
    return Object.assign(client, {
        handle: (/** @type {any} */ data) => handle(client, data),
        releaseField: () => releaseField(client),
        init(/** @type {number} */ seed, /** @type {Record<string, any>} */ config) {
            client.epoch = 1;
            send(MESSAGE_TYPES.INIT, { seed, config, ...policyField });
        },
        reset(/** @type {number} */ seed, /** @type {Record<string, any>} */ config) {
            client.epoch += 1;
            releaseWorld(client);
            send(MESSAGE_TYPES.RESET, { seed, config, ...policyField });
        },
        setSpeed: (/** @type {number} */ ticksPerSecond) => send(MESSAGE_TYPES.SET_SPEED, { ticksPerSecond }),
        pause() {
            notePauseSent(client);
            send(MESSAGE_TYPES.PAUSE);
        },
        resume() {
            noteResumeSent(client);
            send(MESSAGE_TYPES.RESUME);
        },
        /** @returns {boolean} whether the step was sent: it is accepted only while paused */
        step(/** @type {number} */ ticks) {
            if (client.paused) {
                send(MESSAGE_TYPES.STEP, { ticks });
            }
            return client.paused;
        },
        select: (/** @type {number} */ genomeId) => send(MESSAGE_TYPES.SELECT, { genomeId }),
        setLenses: (/** @type {boolean} */ rays) => send(MESSAGE_TYPES.SET_LENSES, { rays }),
        exportArchive: () => send(MESSAGE_TYPES.EXPORT_ARCHIVE),
        flush: () => send(MESSAGE_TYPES.FLUSH),
    });
}
