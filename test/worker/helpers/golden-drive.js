import { fnv64Bytes, fnv64Hex, fnv64Init } from '../../../js/sim/fnv.js';
import { hashWorld } from '../../../js/sim/world-hash.js';
import { cloneWithNoisePolicy } from '../../../js/sim/birth-policy.js';
import { createHarness } from './host-harness.js';

/** The ticks left to the paused `step` that lands the run exactly on its target. */
const TAIL_TICKS = 24;

/**
 * A deterministic stream of small integers, so a test's "uneven" slices are the same on every run.
 * @param {number} seed the start
 * @returns {() => number} the next value, 1 to 40
 */
function stream(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return 1 + ((state >>> 24) % 40);
    };
}

/**
 * Runs a golden case through the host: uneven slices, `select` and `setLenses` messages along the way, and a final
 * paused `step` that lands on the exact tick.
 * @param {{overrides: Record<string, any>, ticks: number}} golden the golden case
 * @param {{keep: number, slices: number}} options how many snapshots the fake main thread keeps (`Infinity` leaves the
 *   pool dry) and the seed of the slice-length stream
 * @returns {{world: Record<string, any>, hash: string, harness: import('./host-harness.js').Harness}} the world,
 *   its hash and the harness with every message the worker posted
 */
export function driveGolden(golden, { keep, slices }) {
    const harness = createHarness({ keep, createPolicy: () => ({ name: 'golden', brain: cloneWithNoisePolicy() }) });
    harness.send({ type: 'init', seed: 1, config: { ...golden.overrides, checkInvariants: false } });
    harness.send({ type: 'setSpeed', ticksPerSecond: 960 });
    const next = stream(slices);
    let rays = false;
    for (let n = 0; harness.run().world.tick < golden.ticks - TAIL_TICKS; n++) {
        harness.advance(next());
        if (n % 97 === 0) {
            const { observer } = harness.run();
            const first = observer.slotOf.keys().next();
            harness.send({ type: 'select', genomeId: first.done ? 0 : first.value });
        }
        if (n % 131 === 0) {
            rays = !rays;
            harness.send({ type: 'setLenses', rays });
        }
    }
    harness.send({ type: 'pause' });
    harness.send({ type: 'step', ticks: golden.ticks - harness.run().world.tick });
    const { world } = harness.run();
    return { world, hash: hashWorld(world), harness };
}

/**
 * Hashes every effect record in every snapshot the worker posted, in order, with the count of dropped records.
 * @param {import('./host-harness.js').Harness} harness the harness after a run
 * @returns {{hash: string, records: number, dropped: number}} the FNV hash of the effect stream
 */
export function effectStreamHash(harness) {
    const { effectsOffset, effectWords } = harness.of('ready')[0].layout;
    const state = fnv64Init(new Uint32Array(2));
    let records = 0;
    let dropped = 0;
    for (const message of harness.of('snapshot')) {
        const u32 = new Uint32Array(message.buffer);
        const count = u32[effectsOffset];
        dropped += u32[effectsOffset + 1];
        const from = (effectsOffset + 2) * 4;
        fnv64Bytes(state, new Uint8Array(message.buffer, from, count * effectWords * 4));
        records += count;
    }
    return { hash: fnv64Hex(state), records, dropped };
}
