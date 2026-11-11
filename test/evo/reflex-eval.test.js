import { describe, expect, it } from 'vitest';
import { BODY_INPUT, OUTPUT_COUNT, OUTPUT_INDEX, brainLayout, inputOffsets } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { referenceSubject } from '../../js/evo/memory-probe-references.js';
import { randomWeights } from '../../js/evo/mutation.js';
import { caseNamed } from '../../js/evo/reflex-cases.js';
import { BATCH_SLOTS, createReflexWorld, evalReflex, loadGenome } from '../../js/evo/reflex-eval.js';
import { hueAwareSubject } from '../../js/evo/reflex-references.js';
import { buildCaseTable } from '../../js/evo/reflex-table.js';

const config = createConfig({});
const layout = brainLayout(config);

/**
 * @param {number} i a seed
 * @returns {import('../../js/evo/reflex-eval.js').ReflexSubject} a random brain
 */
function randomBrain(i) {
    const weights = new Float32Array(layout.weightCount);
    randomWeights(weights, layout, fork(createRng(100 + i), 'brain'), config.leakGeneStart);
    return { name: `r${i}`, id: i, weights, act: null };
}

const tables = ['flee-threat', 'approach-food', 'pick-safe-food', 'avoid-obstacle'].map((name) =>
    buildCaseTable(caseNamed(name), { trials: 4 }),
);
const predatorTables = ['approach-prey', 'bite-discrimination'].map((name) =>
    buildCaseTable(caseNamed(name), { trials: 4 }),
);
const brains = Array.from({ length: 32 }, (_, i) => randomBrain(i));

describe('createReflexWorld', () => {
    it('holds one alive slot per genome in the staged arena with the Rust kernel attached', () => {
        const world = createReflexWorld({}, 5, 1);
        expect(world.alive).toHaveLength(5);
        expect(world.alive.every((/** @type {number} */ a) => a === 1)).toBe(true);
        expect(world.spec[0]).toBe(1);
        expect(world.wasm).toBeDefined();
        expect(world.layout.rawInputCount).toBe(layout.rawInputCount);
    });
});

describe('loadGenome', () => {
    it('writes the row and derives the leak rates and the plastic block from it', () => {
        const world = createReflexWorld({}, 2, 0);
        const row = /** @type {Float32Array} */ (brains[3].weights);
        loadGenome(world, 1, row);
        const from = layout.weightCount;
        expect([...world.weights.subarray(from, from + layout.weightCount)]).toEqual([...row]);
        const size = layout.hidden * layout.geneOutputs;
        expect([...world.fastOut.subarray(size, 2 * size)]).toEqual([...row.subarray(layout.wOut, layout.bOut)]);
        expect(world.leakRate[layout.hidden]).toBeGreaterThan(0);
    });
});

describe('evalReflex', () => {
    it('resets plastic fast outputs between sequences when Hebbian learning is enabled', () => {
        const hebbian = { hebbianRate: 0.05 };
        const table = buildCaseTable(caseNamed('approach-food'), { trials: 1, config: hebbian });
        expect(evalReflex(brains.slice(0, 1), [table], { config: hebbian })).toHaveLength(1);
    });

    it('scores a world without Hebbian learning, where no plastic state needs resetting', () => {
        const plain = { hebbianRate: 0 };
        const table = buildCaseTable(caseNamed('approach-food'), { trials: 2, config: plain });
        const results = evalReflex(brains.slice(0, 2), [table], { config: plain });
        expect(results).toHaveLength(2);
        expect(results[0]['approach-food'].trials).toBe(2);
        // With the rate at 0 the plastic block never moves, so one genome scores the same alone and beside another.
        expect(evalReflex([brains[0]], [table], { config: plain })[0]).toEqual(results[0]);
    });

    it('scores every genome on every case with passes, trials, pass share and the fast share', () => {
        const results = evalReflex(brains.slice(0, 2), tables);
        expect(Object.keys(results[0])).toEqual(tables.map((t) => t.name));
        for (const score of Object.values(results[0])) {
            expect(score.trials).toBe(4);
            expect(score.passShare).toBe(score.passes / 4);
            expect(score.fast).toBeGreaterThanOrEqual(0);
            expect(score.fast).toBeLessThanOrEqual(1);
        }
    });

    it('scores a genome the same alone, among 32, in reverse slot order and in small batches', () => {
        const alone = evalReflex([brains[7]], tables)[0];
        const among = evalReflex(brains, tables);
        expect(among[7]).toEqual(alone);
        const reversed = evalReflex([...brains].reverse(), tables).reverse();
        expect(reversed).toEqual(among);
        expect(evalReflex(brains, tables, { batch: 5 })).toEqual(among);
        expect(BATCH_SLOTS).toBe(512);
    });

    it('does not carry hidden state across sequences or cases', () => {
        /**
         * @param {typeof tables} order the tables in the order to run them
         * @returns {Map<string, number[]>} slot 0's outputs at every tick of every sequence
         */
        const outputsOf = (order) => {
            /** @type {Map<string, number[]>} */
            const seen = new Map();
            evalReflex(brains.slice(0, 3), order, {
                observe: ({ world, table, sequence, tick }) =>
                    seen.set(`${table}:${sequence}:${tick}`, [...world.outputs.subarray(0, OUTPUT_COUNT)]),
            });
            return seen;
        };
        const forward = outputsOf(tables);
        const backward = outputsOf([...tables].reverse());
        expect(forward.size).toBeGreaterThan(100);
        expect(backward).toEqual(forward);
        expect([...forward.values()].some((o) => o.some((v) => v !== 0))).toBe(true);
        const first = forward.get('flee-threat:0:0');
        const later = forward.get('flee-threat:0:5');
        expect(first).not.toEqual(later);
    });

    it('logs the first failing tick of a trial at debug level, and nothing for a pass', () => {
        /** @type {Record<string, any>[]} */
        const records = [];
        const log = {
            level: /** @type {const} */ ('debug'),
            log: (/** @type {any} */ _l, /** @type {string} */ e, /** @type {any} */ f) => records.push({ e, ...f }),
        };
        const [result] = evalReflex([brains[2]], [tables[0]], { log });
        const failed = tables[0].trials - result['flee-threat'].passes;
        expect(failed).toBeGreaterThan(0);
        expect(records).toHaveLength(failed);
        expect(records[0]).toMatchObject({ e: 'ReflexCase', case: 'flee-threat', genomeId: 2, kind: 'threat' });
        expect(records[0].tick).toBeGreaterThanOrEqual(3);
        expect(Object.keys(records[0].outputs)).toEqual(['thrust', 'turn', 'sprint', 'bite']);
        expect(new Set(records.map((r) => r.trial)).size).toBe(records.length);
    });

    it('feeds the memory outputs back as the next tick inputs and starts every sequence at 0', () => {
        /** @type {number[]} */
        const seen = [];
        const at = inputOffsets(config).rawBodyStart + BODY_INPUT.MEMORY_A;
        const probe = {
            name: 'probe',
            id: 0,
            weights: null,
            act: (/** @type {Record<string, any>} */ world) => {
                seen.push(world.inputs[at]);
                world.outputs[OUTPUT_INDEX.MEMORY_A] = 0.5;
            },
        };
        evalReflex([probe], [tables[1]]);
        const perSequence = seen.length / tables[1].sequences.length;
        expect(perSequence).toBe(6);
        for (let s = 0; s < tables[1].sequences.length; s++) {
            expect(seen.slice(s * 6, s * 6 + 6)).toEqual([0, 0.5, 0.5, 0.5, 0.5, 0.5]);
        }
    });

    it('lets the reference pass each case on its own rows', () => {
        const memoryless = referenceSubject('memoryless');
        for (const table of [...tables, ...predatorTables]) {
            const reference = table.name === 'pick-safe-food' ? hueAwareSubject() : memoryless;
            const [result] = evalReflex([reference], [table]);
            expect(result[table.name].passShare, table.name).toBeGreaterThanOrEqual(0.75);
        }
    });

    it('keeps a zero brain from passing a case whose pass needs an output', () => {
        const zero = new Float32Array(layout.weightCount);
        zero.fill(config.leakGeneStart, layout.leakStart, layout.weightCount);
        const [result] = evalReflex([{ name: 'zero', id: 0, weights: zero, act: null }], tables);
        for (const table of tables) {
            expect(result[table.name].passShare, table.name).toBeLessThanOrEqual(0.5);
        }
    });

    it('runs a reference and brains together, each as it would alone', () => {
        const reference = referenceSubject('memoryless');
        const mixed = evalReflex([brains[0], reference, brains[1]], tables);
        expect(mixed[0]).toEqual(evalReflex([brains[0]], tables)[0]);
        expect(mixed[2]).toEqual(evalReflex([brains[1]], tables)[0]);
        expect(mixed[1]).toEqual(evalReflex([reference], tables)[0]);
    });

    it('refuses a table built for another layout or config with ReflexTableStale', () => {
        expect(() => evalReflex([brains[0]], tables, { config: { rayCount: 8 } })).toThrow(/ReflexTableStale/);
    });
});
