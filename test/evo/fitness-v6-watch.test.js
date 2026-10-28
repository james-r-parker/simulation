import { describe, expect, it } from 'vitest';
import { FITNESS_V6_WATCH, createWatchGroup } from '../../js/evo/fitness-v6-watch.js';

/**
 * A stand-in for the observer with the watch counters; slot 0 holds the given values.
 * @param {{chaseTicks?: number, convergedKills?: number, patches?: number}} fields
 * @returns {any}
 */
function observerWith({ chaseTicks = 0, convergedKills = 0, patches = 0 }) {
    return {
        chaseTicks: Uint32Array.of(chaseTicks),
        intent: { convergedKills: Uint32Array.of(convergedKills) },
        watch: { visited: Uint32Array.of(patches) },
    };
}

describe('FITNESS_V6_WATCH', () => {
    it('names the doc constants', () => {
        expect(FITNESS_V6_WATCH).toEqual({ CHASE: 0.5, CHASE_CAP: 600, PACK: 30, MIGRATE: 40, MIGRATE_CAP: 8 });
    });

    it('is frozen', () => {
        expect(Object.isFrozen(FITNESS_V6_WATCH)).toBe(true);
    });
});

describe('createWatchGroup', () => {
    it('scores 0 for zero counters', () => {
        const g = createWatchGroup();
        const o = observerWith({});
        expect([g.chase(o, 0), g.pack(o, 0), g.migrate(o, 0), g.watch(o, 0)]).toEqual([0, 0, 0, 0]);
    });

    it('pays CHASE per chase tick', () => {
        expect(createWatchGroup().chase(observerWith({ chaseTicks: 40 }), 0)).toBe(20);
    });

    it('caps the chase term at CHASE_CAP ticks', () => {
        const g = createWatchGroup();
        expect(g.chase(observerWith({ chaseTicks: 600 }), 0)).toBe(300);
        expect(g.chase(observerWith({ chaseTicks: 601 }), 0)).toBe(300);
        expect(g.chase(observerWith({ chaseTicks: 100000 }), 0)).toBe(300);
    });

    it('pays PACK per converged kill with no cap', () => {
        const g = createWatchGroup();
        expect(g.pack(observerWith({ convergedKills: 3 }), 0)).toBe(90);
        expect(g.pack(observerWith({ convergedKills: 1000 }), 0)).toBe(30000);
    });

    it('pays MIGRATE per distinct patch visited', () => {
        expect(createWatchGroup().migrate(observerWith({ patches: 3 }), 0)).toBe(120);
    });

    it('caps the migration term at MIGRATE_CAP patches', () => {
        const g = createWatchGroup();
        expect(g.migrate(observerWith({ patches: 8 }), 0)).toBe(320);
        expect(g.migrate(observerWith({ patches: 9 }), 0)).toBe(320);
        expect(g.migrate(observerWith({ patches: 500 }), 0)).toBe(320);
    });

    it('sums the three terms into watch', () => {
        const o = observerWith({ chaseTicks: 100, convergedKills: 2, patches: 2 });
        expect(createWatchGroup().watch(o, 0)).toBe(50 + 60 + 80);
    });

    it('returns the ungated value, so the gate is applied by the composition', () => {
        expect('gate' in createWatchGroup()).toBe(false);
    });

    it('reads the requested slot', () => {
        const g = createWatchGroup();
        const o = {
            chaseTicks: Uint32Array.of(0, 10),
            intent: { convergedKills: Uint32Array.of(0, 1) },
            watch: { visited: Uint32Array.of(0, 2) },
        };
        expect(g.watch(o, 0)).toBe(0);
        expect(g.watch(o, 1)).toBe(5 + 30 + 80);
    });

    it('merges overrides over the constants and exposes the weights', () => {
        const g = createWatchGroup({ CHASE: 1, MIGRATE_CAP: 2 });
        expect(g.weights).toEqual({ ...FITNESS_V6_WATCH, CHASE: 1, MIGRATE_CAP: 2 });
        expect(g.chase(observerWith({ chaseTicks: 10 }), 0)).toBe(10);
        expect(g.migrate(observerWith({ patches: 5 }), 0)).toBe(80);
        expect(FITNESS_V6_WATCH.CHASE).toBe(0.5);
    });
});
