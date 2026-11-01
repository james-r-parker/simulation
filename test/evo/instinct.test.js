import { describe, expect, it } from 'vitest';
import { applyInstinct, randomGenome } from '../../js/evo/instinct.js';
import { randomWeights } from '../../js/evo/mutation.js';
import { stageWorld } from '../../js/evo/pool-discrimination-stage.js';
import { createConfig } from '../../js/sim/config.js';
import {
    GENE_OUTPUTS,
    OUTPUT_COUNT,
    OUTPUT_INDEX,
    POOLED_STRIDE,
    brainLayout,
    inputOffsets,
} from '../../js/sim/brain-layout.js';
import { createRng } from '../../js/sim/rng.js';
import { step } from '../../js/sim/step.js';

const config = createConfig();
const layout = brainLayout(config);
const FORAGER = 0;
const PREDATOR = 1;

/** A staged world's row: random fill (seeded) plus the instinct, or the instinct alone on zeros. */
/**
 * @param {number} seed
 * @param {number} weight
 * @param {boolean} canHunt
 * @param {boolean} [pure]
 */
function rowOf(seed, weight, canHunt, pure = false) {
    const row = new Float32Array(layout.weightCount);
    if (!pure) {
        randomWeights(row, layout, createRng(seed), config.leakGeneStart);
    }
    applyInstinct(row, layout, { weight, canHunt, herdWary: config.herdWary });
    return row;
}

/** Stages one subject (slot 0) with other agents and food, runs `ticks` ticks, returns the world. */
/** @param {{subject: any, others?: any[], foods?: any[], ticks?: number, seed?: number, cfg?: any}} o */
function run({ subject, others = [], foods = [], ticks = 1, seed = 1, cfg = {} }) {
    const staged = stageWorld({ foods, rocks: [], agents: [subject, ...others], seed, config: cfg });
    for (let t = 0; t < ticks; t++) {
        step(staged.world, staged.policy);
    }
    return staged.world;
}

/** @type {(angle: number, d: number, from?: {x: number, y: number}) => {x: number, y: number}} */
const at = (angle, d, from = { x: 1500, y: 2000 }) => ({
    x: from.x + d * Math.cos(angle),
    y: from.y + d * Math.sin(angle),
});

/**
 * @param {Float32Array} weights
 * @param {number} [spec]
 */
function subjectAt(weights, spec = FORAGER) {
    return { x: 1500, y: 2000, angle: 0, spec, energy: 800, weights };
}

describe('instinctWeight', () => {
    it('defaults to 1 (the survival screen) and is bounded 0 to 4', () => {
        expect(config.instinctWeight).toBe(1);
        expect(createConfig({ instinctWeight: 0 }).instinctWeight).toBe(0);
        expect(createConfig({ instinctWeight: 4 }).instinctWeight).toBe(4);
        expect(() => createConfig({ instinctWeight: 4.5 })).toThrow(/instinctWeight/);
        expect(() => createConfig({ instinctWeight: -1 })).toThrow(/instinctWeight/);
    });
});

describe('applyInstinct', () => {
    it('leaves both food hue skip rows unchanged for hunters and other agents', () => {
        const hue = inputOffsets(config).foodHueStart;
        const plain = rowOf(5, 0, false);
        for (const canHunt of [false, true]) {
            const row = plain.slice();
            applyInstinct(row, layout, { weight: 1, canHunt, herdWary: config.herdWary });
            const start = layout.wSkip + hue * layout.geneOutputs;
            const end = start + 2 * layout.geneOutputs;
            expect(row.subarray(start, end)).toEqual(plain.subarray(start, end));
        }
    });

    it('at weight 0 leaves the genome bit-identical and randomGenome draws the same stream', () => {
        const plain = new Float32Array(layout.weightCount);
        randomWeights(plain, layout, createRng(5), config.leakGeneStart);
        for (const canHunt of [false, true]) {
            const row = plain.slice();
            applyInstinct(row, layout, { weight: 0, canHunt, herdWary: config.herdWary });
            expect(row).toEqual(plain);
        }
        const rng = createRng(5);
        const world = { config: createConfig({ instinctWeight: 0 }), layout, spec: new Uint8Array([PREDATOR]) };
        const row = new Float32Array(layout.weightCount);
        randomGenome(world, 0, { row, rng });
        expect(row).toEqual(plain);
        const ref = createRng(5);
        randomWeights(new Float32Array(layout.weightCount), layout, ref, config.leakGeneStart);
        expect(rng.s).toEqual(ref.s);
    });

    it('at weight 1 draws the same stream as at 0 and changes only skip weights and the three call biases', () => {
        const plain = new Float32Array(layout.weightCount);
        randomWeights(plain, layout, createRng(5), config.leakGeneStart);
        const row = plain.slice();
        applyInstinct(row, layout, { weight: 1, canHunt: false, herdWary: config.herdWary });
        /** @type {number[]} */
        const changed = [];
        row.forEach((v, i) => v !== plain[i] && changed.push(i));
        expect(
            changed.every(
                (i) => (i >= layout.wSkip && i < layout.traitStart) || (i >= layout.bOut && i < layout.wSkip),
            ),
        ).toBe(true);
        for (const o of [OUTPUT_INDEX.ALARM, OUTPUT_INDEX.HUNT, OUTPUT_INDEX.SMOKE]) {
            expect(row[layout.bOut + GENE_OUTPUTS.indexOf(o)]).toBe(-2);
        }
    });

    it('adds the wary thrust and turn terms on the megafauna channel for hunters and foragers', () => {
        const channel = inputOffsets(config).pooled.megafauna;
        for (const canHunt of [false, true]) {
            const row = new Float32Array(layout.weightCount);
            applyInstinct(row, layout, { weight: 1, canHunt, herdWary: 0.5 });
            const thrust =
                layout.wSkip + (channel + 0) * layout.geneOutputs + GENE_OUTPUTS.indexOf(OUTPUT_INDEX.THRUST);
            const turn = layout.wSkip + (channel + 2) * layout.geneOutputs + GENE_OUTPUTS.indexOf(OUTPUT_INDEX.TURN);
            expect(row[thrust]).toBe(0.5);
            expect(row[turn]).toBe(-0.5);
        }
    });

    it('leaves the wary terms unchanged at herdWary 0 and consumes no random draws at its default', () => {
        const plain = new Float32Array(layout.weightCount);
        randomWeights(plain, layout, createRng(9), config.leakGeneStart);
        const row = plain.slice();
        applyInstinct(row, layout, { weight: 1, canHunt: false, herdWary: 0 });
        const channel = inputOffsets(config).pooled.megafauna;
        const waryStart = layout.wSkip + channel * layout.geneOutputs;
        const waryEnd = waryStart + POOLED_STRIDE * layout.geneOutputs;
        expect(row.subarray(waryStart, waryEnd)).toEqual(plain.subarray(waryStart, waryEnd));

        const rng = createRng(9);
        const world = { config, layout, spec: new Uint8Array([FORAGER]) };
        randomGenome(world, 0, { row: new Float32Array(layout.weightCount), rng });
        const ref = createRng(9);
        randomWeights(new Float32Array(layout.weightCount), layout, ref, config.leakGeneStart);
        expect(rng.s).toEqual(ref.s);
    });

    it('turns towards food on its left and on its right (sign checked by the heading change)', () => {
        for (const side of [0.5, -0.5]) {
            const food = at(side, 200);
            const world = run({ subject: subjectAt(rowOf(1, 1, false, true)), foods: [food], ticks: 3 });
            const turned = world.angle[0];
            expect(Math.sign(turned)).toBe(Math.sign(side));
            expect(world.outputs[OUTPUT_INDEX.THRUST]).toBeGreaterThan(0);
        }
    });

    it('a forager turns away from a hunter on its left and on its right', () => {
        for (const side of [0.5, -0.5]) {
            const hunter = { ...at(side, 200), angle: Math.PI + side, spec: PREDATOR, energy: 1500 };
            const world = run({ subject: subjectAt(rowOf(1, 1, false, true)), others: [hunter], ticks: 1 });
            expect(Math.sign(world.angle[0])).toBe(-Math.sign(side));
            expect(world.outputs[OUTPUT_INDEX.THRUST]).toBeGreaterThan(0);
        }
    });

    it('keeps the alarm, hunt call and smoke below their thresholds with nothing in view', () => {
        for (const spec of [FORAGER, PREDATOR]) {
            const world = run({ subject: subjectAt(rowOf(3, 1, spec === PREDATOR), spec), ticks: 5 });
            for (const o of [OUTPUT_INDEX.ALARM, OUTPUT_INDEX.HUNT, OUTPUT_INDEX.SMOKE]) {
                expect(world.outputs[o]).toBeLessThan(-0.9);
            }
            expect(world.outputs[OUTPUT_COUNT - 1]).toBeDefined();
        }
    });
});

describe('a predator with the instinct', () => {
    /** Prey at a random bearing ahead; the predator's brain is a random genome plus the instinct at `weight`. */
    /**
     * @param {number} weight
     * @param {number} seed
     */
    function bites(weight, seed) {
        const angle = ((seed % 7) - 3) * 0.12;
        const prey = { ...at(angle, 300), angle: 0, spec: FORAGER, energy: 800 };
        const world = run({
            subject: { x: 1500, y: 2000, angle: 0, spec: PREDATOR, energy: 1500, weights: rowOf(seed, weight, true) },
            others: [prey],
            ticks: 300,
            seed,
        });
        return world.biteEnergy[0] > 0 ? 1 : 0;
    }

    it('closes on and bites prey within 300 ticks more often than a random brain, over a few seeds', () => {
        let on = 0;
        let off = 0;
        for (let seed = 1; seed <= 24; seed++) {
            on += bites(1, seed);
            off += bites(0, seed);
        }
        expect(on).toBeGreaterThan(off + 4);
    });
});
