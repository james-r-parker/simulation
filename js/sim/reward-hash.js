// The byte views of the reward state that `hashWorld` covers when `rewardedHebb` is on: the trace, and with `rewardShuffle` the
// delivery queue and the `reward-shuffle` stream. Cached per world so a checkpoint allocates nothing after the first call.

const NONE = /** @type {Uint8Array[]} */ ([]);

/** @type {WeakMap<object, {source: Uint32Array | null, views: Uint8Array[]}>} */
const cache = new WeakMap();

/**
 * @param {ArrayBufferView} array a typed array
 * @returns {Uint8Array} its raw bytes
 */
function bytes(array) {
    return new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
}

/**
 * @param {Record<string, any>} world the world
 * @returns {Uint8Array[]} the bytes to hash: empty with `rewardedHebb` off, else the trace, then with `rewardShuffle` the queue
 *   (due ticks, magnitudes) and the shuffle stream's state
 */
export function rewardHashBytes(world) {
    if (world.rewardTrace === undefined) {
        return NONE;
    }
    let entry = cache.get(world);
    const source = world.rewardDue === undefined ? null : world.rng['reward-shuffle'].s;
    if (entry === undefined || entry.source !== source) {
        const views = [bytes(world.rewardTrace)];
        if (source !== null) {
            views.push(bytes(world.rewardDue), bytes(world.rewardMag), bytes(source));
        }
        entry = { source, views };
        cache.set(world, entry);
    }
    return entry.views;
}
