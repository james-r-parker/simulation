import { describe, expect, it } from 'vitest';
import { snapshotArchive } from '../../js/evo/archive-snapshot.js';
import { ELITE, offer, placeOf, seedArchive } from '../../js/evo/archive.js';
import { createTrainerArchive, mergeEpisode, runEpisode } from '../../js/evo/trainer.js';
import { WELFORD_STRIDE, welfordAdd } from '../../js/evo/welford.js';
import { createConfig } from '../../js/sim/config.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

/** A small world where agents mature and are offered within a few thousand ticks. */
const WORLD = {
    worldWidth: 2400,
    worldHeight: 1600,
    initialAgents: 40,
    maxAgents: 80,
    minAgents: 20,
    maxFood: 60,
    initialFood: 60,
    maturityTicks: 200,
    herdCount: 0,
    refugeCount: 0,
};

/**
 * @param {Record<string, any>} [extra] task fields
 * @returns {import('../../js/evo/trainer.js').EpisodeTask} a 3000-tick episode from an empty archive
 */
function task(extra = {}) {
    const archive = createTrainerArchive(createConfig(WORLD));
    return {
        seed: 5,
        overrides: WORLD,
        snapshot: snapshotArchive(archive),
        ticks: 3000,
        offerFromTick: 1000,
        ...extra,
    };
}

describe('runEpisode', () => {
    it(
        'replays bit for bit from the task',
        () => {
            // Random brains must learn to hold BITE before they eat (eat-choice G1), so the episode needs the full length to
            // have offers to compare.
            const a = runEpisode(task());
            const b = runEpisode(task());
            expect(b).toEqual(a);
        },
        scaleTimeout(20_000),
    );

    it(
        'offers only deaths from offerFromTick and leaves the frozen snapshot untouched',
        () => {
            const t = task();
            const before = snapshotArchive(createTrainerArchive(createConfig(WORLD)));
            const result = runEpisode(t);
            expect(result.offers.every((o) => o.tick >= 1000)).toBe(true);
            expect(runEpisode(task({ offerFromTick: 3001 })).offers).toEqual([]);
            for (const name of /** @type {const} */ (['rows', 'stats', 'ids', 'occupied'])) {
                expect(Buffer.from(t.snapshot[name].buffer).equals(Buffer.from(before[name].buffer))).toBe(true);
            }
            expect(result.ticks).toBe(3000);
        },
        scaleTimeout(20_000),
    );
});

/**
 * @returns {{snapshots: import('../../js/evo/archive-snapshot.js').ArchiveSnapshot[], share: number}} a pool of one snapshot
 *   holding tested elites of every specialisation, as a share-1 pool (every founder is drawn from it)
 */
function fullPool() {
    const archive = createTrainerArchive(createConfig(WORLD));
    for (let spec = 0; spec < 5; spec++) {
        for (let cell = 0; cell < 4; cell++) {
            const weights = new Float32Array(archive.layout.weightCount).fill(0.01 * (cell + 1));
            seedArchive(archive, { spec, cell, id: 9000 + spec * 10 + cell, sigma: 0.05, weights });
            welfordAdd(archive.stats, placeOf(spec, cell, ELITE) * WELFORD_STRIDE, 4);
        }
    }
    return { snapshots: [snapshotArchive(archive)], share: 1 };
}

describe('runEpisode with an opponent pool', () => {
    it(
        'plays the episode a run without the option plays when the share is 0',
        () => {
            const plain = runEpisode(task());
            const zero = runEpisode(task({ pool: { ...fullPool(), share: 0 } }));
            expect(zero).toEqual(plain);
        },
        scaleTimeout(20_000),
    );

    it(
        'replays bit for bit, and offers no pool founder: only its children can reach the archive',
        () => {
            // Seed 4, not the file's seed 5: pooled-v6's longer genome row reshuffles each seed's streams, and the no-pool
            // run on seed 5 now offers 0 founders, so the claim below had nothing to check. Founders the no-pool run
            // offers at that HEAD, by seed: 1 has 2, 2 has 1, 3 has 1, 4 has 4, 5 has 0, 6 has 4.
            const pooled = (/** @type {Record<string, any>} */ extra = {}) =>
                task({ seed: 4, pool: fullPool(), ...extra });
            const a = runEpisode(pooled());
            expect(runEpisode(pooled())).toEqual(a);
            // Every initial agent (ids 1 to 40) is a pool founder at share 1, so none of them is offered; the same episode
            // without the pool offers some of them (asserted, so the claim cannot pass on a run that offers nothing).
            const plain = runEpisode(task({ seed: 4 }));
            expect(plain.offers.filter((o) => o.id <= WORLD.initialAgents).length).toBeGreaterThan(0);
            expect(a.offers.every((o) => o.id > WORLD.initialAgents)).toBe(true);
        },
        scaleTimeout(20_000),
    );
});

describe('mergeEpisode', () => {
    it(
        'applies the offers in order, as offer() would, and takes the cursors',
        () => {
            const result = runEpisode(task());
            const merged = createTrainerArchive(createConfig(WORLD));
            const outcomes = mergeEpisode(merged, { ...result, cursors: Int32Array.of(1, 2, 3, 4, 5) });
            const direct = createTrainerArchive(createConfig(WORLD));
            for (const item of result.offers) {
                offer(direct, item);
            }
            expect(snapshotArchive(merged).ids).toEqual(snapshotArchive(direct).ids);
            expect(Object.values(outcomes).reduce((a, b) => a + b, 0)).toBe(result.offers.length);
            expect(Array.from(merged.cursors)).toEqual([1, 2, 3, 4, 5]);
        },
        scaleTimeout(20_000),
    );
});
