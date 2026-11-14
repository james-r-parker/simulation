// The ground marks and season motes, seeded per world: frost ticks thick at the cold north and south edges, drought
// cracks in each basin (drawn only in the basin under drought), and the season motes drifting over the map, which
// change model one by one over the last 5% of a season. Pure; nothing allocates after `createGroundPack`.

import { createPrng } from '../prng.js';

const ITEM = 4;
export const FROST_TICKS = 700;
export const CRACKS_PER_BASIN = 90;
export const SEASON_MOTES = 384;
/** The share of a season after which motes start to switch to the next season's model. */
export const MOTE_SWITCH_FROM = 0.95;
const MOTE_DRIFT = 6;
const MOTE_RADIUS = 5;
/** Season motes by season: spring pollen, summer heat, autumn leaves, winter frost. */
export const MOTE_ROLES = Object.freeze(['pollen', 'heat', 'leaf', 'frost']);

/** @param {number} capacity rows @returns {{pose: Float32Array, neon: Float32Array, count: number}} a bucket */
function bucket(capacity) {
    return { pose: new Float32Array(capacity * ITEM), neon: new Float32Array(capacity * ITEM), count: 0 };
}

/**
 * @param {{pose: Float32Array}} b a bucket (or any object with a `pose` lane)
 * @param {number} o the row offset
 * @param {ArrayLike<number>} values x, y, angle, radius
 * @returns {void}
 */
function put(b, o, values) {
    b.pose[o] = values[0];
    b.pose[o + 1] = values[1];
    b.pose[o + 2] = values[2];
    b.pose[o + 3] = values[3];
}

/**
 * @param {{next: () => number}} prng the stream
 * @param {{W: number, H: number, margin: number}} world the world size and the cold margin depth
 * @returns {{pose: Float32Array, neon: Float32Array, count: number}} the frost ticks, thick at the edges
 */
function layFrost(prng, { W, H, margin }) {
    const frost = bucket(FROST_TICKS);
    if (margin <= 0) {
        return frost;
    }
    for (let i = 0; i < FROST_TICKS; i++) {
        const depth = margin * prng.next() * prng.next();
        const y = i % 2 === 0 ? depth : H - depth;
        put(frost, i * ITEM, [prng.next() * W, y, prng.next() * Math.PI, 5 + 5 * (1 - depth / margin)]);
    }
    frost.count = FROST_TICKS;
    return frost;
}

/**
 * @param {{next: () => number}} prng the stream
 * @param {{W: number, H: number, margin: number, wallX: number}} world the world size, cold margin and wall
 * @returns {Float32Array} the cracks of the west basin, then the east
 */
function layCracks(prng, { W, H, margin, wallX }) {
    const cracks = new Float32Array(2 * CRACKS_PER_BASIN * ITEM);
    for (let i = 0; i < 2 * CRACKS_PER_BASIN; i++) {
        const west = i < CRACKS_PER_BASIN;
        const x = west ? prng.next() * (wallX - 40) : wallX + 40 + prng.next() * (W - wallX - 40);
        put({ pose: cracks }, i * ITEM, [
            x,
            margin + prng.next() * (H - 2 * margin),
            prng.next() * Math.PI,
            16 + 22 * prng.next(),
        ]);
    }
    return cracks;
}

/**
 * @param {{next: () => number}} prng the stream
 * @param {{W: number, H: number}} world the world size
 * @returns {Float32Array} per mote: x, y, drift x, drift y, winter row share, switch share, turn, radius
 */
function layMotes(prng, { W, H }) {
    const motes = new Float32Array(SEASON_MOTES * 8);
    for (let i = 0; i < SEASON_MOTES; i++) {
        const a = prng.next() * Math.PI * 2;
        const m = i * 8;
        motes[m] = prng.next() * W;
        motes[m + 1] = prng.next() * H;
        motes[m + 2] = Math.cos(a) * MOTE_DRIFT;
        motes[m + 3] = Math.sin(a) * MOTE_DRIFT;
        motes[m + 4] = prng.next();
        motes[m + 5] = MOTE_SWITCH_FROM + (1 - MOTE_SWITCH_FROM) * prng.next();
        motes[m + 6] = prng.next() * Math.PI;
        motes[m + 7] = MOTE_RADIUS * (0.7 + 0.6 * prng.next());
    }
    return motes;
}

/**
 * @param {Record<string, any>} info `ready.info` (world size, `terrain.coldMarginWidth`, `terrain.wallX`)
 * @param {number} seed the world seed
 * @returns {Record<string, any>} the frost, crack and mote buckets with their seeded layouts
 */
export function createGroundPack(info, seed) {
    const prng = createPrng((seed ^ 0x6a09e667) >>> 0);
    const world = {
        W: info.worldWidth,
        H: info.worldHeight,
        margin: info.terrain?.coldMarginWidth ?? 0,
        wallX: info.terrain?.wallX ?? info.worldWidth / 2,
    };
    return {
        frost: layFrost(prng, world),
        crack: bucket(CRACKS_PER_BASIN),
        cracks: layCracks(prng, world),
        motes: layMotes(prng, world),
        moteBuckets: [0, 1, 2, 3].map(() => bucket(SEASON_MOTES)),
        ...world,
    };
}

const SCRATCH = new Float64Array(4);

/**
 * @param {number} v a value
 * @param {number} size the period
 * @returns {number} `v` wrapped into [0, size)
 */
function wrap(v, size) {
    return ((v % size) + size) % size;
}

/**
 * Writes this frame's cracks and motes (frost is static).
 * @param {Record<string, any>} pack the ground pack
 * @param {{timeSec: number, season: number, seasonProgress: number, droughtBasin: number}} view the wall time, the
 *   season index and progress and the basin under drought (-1 for none)
 * @returns {void}
 */
export function packGround(pack, { timeSec, season, seasonProgress, droughtBasin }) {
    pack.crack.count = 0;
    if (droughtBasin === 0 || droughtBasin === 1) {
        pack.crack.pose.set(
            pack.cracks.subarray(droughtBasin * CRACKS_PER_BASIN * ITEM, (droughtBasin + 1) * CRACKS_PER_BASIN * ITEM),
        );
        pack.crack.count = CRACKS_PER_BASIN;
    }
    for (const b of pack.moteBuckets) {
        b.count = 0;
    }
    const { motes, W, H, margin } = pack;
    for (let i = 0; i < SEASON_MOTES; i++) {
        const m = i * 8;
        const s = ((season % 4) + (seasonProgress >= motes[m + 5] ? 1 : 0)) % 4;
        const b = pack.moteBuckets[s];
        const x = wrap(motes[m] + motes[m + 2] * timeSec, W);
        let y = wrap(motes[m + 1] + motes[m + 3] * timeSec, H);
        if (s === 3 && margin > 0) {
            const u = motes[m + 4];
            y = u < 0.5 ? u * 2 * margin : H - (u - 0.5) * 2 * margin;
        }
        SCRATCH[0] = x;
        SCRATCH[1] = y;
        SCRATCH[2] = motes[m + 6] + timeSec * 0.3;
        SCRATCH[3] = motes[m + 7];
        put(b, b.count * ITEM, SCRATCH);
        b.count += 1;
    }
}
