// The byte views of the reward state that `hashWorld` covers when `rewardedHebb` is on: the trace. Cached per world so a
// checkpoint allocates nothing after the first call.

const NONE = /** @type {Uint8Array[]} */ ([]);

/** @type {WeakMap<object, Uint8Array[]>} */
const cache = new WeakMap();

/**
 * @param {Record<string, any>} world the world
 * @returns {Uint8Array[]} the bytes to hash: empty with `rewardedHebb` off, else the trace
 */
export function rewardHashBytes(world) {
    if (world.rewardTrace === undefined) {
        return NONE;
    }
    let views = cache.get(world);
    if (views === undefined) {
        const t = world.rewardTrace;
        views = [new Uint8Array(t.buffer, t.byteOffset, t.byteLength)];
        cache.set(world, views);
    }
    return views;
}
