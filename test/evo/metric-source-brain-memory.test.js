// Source tests, brain family, memory and memory-output metrics (docs/designs/metric-trust.md, T20): the real `step`
// (with `forwardAll`), `observe`, `checkpoint` and `computeMetrics` on a scripted world with hand-built weight rows.
// Every test plants an event in the final tick and one in a tick a body dies.

import { describe, expect, it } from 'vitest';
import { GENE_OUTPUTS, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { applyGenes, leakRateOf } from '../../js/sim/traits.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { stddev } from '../../js/evo/metrics-stats.js';
import { brainSourceRun, starve } from './helpers/source-world.js';

/** Sets all hidden-unit leak genes of `slot` to `gene` and applies its genes. */
function setLeakGene(/** @type {any} */ world, /** @type {number} */ slot, /** @type {number} */ gene) {
    const { layout } = world;
    const start = slot * layout.weightCount + layout.leakStart;
    world.weights.fill(gene, start, start + layout.hidden);
    applyGenes(world, slot);
}

/** Assigns both world and observer lineage id for `slot`. */
function setLineage(/** @type {any} */ r, /** @type {number} */ slot, /** @type {number} */ lineage) {
    r.world.lineageId[slot] = lineage;
    r.observer.lineageId[slot] = lineage;
}

/**
 * Five checkpoints after burn-in over three lineages:
 * - Lineage 1 (`a1, a2`): leak gene -5 (on the floor and slow).
 * - Lineage 2 (`b1, b2`): leak gene -3 (slow, above the floor).
 * - Lineage 3 (`c1, c2, d, e`): leak gene 0 (neither slow nor floor).
 * `d` dies in the step of Checkpoint 3; `e` dies in the final tick (Checkpoint 5).
 */
function runLeakCheckpoints() {
    const r = brainSourceRun();
    const { world } = r;
    const [a1, a2, b1, b2, c1, c2, d, e] = Array.from({ length: 8 }, () => r.spawn());
    [a1, a2].forEach((s) => {
        setLineage(r, s, 1);
        setLeakGene(world, s, -5);
    });
    [b1, b2].forEach((s) => {
        setLineage(r, s, 2);
        setLeakGene(world, s, -3);
    });
    [c1, c2, d, e].forEach((s) => {
        setLineage(r, s, 3);
        setLeakGene(world, s, 0);
    });
    r.jump(BURN_IN_TICKS);
    for (let k = 0; k < 5; k++) {
        r.tick((w) => {
            if (k === 2) {
                starve(w, d, 50);
            }
            if (k === 4) {
                starve(w, e, 50);
            }
        });
        r.check();
    }
    return { m: r.metrics(), leakMin: world.config.leakMin };
}

describe('leak_rate_mean, leak_slow_share, leak_at_floor_share and leak_lineage_spread', () => {
    const { m, leakMin } = runLeakCheckpoints();
    const r1 = Math.fround(leakRateOf(-5, leakMin));
    const r2 = Math.fround(leakRateOf(-3, leakMin));
    const r3 = Math.fround(leakRateOf(0, leakMin));

    it('leak_rate_mean averages the sampled hidden units across all 5 checkpoints: (30 r1 + 30 r2 + 48 r3) / 108', () => {
        expect(m['eval.leak_rate_mean'].value).toBeCloseTo((30 * r1 + 30 * r2 + 48 * r3) / 108, 12);
    });

    it('leak_slow_share counts lineages 1 and 2 (60 of 108 sampled hidden units)', () => {
        expect(m['eval.leak_slow_share'].value).toBeCloseTo(60 / 108, 12);
    });

    it('leak_at_floor_share counts lineage 1 (30 of 108 sampled hidden units)', () => {
        expect(m['eval.leak_at_floor_share'].value).toBeCloseTo(30 / 108, 12);
    });

    it('leak_lineage_spread is the SD of the three lineage mean leak rates across the 5 checkpoints', () => {
        expect(m['eval.leak_lineage_spread'].value).toBeCloseTo(stddev(Float64Array.from([r1, r2, r3])), 12);
    });
});

describe('hidden_persistence', () => {
    it('averages the 16-tick cosine similarities across 31 agent pairs (16 at Checkpoint 1, 15 in the final tick)', () => {
        const every = 100;
        const r = brainSourceRun({ checkpointTicks: every, over: { maxAgents: 32 } });
        const { world } = r;
        const agents = Array.from({ length: 16 }, () => r.spawn());
        const doomed = r.spawn();
        const { layout } = world;
        agents.forEach((slot) => setLeakGene(world, slot, 10));
        const setHiddenBias = (/** @type {number[]} */ slots, /** @type {number} */ bias) => {
            for (const slot of slots) {
                world.weights[slot * layout.weightCount + layout.bHidden] = bias;
            }
        };
        setHiddenBias(agents, 10);
        r.jump(BURN_IN_TICKS + every - 16 - 1);
        r.tick();
        setHiddenBias(agents.slice(12), -10);
        r.jump(BURN_IN_TICKS + every - 1);
        r.tick((w) => starve(w, doomed, 50));
        r.check();
        expect(r.metrics()['eval.hidden_persistence'].value).toBeNull();
        setHiddenBias(agents.slice(12), 10);
        r.jump(BURN_IN_TICKS + 2 * every - 16 - 1);
        r.tick();
        setHiddenBias(agents.slice(12), -10);
        r.jump(BURN_IN_TICKS + 2 * every - 1);
        r.tick((w) => starve(w, agents[15], 50));
        r.check();
        expect(r.observer.memory.persistPairs).toBe(31);
        expect(r.metrics()['eval.hidden_persistence'].value).toBeCloseTo((12 - 4 + (12 - 3)) / 31, 12);
    });
});

describe('memory_out_flat_share, memory_out_noisy_share and memory_out_signal_share', () => {
    it('classifies 100 lives of 600 ticks (50 flat, 30 noisy, 20 signal), the 100th dying in the final tick', () => {
        const r = brainSourceRun({ over: { maxAgents: 128 } });
        const { world } = r;
        const agents = Array.from({ length: 100 }, () => r.spawn());
        const { layout } = world;
        const memACol = GENE_OUTPUTS.indexOf(OUTPUT_INDEX.MEMORY_A);
        const noisy = agents.slice(50, 80);
        const signal = agents.slice(80, 100);
        const setMemBias = (/** @type {number[]} */ slots, /** @type {number} */ bias) => {
            for (const slot of slots) {
                world.weights[slot * layout.weightCount + layout.bOut + memACol] = bias;
            }
        };
        for (let sample = 0; sample < 4; sample++) {
            setMemBias(noisy, sample % 2 === 0 ? 2 : -2);
            setMemBias(signal, sample < 2 ? 2 : -2);
            r.jump(BURN_IN_TICKS + 4 * sample - 1);
            r.tick((w) => {
                for (const slot of agents) {
                    w.energy[slot] = 800;
                }
            });
        }
        r.tick((w) => {
            for (const slot of agents.slice(0, 99)) {
                starve(w, slot, 600);
            }
        });
        expect(r.metrics()['eval.memory_out_flat_share'].value).toBeNull();
        r.tick((w) => starve(w, agents[99], 600));
        const m = r.metrics();
        expect(m['eval.memory_out_flat_share']).toEqual({ value: 50 / 100 });
        expect(m['eval.memory_out_noisy_share']).toEqual({ value: 30 / 100 });
        expect(m['eval.memory_out_signal_share']).toEqual({ value: 20 / 100 });
    });
});
