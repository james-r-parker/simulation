// The trainer's opponent pool on disk and in the run (docs/designs/training-stages.md, Opponent pool): which snapshots a
// run takes when, how a `--resume` rebuilds them from the archive files beside the resumed one, and what an episode task
// carries. The pool is trainer state: it never reaches a champion file or the live world.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { decodeArchive } from '../../js/evo/archive-codec.js';
import { snapshotArchive } from '../../js/evo/archive-snapshot.js';
import { addSnapshot, createPool, describePool, noteCheckpoint } from '../../js/evo/opponent-pool.js';
import { TRAINER_DESCRIPTOR } from '../../js/evo/trainer.js';
import { createConfig, rulesHash } from '../../js/sim/config.js';

/**
 * @param {import('../../js/evo/opponent-pool.js').Pool} pool the pool
 * @returns {{checkpoints: number, entries: {generation: number, stage: string, kind: string}[]}} what an archive file
 *   records of it: the checkpoint clock and each snapshot's generation, stage and kind
 */
export function poolIndex(pool) {
    return { checkpoints: pool.checkpoints, entries: describePool(pool) };
}

/**
 * Rebuilds a pool from its index: each snapshot is the archive `archive-<generation - 1>.json` beside the resumed file.
 * @param {string} resumePath the `archive-<g>.json` a run resumes from
 * @param {{checkpoints: number, entries: {generation: number, stage: string, kind: 'stage-pass' | 'periodic'}[]} | null | undefined} index
 *   the index the archive file records (none: an empty pool)
 * @returns {import('../../js/evo/opponent-pool.js').Pool} the pool
 * @throws {Error} naming the file when a snapshot's archive is missing
 */
export function loadPool(resumePath, index) {
    if (index === null || index === undefined) {
        return createPool();
    }
    const config = createConfig({});
    const entries = index.entries.map((entry) => {
        const path = join(dirname(resumePath), `archive-${entry.generation - 1}.json`);
        if (!existsSync(path)) {
            throw new Error(
                `--resume ${resumePath}: the pool snapshot of generation ${entry.generation} needs ${path}`,
            );
        }
        const json = JSON.parse(readFileSync(path, 'utf8'));
        const archive = decodeArchive({ ...json, rulesHash: rulesHash(config) }, config, undefined, TRAINER_DESCRIPTOR);
        return { ...entry, snapshot: snapshotArchive(archive, { shared: true }) };
    });
    return { entries, checkpoints: index.checkpoints };
}

/**
 * Counts a checkpoint and takes the snapshot it is due.
 * @param {import('../../js/evo/opponent-pool.js').Pool} pool the pool
 * @param {{archive: import('../../js/evo/archive.js').Archive, generation: number, stage: string, stagePassed: string | null}} at
 *   the archive after the checkpoint's generation, the generations completed, the running stage and the stage that passed
 * @returns {{pool: import('../../js/evo/opponent-pool.js').Pool, taken: 'stage-pass' | 'periodic' | null}} the pool and
 *   the kind of snapshot taken (none: null)
 */
export function poolAfterCheckpoint(pool, { archive, generation, stage, stagePassed }) {
    const noted = noteCheckpoint(pool, { stagePassed });
    if (noted.take === null) {
        return { pool: noted.pool, taken: null };
    }
    const entry = {
        snapshot: snapshotArchive(archive, { shared: true }),
        generation,
        kind: noted.take,
        stage: stagePassed ?? stage,
    };
    return { pool: addSnapshot(noted.pool, entry), taken: noted.take };
}

/**
 * @param {import('../../js/evo/opponent-pool.js').Pool} pool the pool
 * @param {number | undefined} share the stage's `pool` share
 * @returns {{snapshots: import('../../js/evo/archive-snapshot.js').ArchiveSnapshot[], share: number} | undefined} what an
 *   episode task of the stage carries; undefined when the share is 0 or absent or the pool is empty, so the task is the
 *   one a run without the option writes
 */
export function taskPool(pool, share) {
    const drawn = share ?? 0;
    if (drawn <= 0 || pool.entries.length === 0) {
        return undefined;
    }
    return { snapshots: pool.entries.map((e) => e.snapshot), share: drawn };
}
