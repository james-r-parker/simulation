// A synchronous pack worker for the frame-loop and layer tests: a real ring, frame slots and pack host over one small
// world's snapshot. `answer` packs the newest request the way the worker would between two frames.

import { createRequest, readRequest, takeFrame, writeRequest } from '../../../js/app/pack/frame-slots.js';
import { packRequest } from '../../../js/app/pack/pack-host.js';
import { publishSnapshot, world } from './pack-world.js';

/**
 * @param {ReturnType<typeof import('./ready.js').smallReady>} ready a small world's `ready` fields and snapshot
 * @returns {{w: ReturnType<typeof world>, client: Record<string, any>, getPack: () => any, answer: () => boolean,
 *   step: (loop: {frame: (nowMs: number) => void}, nowMs: number) => void,
 *   produce: (fields?: Record<string, any>, over?: Record<string, any>) => any,
 *   frameOf: (over?: Record<string, any>) => any}} the world, a fake sim client holding the snapshot
 *   from the ring, the frame slots getter the loop takes, and helpers: `answer` packs the newest request, `step` runs
 *   a frame and then answers, `frameOf` takes the newest slot into a frame for a layer, `produce` writes a request
 *   for the snapshot, answers it and takes the slot into a frame
 */
export function packRig(ready) {
    const w = world({ ready, slotBytes: ready.snapshot.buffer.byteLength });
    const seq = publishSnapshot(w, /** @type {any} */ (ready.snapshot));
    const at = w.ring.header.indexOf(seq, 1) - 1;
    const client = {
        info: ready.info,
        ring: w.ring,
        prev: null,
        latest: { epoch: 1, seq, tick: ready.snapshot.tick, ...w.ring.slots[at] },
        effects: null,
        field: /** @type {any} */ (null),
        stats: /** @type {any} */ (null),
        released: 0,
        releaseField() {
            client.released += 1;
            client.field = null;
        },
    };
    const request = createRequest();
    const answer = () => readRequest(w.slots, request) !== 0 && packRequest(w.host, request);
    return {
        w,
        client,
        getPack: () => w.slots,
        answer,
        step(loop, nowMs) {
            loop.frame(nowMs);
            answer();
        },
        produce(fields = {}, over = {}) {
            const asked = createRequest();
            Object.assign(asked, { latestSeq: seq, alpha: 1, tick: ready.snapshot.tick, nowMs: 1000, zoom: 1 }, fields);
            writeRequest(w.slots, asked);
            answer();
            return this.frameOf(over);
        },
        frameOf(over = {}) {
            const agents = takeFrame(w.slots);
            return {
                agents,
                packed: w.slots.current,
                packedSeq: w.slots.taken.seq,
                family: { ids: new Int32Array(8).fill(-1), palette: 'default', version: 0, top: [] },
                lenses: { temperature: false, scent: false, calls: false },
                camera: { zoom: 1 },
                nowMs: 1000,
                dtMs: 16,
                tick: ready.snapshot.tick,
                ...over,
            };
        },
    };
}
