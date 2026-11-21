import { describe, expect, it } from 'vitest';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { DRILLS } from '../../js/evo/drill-scenarios.js';
import {
    RANDOM_BRAINS,
    drillEdge,
    drillSubject,
    edgeOf,
    randomBrains,
    skipReason,
    winBounds,
} from '../../js/evo/drill.js';
import { oracleSubject } from '../../js/evo/lesson-oracles.js';
import { referenceSubject } from '../../js/evo/memory-probe-references.js';
import { createRng, fork } from '../../js/sim/rng.js';

const drill = (/** @type {string} */ name) => /** @type {any} */ (DRILLS.find((d) => d.name === name));
const stream = (/** @type {string} */ name) => fork(createRng(1), `drill:${name}`);
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

/** The 95% Wilson score interval written out plainly, as the reference for the arithmetic. */
function naiveWilson(/** @type {number} */ k, /** @type {number} */ n) {
    const z = 1.96;
    const p = k / n;
    const centre = p + (z * z) / (2 * n);
    const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
    const scale = 1 + (z * z) / n;
    return { low: (centre - spread) / scale, high: (centre + spread) / scale };
}

describe('winBounds', () => {
    it('is the Wilson low bound of the win share and that bound minus the high bound of the pooled random share', () => {
        const random = [
            { wins: 2, trials: 32 },
            { wins: 0, trials: 32 },
            { wins: 3, trials: 32 },
            { wins: 1, trials: 32 },
        ];
        const { winShareLow, edgeLow } = winBounds({ wins: 28, trials: 32 }, random);
        expect(winShareLow).toBeCloseTo(naiveWilson(28, 32).low, 3);
        expect(edgeLow).toBeCloseTo(naiveWilson(28, 32).low - naiveWilson(6, 128).high, 3);
        expect(edgeLow).toBeGreaterThan(0);
    });

    it('reads a subject no better than the random brains as an edge low bound under 0', () => {
        const same = Array.from({ length: 4 }, () => ({ wins: 8, trials: 32 }));
        expect(winBounds({ wins: 8, trials: 32 }, same).edgeLow).toBeLessThan(0);
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
        expect(edge.winShareLow).toBeCloseTo(naiveWilson(4, 4).low, 3);
        expect(edge.edgeLow).toBeLessThan(/** @type {number} */ (edge.edge));
        expect(drillEdge(drill('food-ahead'), zero(1), { trials: 4 })).toEqual({
            winShare: null,
            baseline: null,
            edge: null,
            winShareLow: null,
            edgeLow: null,
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

describe('control arms', () => {
    const pack = drill('pack-converge');

    it('plays the arms only when asked, on the same bearings, and replays from the seed', () => {
        const options = { seed: 2, trials: 3 };
        const subject = oracleSubject('pack-converge');
        const plain = drillSubject(pack, subject, options);
        expect(plain.arms).toBeUndefined();
        const withArms = drillSubject(pack, subject, { ...options, arms: true });
        expect(withArms).toEqual({ ...plain, arms: withArms.arms });
        expect(Object.keys(/** @type {object} */ (withArms.arms))).toEqual(['solo', 'kin-blind']);
        expect(withArms.arms?.solo.trials).toBe(3);
        expect(drillSubject(pack, subject, { ...options, arms: true })).toEqual(withArms);
    });

    it('has no arms for a drill without them, whatever is asked', () => {
        expect(drillSubject(drill('food-ahead'), zero(0), { trials: 1, arms: true }).arms).toBeUndefined();
    });

    it('runs the drill under its arena rules over the caller config: a wall costs nothing in pack-converge', () => {
        const plan = pack.plan(stream(pack.name), 400);
        expect(pack.arena).toEqual({ wallDamage: 0 });
        expect(plan.maxTicks).toBe(600);
        expect(drillSubject(pack, zero(1), { trials: 2, config: { wallDamage: 5 } }).wins).toBe(0);
    });

    it('passes the subject arms through drillEdge, and skips a subject that cannot hunt', () => {
        const edge = drillEdge(pack, oracleSubject('pack-converge'), { trials: 2, arms: true });
        expect(Object.keys(edge.arms ?? {})).toEqual(['solo', 'kin-blind']);
        expect(drillEdge(pack, oracleSubject('pack-converge'), { trials: 2 }).arms).toBeUndefined();
    });

    it('hands the validated config to the drill plan, the one the trials run under', () => {
        const seen = /** @type {any[]} */ ([]);
        const probe = {
            ...pack,
            plan: (/** @type {any} */ rng, /** @type {number} */ view, /** @type {any} */ config) => (
                seen.push(config),
                pack.plan(rng, view)
            ),
        };
        drillSubject(probe, zero(1), { trials: 2, config: { wallDamage: 5 } });
        expect(seen).toHaveLength(2);
        expect(seen[0]).toBe(seen[1]);
        expect(seen[0].worldWidth).toBe(createConfig({ wallDamage: 0 }).worldWidth);
        expect(seen[0].wallDamage).toBe(0);
    });
});
