// The opponent pool (docs/designs/training-stages.md, Opponent pool): frozen archive snapshots a stage with a `pool`
// share draws some of its founders from, so a lineage meets the past of the other roles. Trainer state: it never reaches
// a champion file or the live world. Pure: no files, no clock.

/** A periodic snapshot is taken every this many checkpoints. */
export const POOL_EVERY = 2;
/** The most snapshots the pool holds. */
export const POOL_MAX = 8;

/**
 * @typedef {object} PoolEntry
 * @property {import('./archive-snapshot.js').ArchiveSnapshot} snapshot the frozen archive
 * @property {number} generation the generations completed when it was taken
 * @property {string} stage the stage that was running
 * @property {'stage-pass' | 'periodic'} kind why it was taken
 */

/**
 * @typedef {object} Pool
 * @property {readonly PoolEntry[]} entries the snapshots, oldest first
 * @property {number} checkpoints the checkpoints seen (the periodic snapshots' clock)
 */

/** @returns {Pool} an empty pool */
export function createPool() {
    return { entries: [], checkpoints: 0 };
}

/**
 * Adds a snapshot. Over `POOL_MAX` the oldest periodic snapshot goes first, so the stage-pass snapshots are kept longest;
 * when every snapshot is a stage pass the oldest of them goes.
 * @param {Pool} pool the pool
 * @param {PoolEntry} entry the new snapshot
 * @returns {Pool} the pool with it added (the input is not changed)
 */
export function addSnapshot(pool, entry) {
    const entries = [...pool.entries, entry];
    while (entries.length > POOL_MAX) {
        const periodic = entries.findIndex((e) => e.kind === 'periodic');
        entries.splice(periodic >= 0 ? periodic : 0, 1);
    }
    return { ...pool, entries };
}

/**
 * Counts a checkpoint and says which snapshot it takes: a stage pass takes a `stage-pass` snapshot, otherwise every
 * `POOL_EVERY`-th checkpoint takes a `periodic` one.
 * @param {Pool} pool the pool
 * @param {{stagePassed: string | null}} checkpoint the stage that passed at this checkpoint, if any
 * @returns {{pool: Pool, take: 'stage-pass' | 'periodic' | null}} the pool with the checkpoint counted, and the snapshot
 *   to take now (the caller adds it with `addSnapshot`)
 */
export function noteCheckpoint(pool, { stagePassed }) {
    const checkpoints = pool.checkpoints + 1;
    let take = null;
    if (stagePassed !== null) {
        take = /** @type {const} */ ('stage-pass');
    } else if (checkpoints % POOL_EVERY === 0) {
        take = /** @type {const} */ ('periodic');
    }
    return { pool: { ...pool, checkpoints }, take };
}

/**
 * @param {Pool} pool the pool
 * @param {string} stage a stage name
 * @returns {PoolEntry | null} the newest stage-pass snapshot taken when `stage` passed; null when none is held
 */
export function stagePassSnapshot(pool, stage) {
    return pool.entries.findLast((e) => e.kind === 'stage-pass' && e.stage === stage) ?? null;
}

/**
 * @param {Pool} pool the pool
 * @returns {{generation: number, stage: string, kind: string}[]} each snapshot's generation, stage and kind, oldest first
 *   (what `TrainPool` logs and an archive file records)
 */
export function describePool(pool) {
    return pool.entries.map(({ generation, stage, kind }) => ({ generation, stage, kind }));
}
