// Source tests, brain family, weights, plasticity, instinct and rewards (docs/designs/metric-trust.md, T20): the real
// `step` (with `forwardAll` and `sampleInputActivity`), `observe`, `checkpoint` and `computeMetrics` on a scripted world
// with hand-built weight rows. Every test plants an event in the final tick and one in a tick a body dies.

import { describe, expect, it } from 'vitest';
import { GENE_OUTPUTS, OUTPUT_INDEX, POOLED_STRIDE } from '../../js/sim/brain-layout.js';
import { ACTIVITY_SAMPLE_TICKS, RARE_MIN_SAMPLES } from '../../js/sim/input-activity.js';
import { applyGenes } from '../../js/sim/traits.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { brainSourceRun, plantMeat, starve, zeroPolicy } from './helpers/source-world.js';

const PREDATOR = 1;

/** A policy whose next spawn takes the specialisation in `next.spec`. */
function specPolicy() {
    const next = { spec: 0 };
    return { next, policy: { ...zeroPolicy(), initSpec: () => next.spec } };
}

/** Places a still female agent at `(x, y)` with comfortable temperature and zeroed timers. */
function park(/** @type {any} */ w, /** @type {number} */ slot, /** @type {number} */ x, /** @type {number} */ y) {
    w.x[slot] = x;
    w.y[slot] = y;
    w.vx[slot] = 0;
    w.vy[slot] = 0;
    w.turnRate[slot] = 0;
    w.sex[slot] = 0;
    w.ageTicks[slot] = 0;
    w.ateTimer[slot] = 30;
    w.bittenTimer[slot] = 30;
    w.energy[slot] = 200;
    w.size[slot] = w.config.baseSize + w.energy[slot] / w.config.energyToSize;
    w.temperature[slot] = 50;
}

describe('input_active_share, input_active_share.threat and input_active_share.prey', () => {
    it('counts the pooled inputs active in the tick a body dies and in the final tick', () => {
        const { next, policy } = specPolicy();
        const r = brainSourceRun({ policy, over: { worldWidth: 2000, worldHeight: 2000 } });
        const { world } = r;
        next.spec = PREDATOR;
        const hunter = r.spawn();
        next.spec = 0;
        const prey = r.spawn();
        const doomed = r.spawn();
        world.lineageId[hunter] = 1;
        world.lineageId[prey] = 2;
        world.lineageId[doomed] = 3;
        const posePair = (/** @type {any} */ w) => {
            park(w, hunter, 500, 1000);
            w.energy[hunter] = 800;
            w.size[hunter] = 24;
            w.angle[hunter] = 0;
            park(w, prey, 550, 1000);
            w.angle[prey] = Math.PI;
        };
        r.jump(BURN_IN_TICKS);
        r.tick((w) => {
            posePair(w);
            park(w, doomed, 1500, 1000);
            starve(w, doomed, 50);
        });
        r.jump(BURN_IN_TICKS + ACTIVITY_SAMPLE_TICKS);
        r.tick(posePair);
        const m = r.metrics();
        // Ray 0 (`sin = 0`) hits once per sample for threat (on prey) and prey (on hunter): 2 nonzero values per sample.
        // Body inputs active: hunter 5 (energy, size, spec, temp, |temp-mid|), prey 4, doomed 5 (+ ageTicks) = 31 total.
        expect(world.inputActivity.samples).toBe(5);
        expect(m['eval.input_active_share.threat'].value).toBeCloseTo(4 / (5 * POOLED_STRIDE), 12);
        expect(m['eval.input_active_share.prey'].value).toBeCloseTo(4 / (5 * POOLED_STRIDE), 12);
        expect(m['eval.input_active_share'].value).toBeCloseTo(31 / (5 * world.layout.inputCount), 12);
    });
});

/**
 * Four agents A, B, C, D. At `BURN_IN_TICKS`, `sampleInputActivity` crosses `RARE_MIN_SAMPLES` and refreshes the rare mask;
 * D dies in that step and Checkpoint 1 samples A, B, C. C dies in the final tick and Checkpoint 2 samples A, B.
 */
function runWeightCheckpoints() {
    const r = brainSourceRun();
    const { world, observer } = r;
    const [a, b, c, d] = Array.from({ length: 4 }, () => r.spawn());
    observer.sigma = new Float64Array(world.config.maxAgents);
    [a, b, c, d].forEach((slot, i) => {
        observer.sigma[slot] = [0.1, 0.2, 0.3, 0.4][i];
    });
    world.inputActivity.samples = RARE_MIN_SAMPLES - 4;
    world.inputActivity.active[0] = RARE_MIN_SAMPLES - 4;
    r.jump(BURN_IN_TICKS);
    r.tick((w) => {
        [a, b, c, d].forEach((slot, i) => park(w, slot, 100 + 200 * i, 200));
        starve(w, d, 50);
    });
    const { layout } = world;
    const H = layout.hidden;
    [a, b, c].forEach((slot, s) => {
        const rareW = [3, 1.5, 0][s];
        const base = slot * layout.weightCount;
        for (let i = 0; i < layout.inputCount; i++) {
            const val = world.inputActivity.rare[i] === 1 ? rareW : 1;
            world.weights.fill(val, base + layout.wIn + i * H, base + layout.wIn + (i + 1) * H);
        }
    });
    world.weights.fill(4, a * layout.weightCount + layout.wOut, a * layout.weightCount + layout.bOut);
    r.check();
    r.tick((w) => starve(w, c, 50));
    r.check();
    return { m: r.metrics(), layout };
}

describe('weight_drift_silent, weight_clamp_share and sigma_mean', () => {
    const { m, layout } = runWeightCheckpoints();
    const scannedPerAgent = layout.bHidden - layout.wIn + (layout.bOut - layout.wOut);
    const wOutCount = layout.bOut - layout.wOut;

    it('weight_drift_silent averages the checkpoint rare/other ratios 1.5 (after D dies) and 2.25 (final tick)', () => {
        expect(m['eval.weight_drift_silent'].value).toBeCloseTo((1.5 + 2.25) / 2, 12);
    });

    it('weight_clamp_share counts the clamped wOut weights of A across the 3 + 2 sampled agents', () => {
        expect(m['eval.weight_clamp_share'].value).toBeCloseTo((2 * wOutCount) / (5 * scannedPerAgent), 12);
    });

    it('sigma_mean averages the policy sigma over the 3 + 2 alive agents at the two checkpoints', () => {
        expect(m['eval.sigma_mean'].value).toBeCloseTo(0.9 / 5, 12);
    });
});

describe('rare_input_saturation_jump', () => {
    it('measures the hidden-saturation jump across 100 first firings settled in the final tick', () => {
        const r = brainSourceRun({ over: { maxAgents: 32 } });
        const { world } = r;
        const agents = Array.from({ length: 20 }, () => r.spawn());
        const doomed = r.spawn();
        const { layout } = world;
        const H = layout.hidden;
        // Five body inputs that are 0 when still/unaged/unfed and nonzero when set: turnRate, pregnancy, ate, bitten, age.
        const rareInputs = [56 + 3, 56 + 5, 56 + 9, 56 + 10, 56 + 12];
        world.inputActivity.samples = RARE_MIN_SAMPLES;
        world.inputActivity.rareCount = rareInputs.length;
        rareInputs.forEach((inp, idx) => {
            world.inputActivity.rare[inp] = 1;
            world.inputActivity.rareIdx[idx] = inp;
        });
        agents.forEach((slot, idx) => {
            const base = slot * layout.weightCount;
            const saturatedUnits = idx < 12 ? 3 : 1;
            for (const inp of rareInputs) {
                for (let j = 0; j < saturatedUnits; j++) {
                    world.weights[base + layout.wIn + inp * H + j] = 100;
                }
            }
            for (let j = 0; j < H; j++) {
                world.weights[base + layout.leakStart + j] = 10;
            }
            applyGenes(world, slot);
        });
        const fireRare = (/** @type {any} */ w) => {
            agents.forEach((slot, idx) => {
                park(w, slot, 100 + (idx % 5) * 180, 100 + Math.floor(idx / 5) * 180);
                w.turnRate[slot] = 0.1;
                w.pregnancy[slot] = 5;
                w.ateTimer[slot] = 0;
                w.bittenTimer[slot] = 0;
                w.ageTicks[slot] = 10;
            });
        };
        r.jump(BURN_IN_TICKS - 1);
        r.tick((w) => {
            agents.forEach((slot, idx) => park(w, slot, 100 + (idx % 5) * 180, 100 + Math.floor(idx / 5) * 180));
            park(w, doomed, 900, 900);
        });
        r.jump(BURN_IN_TICKS + 3);
        r.tick((w) => {
            fireRare(w);
            starve(w, doomed, 50);
        });
        r.jump(BURN_IN_TICKS + 7);
        r.tick(fireRare);
        expect(r.observer.saturation.events).toBe(100);
        expect(r.metrics()['eval.rare_input_saturation_jump'].value).toBeCloseTo((60 * 1 + 40 * (1 / 3)) / 100, 12);
    });
});

describe('hebb_drift and hebb_drift_clamped_share', () => {
    it('moves fastOut[0] onto HEBB_CLAMP (4) in real steps while a body dies and at the final checkpoint', () => {
        const r = brainSourceRun({ over: { hebbianRate: 1, rewardBase: 1 } });
        const { world } = r;
        const [a, b, c] = Array.from({ length: 3 }, () => r.spawn());
        const { layout } = world;
        const thrustCol = GENE_OUTPUTS.indexOf(OUTPUT_INDEX.THRUST);
        [a, b].forEach((slot, idx) => {
            const base = slot * layout.weightCount;
            world.weights[base + layout.bHidden] = 10;
            world.weights[base + layout.bOut + thrustCol] = 10;
            world.weights[base + layout.wOut + thrustCol] = idx === 0 ? 2 : 1;
            world.weights[base + layout.traitStart + 3] = 10;
            world.weights[base + layout.leakStart] = 10;
            applyGenes(world, slot);
        });
        r.jump(BURN_IN_TICKS);
        for (let stepIdx = 0; stepIdx < 4; stepIdx++) {
            r.tick((w) => {
                [a, b].forEach((slot) => {
                    w.ageTicks[slot] = 600;
                    w.energy[slot] = 800;
                });
                if (stepIdx === 3) {
                    starve(w, c, 50);
                }
            });
        }
        r.check();
        const second = r.spawn();
        r.tick((w) => {
            w.ageTicks[a] = 605;
            starve(w, b, 605);
            w.ageTicks[second] = 10;
        });
        r.check();
        const m = r.metrics();
        const entriesPerAgent = layout.hidden * layout.geneOutputs;
        // Agent A has wOut[0]=2, fastOut[0]=4 -> drift |4-2|/2 = 1; B has wOut[0]=1, fastOut[0]=4 -> drift |4-1|/1 = 3.
        // Checkpoint 1 samples A and B (drifts 1 and 3); Checkpoint 2 samples A (drift 1; `second` is under 600 ticks).
        expect(m['eval.hebb_drift'].value).toBeCloseTo((1 + 3 + 1) / 3, 12);
        expect(m['eval.hebb_drift_clamped_share'].value).toBeCloseTo(3 / (3 * entriesPerAgent), 12);
    });
});

describe('instinct_drift', () => {
    it('compares post-burn-in instinct distance against the founders across a death tick and the final tick', () => {
        const r = brainSourceRun({ over: { instinctWeight: 1 } });
        const { world, observer } = r;
        const [a, b, c, d] = Array.from({ length: 4 }, () => r.spawn());
        const { cells, prior } = observer.instinct.other;
        const n = world.layout.weightCount;
        const setOffset = (/** @type {number} */ slot, /** @type {number} */ delta) => {
            for (let i = 0; i < cells.length; i++) {
                world.weights[slot * n + cells[i]] = prior[i] + delta;
            }
        };
        [a, b, c, d].forEach((slot) => setOffset(slot, 1));
        r.jump(BURN_IN_TICKS - 10);
        r.check();
        setOffset(a, 2);
        setOffset(b, 4);
        setOffset(c, 3);
        r.jump(BURN_IN_TICKS);
        r.tick((w) => starve(w, d, 50));
        r.check();
        setOffset(a, 1);
        setOffset(b, 1);
        r.tick((w) => starve(w, c, 50));
        r.check();
        expect(r.metrics()['eval.instinct_drift'].value).toBeCloseTo((3 + 1) / 2, 6);
    });
});

describe('reward_events.kill, reward_events.bite and reward_events.scavenge', () => {
    it('counts non-fatal bites, fatal kills and scavenged meat per 1k hunter agent-ticks through the final tick', () => {
        const { next, policy } = specPolicy();
        const r = brainSourceRun({ policy, over: { predatorRestTicks: 0 } });
        const { world } = r;
        next.spec = PREDATOR;
        const hunter = r.spawn();
        next.spec = 0;
        const victim = r.spawn();
        const victim2 = r.spawn();
        world.lineageId[hunter] = 1;
        world.lineageId[victim] = 2;
        world.lineageId[victim2] = 3;
        r.want(hunter, OUTPUT_INDEX.BITE);
        // Step 1: non-fatal bite on `victim` (hunter has room to store energy) + scavenged meat item.
        r.tick((w) => {
            w.x[hunter] = 500;
            w.y[hunter] = 500;
            w.angle[hunter] = 0;
            w.energy[hunter] = 800;
            w.size[hunter] = 24;
            w.x[victim] = 520;
            w.y[victim] = 500;
            w.energy[victim] = 400;
            w.size[victim] = 12;
            w.x[victim2] = 200;
            w.y[victim2] = 200;
            plantMeat(w, hunter, 50);
        });
        // Step 2: fatal bite on `victim` (a body dies in this tick).
        r.tick((w) => {
            w.x[hunter] = 500;
            w.y[hunter] = 500;
            w.angle[hunter] = 0;
            w.energy[hunter] = 800;
            w.size[hunter] = 24;
            w.x[victim] = 520;
            w.y[victim] = 500;
            w.energy[victim] = 1;
            w.size[victim] = 12;
        });
        // Step 3 (final tick): non-fatal bite on `victim2` + scavenged meat item.
        r.tick((w) => {
            w.x[hunter] = 500;
            w.y[hunter] = 500;
            w.angle[hunter] = 0;
            w.energy[hunter] = 800;
            w.size[hunter] = 24;
            w.x[victim2] = 520;
            w.y[victim2] = 500;
            w.energy[victim2] = 400;
            w.size[victim2] = 12;
            plantMeat(w, hunter, 50);
        });
        const m = r.metrics();
        expect(r.observer.combat.hunterAgentTicks).toBe(3);
        expect(m['eval.reward_events.kill']).toEqual({ value: (1 / 3) * 1000 });
        expect(m['eval.reward_events.bite']).toEqual({ value: (2 / 3) * 1000 });
        expect(m['eval.reward_events.scavenge']).toEqual({ value: (2 / 3) * 1000 });
    });
});
