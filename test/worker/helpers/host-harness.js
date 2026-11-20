import { cloneWithNoisePolicy } from '../../../js/sim/birth-policy.js';
import { createSimHost } from '../../../js/worker/sim-host.js';
import { createRingViews, holdFrom, READER, RELEASED } from '../../../js/worker/snapshot-ring.js';
import { SIMPLE_WORLD } from '../../helpers/simple-world.js';

/** A small, quick world for host tests, with the Phase 3 features off (the old world). */
export const SMALL_CONFIG = Object.freeze({
    ...SIMPLE_WORLD,
    worldWidth: 1600,
    worldHeight: 1000,
    maxAgents: 40,
    initialAgents: 30,
    minAgents: 20,
    maxFood: 60,
    initialFood: 40,
    rayCount: 8,
    brainHidden: 8,
    fertileZoneMax: 4,
});

/**
 * @typedef {object} Harness
 * @property {{t: number}} clock the fake clock, in ms
 * @property {any[]} sent every message the worker posted, in order
 * @property {{fn: null | (() => void), delay: number, count: number}} timers the one scheduled slice
 * @property {any} host the host
 * @property {Record<string, ArrayBuffer[]>} held the field buffers the fake main thread holds
 * @property {(message: any) => void} send delivers a message to the worker
 * @property {(type: string) => any[]} of the worker's messages of one type
 * @property {(ms: number) => boolean} advance passes wall time and runs the scheduled slice, if any
 * @property {() => any} run the host's current run
 */

/**
 * @returns {Record<string, any>} a policy object with the reference brain and no hooks
 */
export function noisePolicy() {
    return { name: 'noise', brain: cloneWithNoisePolicy() };
}

/**
 * Builds a host over a fake port, clock and scheduler, and a main thread that records what it receives.
 * A snapshot message is recorded with a `buffer`: a copy of its ring slot's bytes at the moment it was posted, so a test
 * can read it after the slot is reused.
 * @param {{createPolicy?: (options: Record<string, any>) => Record<string, any>, keep?: number}} [options] the policy
 *   factory (default `noisePolicy`) and how many of the newest snapshots the fake main thread holds in the ring (0
 *   holds none; `Infinity` never moves its hold, so the ring runs full)
 * @returns {Harness} the harness
 */
export function createHarness({ createPolicy = noisePolicy, keep = 0 } = {}) {
    const clock = { t: 0 };
    /** @type {Record<string, any>[]} */
    const sent = [];
    const timers = { fn: /** @type {null | (() => void)} */ (null), delay: 0, count: 0 };
    /** @type {Record<string, ArrayBuffer[]>} */
    const held = { field: [] };
    /** @type {import('../../../js/worker/snapshot-ring.js').Ring | null} */
    let ring = null;
    /** @type {number[]} */
    let seqs = [];
    /** @type {Harness} */
    const harness = {
        clock,
        sent,
        timers,
        held,
        host: null,
        /** @param {Record<string, any>} message a message to the worker @returns {void} */
        send(message) {
            harness.host.receive(message);
        },
        /** @param {string} type a message type @returns {Record<string, any>[]} the worker's messages of that type */
        of(type) {
            return sent.filter((m) => m.type === type);
        },
        /**
         * Advances the clock by `ms` and runs the scheduled slice if there is one.
         * @param {number} ms wall time to pass
         * @returns {boolean} whether a slice ran
         */
        advance(ms) {
            clock.t += ms;
            const fn = timers.fn;
            timers.fn = null;
            if (fn === null) {
                return false;
            }
            fn();
            return true;
        },
        /** @returns {Record<string, any>} the host's current run */
        run() {
            return harness.host.run();
        },
    };
    harness.host = createSimHost({
        post(message, transfer) {
            if (message.type === 'ready') {
                ring = createRingViews(message.ring, message.slotBytes);
                seqs = [];
            }
            if (message.type === 'snapshot') {
                const slot = /** @type {any} */ (ring).slots[message.slot];
                sent.push({ ...message, buffer: slot.u32.slice().buffer });
                // Playing the main thread: it holds the `keep` newest snapshots.
                seqs.push(message.seq);
                while (seqs.length > keep) {
                    seqs.shift();
                }
                holdFrom(/** @type {any} */ (ring), READER.MAIN, seqs.length === 0 ? RELEASED : seqs[0]);
                return;
            }
            sent.push(message);
            if (transfer === undefined) {
                return;
            }
            // Playing the main thread: a field buffer comes back as a new object, as a transferred one does.
            const queue = held[/** @type {'field'} */ (message.type)];
            queue.push(message.buffer);
            while (queue.length > 0) {
                const buffer = /** @type {ArrayBuffer} */ (queue.shift());
                harness.host.receive({
                    type: 'returnBuffer',
                    pool: message.type,
                    buffer: new ArrayBuffer(buffer.byteLength),
                });
            }
        },
        now: () => clock.t,
        schedule(delay, fn) {
            timers.fn = fn;
            timers.delay = delay;
            timers.count += 1;
        },
        createPolicy,
    });
    return harness;
}
