import { describe, expect, it } from 'vitest';
import { FITNESS_V6_LINEAGE, createLineageGroup } from '../../js/evo/fitness-v6-lineage.js';

/**
 * A stand-in for the observer with the three per-slot lineage counters; slot 0 holds the given values.
 * @param {{matings?: number, maturedChildren?: number, descendantsAlive?: number}} fields
 * @returns {any}
 */
function observerWith({ matings = 0, maturedChildren = 0, descendantsAlive = 0 }) {
    return {
        matings: Uint32Array.of(matings),
        maturedChildren: Uint32Array.of(maturedChildren),
        descendantsAlive: Uint32Array.of(descendantsAlive),
    };
}

describe('FITNESS_V6_LINEAGE', () => {
    it('names the doc constants', () => {
        expect(FITNESS_V6_LINEAGE).toEqual({ MATING: 100, MATURED: 250, FAMILY: 40, FAMILY_CAP: 10 });
    });

    it('is frozen', () => {
        expect(Object.isFrozen(FITNESS_V6_LINEAGE)).toBe(true);
    });
});

describe('createLineageGroup', () => {
    it('scores 0 for zero counters', () => {
        const g = createLineageGroup();
        const o = observerWith({});
        expect([g.mating(o, 0), g.matured(o, 0), g.family(o, 0), g.lineage(o, 0)]).toEqual([0, 0, 0, 0]);
    });

    it('pays MATING per mating', () => {
        const g = createLineageGroup();
        expect(g.mating(observerWith({ matings: 3 }), 0)).toBe(300);
    });

    it('pays MATURED per matured child', () => {
        const g = createLineageGroup();
        expect(g.matured(observerWith({ maturedChildren: 2 }), 0)).toBe(500);
    });

    it('pays FAMILY per descendant alive', () => {
        const g = createLineageGroup();
        expect(g.family(observerWith({ descendantsAlive: 4 }), 0)).toBe(160);
    });

    it('caps the family term at FAMILY_CAP descendants', () => {
        const g = createLineageGroup();
        expect(g.family(observerWith({ descendantsAlive: 10 }), 0)).toBe(400);
        expect(g.family(observerWith({ descendantsAlive: 11 }), 0)).toBe(400);
        expect(g.family(observerWith({ descendantsAlive: 5000 }), 0)).toBe(400);
    });

    it('has no cap on matings or matured children', () => {
        const g = createLineageGroup();
        expect(g.mating(observerWith({ matings: 1000 }), 0)).toBe(100000);
        expect(g.matured(observerWith({ maturedChildren: 1000 }), 0)).toBe(250000);
    });

    it('sums the three terms into lineage', () => {
        const g = createLineageGroup();
        expect(g.lineage(observerWith({ matings: 2, maturedChildren: 1, descendantsAlive: 3 }), 0)).toBe(
            200 + 250 + 120,
        );
    });

    it('returns the ungated value, so the gate is applied by the composition', () => {
        const g = createLineageGroup();
        expect('gate' in g).toBe(false);
    });

    it('reads the requested slot', () => {
        const g = createLineageGroup();
        const o = {
            matings: Uint32Array.of(0, 5),
            maturedChildren: Uint32Array.of(0, 0),
            descendantsAlive: Uint32Array.of(0, 0),
        };
        expect(g.lineage(o, 0)).toBe(0);
        expect(g.lineage(o, 1)).toBe(500);
    });

    it('takes overrides for the weights and the cap', () => {
        const g = createLineageGroup({ MATING: 1, MATURED: 2, FAMILY: 3, FAMILY_CAP: 4 });
        const o = observerWith({ matings: 10, maturedChildren: 10, descendantsAlive: 10 });
        expect(g.weights).toEqual({ MATING: 1, MATURED: 2, FAMILY: 3, FAMILY_CAP: 4 });
        expect([g.mating(o, 0), g.matured(o, 0), g.family(o, 0)]).toEqual([10, 20, 12]);
    });

    it('keeps the defaults for weights not overridden and leaves the constants alone', () => {
        const g = createLineageGroup({ FAMILY: 0 });
        expect(g.weights.MATURED).toBe(250);
        expect(g.family(observerWith({ descendantsAlive: 9 }), 0)).toBe(0);
        expect(FITNESS_V6_LINEAGE.FAMILY).toBe(40);
    });
});
