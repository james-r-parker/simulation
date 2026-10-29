import { cloneWithNoisePolicy } from '../../../js/sim/birth-policy.js';
import { createSimHost } from '../../../js/worker/sim-host.js';
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
 * @property {Record<string, ArrayBuffer[]>} held the buffers the fake main thread holds, by pool
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
 * @param {{createPolicy?: (options: Record<string, any>) => Record<string, any>, keep?: number}} [options] the policy
 *   factory (default `noisePolicy`) and how many snapshot buffers the fake main thread keeps before returning the
 *   oldest (0 returns each at once; `Infinity` never returns one, so the pool runs dry)
 * @returns {Harness} the harness
 */
export function createHarness({ createPolicy = noisePolicy, keep = 0 } = {}) {
    const clock = { t: 0 };
    /** @type {Record<string, any>[]} */
    const sent = [];
    const timers = { fn: /** @type {null | (() => void)} */ (null), delay: 0, count: 0 };
    /** @type {Record<string, ArrayBuffer[]>} */
    const held = { snapshot: [], field: [] };
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
            sent.push(message);
            if (transfer === undefined) {
                return;
            }
            // Playing the main thread: a buffer comes back as a new object, as a transferred one does.
            const queue = held[message.type];
            queue.push(message.buffer);
            const limit = message.type === 'snapshot' ? keep : 0;
            while (queue.length > limit) {
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
