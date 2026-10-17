import { describe, expect, it } from 'vitest';
import { ensureRoom } from '../../js/evo/growable-log.js';
import { createObserver } from '../../js/evo/observer.js';
import { createRng } from '../../js/sim/rng.js';
import { drainObserverLogs } from '../../js/worker/observer-drain.js';
import { smallWorld } from '../sim/helpers/small-world.js';

/**
 * Pushes a death row and a checkpoint row the way the observer does.
 * @param {Record<string, any>} observer the observer
 * @returns {void}
 */
function pushRows(observer) {
    ensureRoom(observer.deaths, observer.deathCount);
    observer.deathCount += 1;
    ensureRoom(observer.series, observer.checkpointCount);
    observer.checkpointCount += 1;
}

describe('drainObserverLogs', () => {
    it('keeps the log capacities bounded over 100000 pushed rows when drained every 1000', () => {
        const observer = createObserver(smallWorld().config, createRng(1));
        for (let i = 1; i <= 100_000; i++) {
            pushRows(observer);
            if (i % 1000 === 0) {
                drainObserverLogs(observer);
            }
        }
        expect(observer.deathCount).toBe(0);
        expect(observer.checkpointCount).toBe(0);
        expect(observer.deaths.capacity).toBeLessThanOrEqual(1024);
        expect(observer.series.capacity).toBeLessThanOrEqual(1024);
    });

    it('would grow past 100000 rows without a drain', () => {
        const observer = createObserver(smallWorld().config, createRng(1));
        for (let i = 0; i < 100_000; i++) {
            pushRows(observer);
        }
        expect(observer.deaths.capacity).toBeGreaterThanOrEqual(100_000);
    });

    it('adds the removed death rows to deathsDrained', () => {
        const observer = createObserver(smallWorld().config, createRng(1));
        for (let i = 0; i < 7; i++) {
            pushRows(observer);
        }
        drainObserverLogs(observer);
        pushRows(observer);
        pushRows(observer);
        drainObserverLogs(observer);
        expect(observer.deathsDrained).toBe(9);
    });
});
