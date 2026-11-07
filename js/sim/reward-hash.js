// The byte views of the reward state that `hashWorld` covers: the trace. Cached per world so a checkpoint allocates
// nothing after the first call.

/** @type {WeakMap<object, Uint8Array[]>} */
const cache = new WeakMap();

/**
 * @param {Record<string, any>} world the world
 * @returns {Uint8Array[]} the bytes to hash: the trace
 */
export function rewardHashBytes(world) {
    let views = cache.get(world);
    if (views === undefined) {
        const t = world.rewardTrace;
        views = [new Uint8Array(t.buffer, t.byteOffset, t.byteLength)];
        cache.set(world, views);
    }
    return views;
}
