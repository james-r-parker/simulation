// A world for the pack tests: a real small `ready`, a snapshot ring, frame slots and effect stores over shared memory,
// and a pack host over them.

import { createEffectStores, effectStoreBytes } from '../../../js/app/pack/effect-stores.js';
import { createFrameSlots, frameSlotBytes } from '../../../js/app/pack/frame-slots.js';
import { createPackHost } from '../../../js/app/pack/pack-host.js';
import { claimSlot, publishSlot } from '../../../js/worker/snapshot-ring.js';
import { smallReady } from './ready.js';
import { createRingWorld } from './ring-world.js';

export const READY = smallReady();
export const { info } = READY;
export const FLAGS = READY.layout.flags;
export const CAUSES = ['STARVED', 'EATEN', 'COLLISION', 'OLD_AGE', 'POISONED', 'TRAMPLED', 'DISEASE'];
export const SLOT_BYTES = 4096;

/** The agents of the first snapshot: a predator running at a forager, a reproducer, and a forager about to vanish. */
export const FIRST = [
    { slot: 0, genomeId: 1, x: 0, y: 0, angle: 0, size: 24, speed: 6, spec: 1, lineageId: 7, flags: FLAGS.JAW_OPEN },
    { slot: 1, genomeId: 2, x: 120, y: 5, angle: 0.1, size: 16, speed: 4, spec: 0, lineageId: 7 },
    { slot: 2, genomeId: 3, x: 400, y: 300, angle: 1, size: 18, speed: 1, spec: 2, lineageId: 9 },
    { slot: 3, genomeId: 4, x: 600, y: 90, angle: 2, size: 18, speed: 1, spec: 0, lineageId: 11 },
];
/** The second snapshot: the same, the last forager gone. */
export const SECOND = [
    { ...FIRST[0], x: 12, angle: 0.2 },
    { ...FIRST[1], x: 130, angle: 0.3 },
    { ...FIRST[2], x: 402, y: 301, angle: 6.0 },
];

/**
 * @returns {{ringWorld: ReturnType<typeof createRingWorld>, ring: import('../../../js/worker/snapshot-ring.js').Ring,
 *   slots: import('../../../js/app/pack/frame-slots.js').FrameSlots, slotsMemory: SharedArrayBuffer,
 *   storesMemory: SharedArrayBuffer, stores: ReturnType<typeof createEffectStores>,
 *   init: import('../../../js/app/pack/pack-host.js').PackInit,
 *   host: import('../../../js/app/pack/pack-host.js').PackHost}} a ring, frame slots, effect stores and a host
 */
export function world() {
    const ringWorld = createRingWorld({ effectsAt: 0, words: 8, slotBytes: SLOT_BYTES });
    const slotsMemory = new SharedArrayBuffer(frameSlotBytes(info));
    const slots = createFrameSlots(slotsMemory, info);
    const storesMemory = new SharedArrayBuffer(effectStoreBytes(info.maxAgents));
    const stores = createEffectStores(storesMemory, info.maxAgents);
    const init = { info, layout: READY.layout, ring: ringWorld.ring, slots, stores, causeNames: CAUSES };
    return {
        ringWorld,
        ring: ringWorld.ring,
        slots,
        slotsMemory,
        storesMemory,
        stores,
        init,
        host: createPackHost(init),
    };
}

/**
 * @param {{ring: import('../../../js/worker/snapshot-ring.js').Ring}} w the world
 * @param {ReturnType<typeof import('./snapshots.js').makeSnapshot>} snapshot a hand-built snapshot
 * @returns {number} the sequence it was published under
 */
export function publishSnapshot(w, snapshot) {
    const slot = claimSlot(w.ring);
    w.ring.slots[slot].u32.set(snapshot.u32);
    return publishSlot(w.ring, slot, snapshot.tick);
}
