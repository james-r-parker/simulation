import { describe, expect, it } from 'vitest';
import { snapshotArchive } from '../../js/evo/archive-snapshot.js';
import { offer } from '../../js/evo/archive.js';
import { createTrainerArchive, mergeEpisode, runEpisode } from '../../js/evo/trainer.js';
import { createConfig } from '../../js/sim/config.js';

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
    it('replays bit for bit from the task', () => {
        const a = runEpisode(task());
        const b = runEpisode(task());
        expect(a.offers.length).toBeGreaterThan(0);
        expect(b).toEqual(a);
    });

    it('offers only deaths from offerFromTick and leaves the frozen snapshot untouched', () => {
        const t = task();
        const before = snapshotArchive(createTrainerArchive(createConfig(WORLD)));
        const result = runEpisode(t);
        expect(result.offers.every((o) => o.tick >= 1000)).toBe(true);
        expect(runEpisode(task({ offerFromTick: 3001 })).offers).toEqual([]);
        for (const name of /** @type {const} */ (['rows', 'stats', 'ids', 'occupied'])) {
            expect(Buffer.from(t.snapshot[name].buffer).equals(Buffer.from(before[name].buffer))).toBe(true);
        }
        expect(result.ticks).toBe(3000);
    });
});

describe('mergeEpisode', () => {
    it('applies the offers in order, as offer() would, and takes the cursors', () => {
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
    });
});
