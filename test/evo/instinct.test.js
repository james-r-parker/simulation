import { describe, expect, it } from 'vitest';
import { applyHunterReflex, applyInstinct, randomGenome } from '../../js/evo/instinct.js';
import { WEIGHT_CLAMP, randomWeights } from '../../js/evo/mutation.js';
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

/**
 * @param {string} channel a pooled channel
 * @param {number} part 0 strength, 2 sine
 * @param {number} output an `OUTPUT_INDEX` value
 * @returns {number} the index of that skip weight in a row
 */
function cell(channel, part, output) {
    const base = inputOffsets(config).pooled[/** @type {keyof ReturnType<typeof inputOffsets>['pooled']} */ (channel)];
    return layout.wSkip + (base + part) * layout.geneOutputs + GENE_OUTPUTS.indexOf(output);
}

describe('applyHunterReflex', () => {
    const { THRUST, TURN, BITE } = OUTPUT_INDEX;

    it('adds the prey terms: thrust and turn at the weight, bite at twice the weight', () => {
        for (const weight of [1, 0.5]) {
            const row = new Float32Array(layout.weightCount);
            applyHunterReflex(row, layout, { weight, prey: true, kinPull: 0 });
            expect(row[cell('prey', 0, THRUST)]).toBe(weight);
            expect(row[cell('prey', 2, TURN)]).toBe(weight);
            expect(row[cell('prey', 0, BITE)]).toBe(2 * weight);
            expect(row.filter((v) => v !== 0)).toHaveLength(3);
        }
    });

    it('equals the hunter branch of applyInstinct on the prey cells, which a non-hunter does not carry', () => {
        const hunter = new Float32Array(layout.weightCount);
        applyInstinct(hunter, layout, { weight: 1, canHunt: true, herdWary: config.herdWary });
        const reflex = new Float32Array(layout.weightCount);
        applyHunterReflex(reflex, layout, { weight: 1, prey: true, kinPull: 0 });
        for (const i of [cell('prey', 0, THRUST), cell('prey', 2, TURN), cell('prey', 0, BITE)]) {
            expect(hunter[i]).toBe(reflex[i]);
        }
        expect(hunter[cell('threat', 0, THRUST)]).toBe(0);
    });

    it('clamps the prey terms at WEIGHT_CLAMP', () => {
        const row = new Float32Array(layout.weightCount).fill(WEIGHT_CLAMP - 0.25);
        applyHunterReflex(row, layout, { weight: 1, prey: true, kinPull: 0 });
        expect(row[cell('prey', 0, BITE)]).toBe(WEIGHT_CLAMP);
        expect(row[cell('prey', 0, THRUST)]).toBe(WEIGHT_CLAMP);
    });

    it('raises only the kin thrust and turn cells to kinPull x weight, as a floor that does not accumulate', () => {
        const row = new Float32Array(layout.weightCount);
        applyHunterReflex(row, layout, { weight: 2, prey: false, kinPull: 0.5 });
        expect(row[cell('kin', 0, THRUST)]).toBe(1);
        expect(row[cell('kin', 2, TURN)]).toBe(1);
        expect(row.filter((v) => v !== 0)).toHaveLength(2);
        const again = row.slice();
        applyHunterReflex(again, layout, { weight: 2, prey: false, kinPull: 0.5 });
        expect(again).toEqual(row);
    });

    it('leaves a kin cell that is already above the floor, and raises one below it', () => {
        const row = new Float32Array(layout.weightCount);
        row[cell('kin', 0, THRUST)] = 3;
        row[cell('kin', 2, TURN)] = -3;
        applyHunterReflex(row, layout, { weight: 1, prey: false, kinPull: 0.5 });
        expect(row[cell('kin', 0, THRUST)]).toBe(3);
        expect(row[cell('kin', 2, TURN)]).toBe(0.5);
    });

    it('clamps the floor at WEIGHT_CLAMP and writes no floor at kinPull 0 or weight 0', () => {
        const high = new Float32Array(layout.weightCount);
        applyHunterReflex(high, layout, { weight: 4, prey: false, kinPull: 4 });
        expect(high[cell('kin', 0, THRUST)]).toBe(WEIGHT_CLAMP);
        for (const options of [
            { weight: 1, prey: false, kinPull: 0 },
            { weight: 0, prey: false, kinPull: 0.5 },
        ]) {
            const none = new Float32Array(layout.weightCount);
            applyHunterReflex(none, layout, options);
            expect(none.every((v) => v === 0)).toBe(true);
        }
    });

    it('is in applyInstinct for a hunter with a kinPull, and not for a non-hunter', () => {
        const row = (/** @type {boolean} */ canHunt, /** @type {number} */ kinPull) => {
            const r = new Float32Array(layout.weightCount);
            applyInstinct(r, layout, { weight: 1, canHunt, herdWary: config.herdWary, kinPull });
            return r[cell('kin', 0, THRUST)];
        };
        expect(row(true, 0.5)).toBe(0.5);
        expect(row(true, 0)).toBe(0);
        expect(row(false, 0.5)).toBe(0);
    });

    it('randomGenome takes the kin pull from kinPullWeight', () => {
        const genome = (/** @type {Record<string, any>} */ over) => {
            const row = new Float32Array(layout.weightCount);
            const world = {
                config: createConfig({ instinctWeight: 1, ...over }),
                layout,
                spec: new Uint8Array([PREDATOR]),
            };
            randomGenome(world, 0, { row, rng: createRng(5) });
            return row;
        };
        const off = genome({ kinPullWeight: 0 });
        const on = genome({ kinPullWeight: 0.5 });
        expect(off[cell('kin', 0, THRUST)]).not.toBe(on[cell('kin', 0, THRUST)]);
        expect(on[cell('kin', 0, THRUST)]).toBeGreaterThanOrEqual(0.5);
        expect(on[cell('kin', 2, TURN)]).toBeGreaterThanOrEqual(0.5);
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
