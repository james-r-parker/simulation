import { describe, expect, it } from 'vitest';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { DRILLS } from '../../js/evo/drill-scenarios.js';
import { RANDOM_BRAINS, drillEdge, drillSubject, edgeOf, randomBrains, skipReason } from '../../js/evo/drill.js';
import { referenceSubject } from '../../js/evo/memory-probe-references.js';

const drill = (/** @type {string} */ name) => /** @type {any} */ (DRILLS.find((d) => d.name === name));
const zero = (/** @type {number} */ spec) => ({
    name: 'zero',
    id: 7,
    spec,
    weights: new Float32Array(brainLayout(createConfig({})).weightCount),
    act: null,
});

describe('edgeOf', () => {
    it('is the win share minus the mean of the baselines', () => {
        expect(edgeOf(0.75, [0.25, 0.5, 0, 0.25])).toBeCloseTo(0.5, 12);
        expect(edgeOf(0, [0.5, 0.5])).toBe(-0.5);
    });
});

describe('skipReason', () => {
    const base = createConfig({});
    it("skips a genome whose specialisation is not the drill's, and takes a reference as it comes", () => {
        expect(skipReason(drill('food-ahead'), zero(1), base)).toMatch(/not the drill/);
        expect(skipReason(drill('food-ahead'), zero(0), base)).toBeNull();
        expect(skipReason(drill('prey-ahead'), referenceSubject('memoryless'), base)).toBeNull();
        expect(skipReason(drill('prey-ahead'), zero(0), base)).not.toBeNull();
    });

    it('skips a hunting drill for a subject of the drill specialisation that cannot hunt, and drills one that can', () => {
        const hunting = drill('prey-ahead');
        const predator = { ...zero(hunting.spec) };
        expect(skipReason(hunting, predator, base)).toBeNull();
        const blind = {
            ...base,
            specialisations: {
                ...base.specialisations,
                predator: { ...base.specialisations.predator, canHunt: false },
            },
        };
        expect(skipReason(hunting, predator, blind)).toBe('the specialisation cannot hunt');
    });
});

describe('randomBrains', () => {
    it('draws the same RANDOM_BRAINS brains per drill and seed, and others for another drill', () => {
        const a = randomBrains(drill('food-ahead'), { seed: 3 });
        const b = randomBrains(drill('food-ahead'), { seed: 3 });
        const c = randomBrains(drill('food-behind'), { seed: 3 });
        expect(a).toHaveLength(RANDOM_BRAINS);
        expect(Array.from(b[0].weights ?? [])).toEqual(Array.from(a[0].weights ?? []));
        expect(Array.from(c[0].weights ?? [])).not.toEqual(Array.from(a[0].weights ?? []));
        expect(a[0].spec).toBe(0);
    });
});

describe('drillSubject and drillEdge', () => {
    it('replays bit for bit from the seed and scores a scripted forager above a still brain', () => {
        const options = { seed: 2, trials: 4 };
        const ref = drillSubject(drill('food-ahead'), referenceSubject('memoryless'), options);
        expect(drillSubject(drill('food-ahead'), referenceSubject('memoryless'), options)).toEqual(ref);
        expect(ref).toEqual({ wins: 4, trials: 4, winShare: 1 });
        expect(drillSubject(drill('food-ahead'), zero(0), options).winShare).toBe(0);
    });

    it('gives the scripted forager a positive edge, and reports a skip as nulls', () => {
        const edge = drillEdge(drill('food-ahead'), referenceSubject('memoryless'), { trials: 4 });
        expect(edge.winShare).toBe(1);
        expect(edge.edge).toBeCloseTo(1 - /** @type {number} */ (edge.baseline), 12);
        expect(edge.edge).toBeGreaterThan(0);
        expect(drillEdge(drill('food-ahead'), zero(1), { trials: 4 })).toEqual({
            winShare: null,
            baseline: null,
            edge: null,
            skipped: expect.any(String),
        });
    });

    it('logs a DrillTrial per trial', () => {
        /** @type {any[]} */
        const lines = [];
        const log = {
            log: (/** @type {string} */ level, /** @type {string} */ event, /** @type {any} */ f) =>
                lines.push({ level, event, ...f }),
        };
        drillSubject(drill('food-ahead'), zero(0), { trials: 3, log: /** @type {any} */ (log) });
        expect(lines.map((l) => [l.level, l.event, l.trial, l.won])).toEqual([
            ['debug', 'DrillTrial', 0, false],
            ['debug', 'DrillTrial', 1, false],
            ['debug', 'DrillTrial', 2, false],
        ]);
    });
});
