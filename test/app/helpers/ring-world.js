// A fake sim worker for client tests: owns a snapshot ring like the real host and publishes snapshots into it.

import { claimSlot, createRingViews, publishSlot, releaseAll, ringBytes } from '../../../js/worker/snapshot-ring.js';

/**
 * @param {{effectsAt: number, words: number, slotBytes: number}} shape where the effects part starts, the words per
 *   effect record and the bytes of one snapshot
 * @returns {{ring: import('../../../js/worker/snapshot-ring.js').Ring, memory: SharedArrayBuffer,
 *   ready: (epoch?: number) => Record<string, any>,
 *   publish: (tick: number, options?: {epoch?: number, effectTicks?: number[]}) => Record<string, any> | null}} the
 *   ring, a `ready` message naming it and a publisher: it claims a slot, writes `tick` and effects like the host and
 *   returns the `snapshot` message, or null when every slot is held
 */
export function createRingWorld({ effectsAt, words, slotBytes }) {
    const memory = new SharedArrayBuffer(ringBytes(slotBytes));
    const ring = createRingViews(memory, slotBytes);
    releaseAll(ring);
    return {
        ring,
        memory,
        ready: (epoch = 1) => ({
            type: 'ready',
            epoch,
            configHash: 'c',
            rulesHash: 'r',
            ring: memory,
            slotBytes,
            layout: { effectsOffset: effectsAt, effectWords: words },
            info: {},
            labels: {},
            policy: 'p',
            seed: 1,
        }),
        publish(tick, { epoch = 1, effectTicks = [] } = {}) {
            const slot = claimSlot(ring);
            if (slot < 0) {
                return null;
            }
            const { u32 } = ring.slots[slot];
            u32[0] = tick;
            u32[effectsAt] = effectTicks.length;
            effectTicks.forEach((effectTick, i) => {
                u32[effectsAt + 2 + i * words] = 1;
                u32[effectsAt + 2 + i * words + 1] = effectTick;
            });
            const seq = publishSlot(ring, slot, tick);
            return { type: 'snapshot', epoch, seq, slot, tick };
        },
    };
}
