import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { metricDirection } from '../../js/evo/compare.js';
import { computeMetrics } from '../../js/evo/metrics.js';
import {
    BRAIN_DIRECTIONS,
    brainMetrics,
    noteBrainDeath,
    observeBrain,
    resetBrainSlot,
    sampleBrainCheckpoint,
} from '../../js/evo/metrics-brain.js';
import { OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

const NAMES = [
    'eval.leak_rate_mean',
    'eval.leak_slow_share',
    'eval.leak_at_floor_share',
    'eval.leak_lineage_spread',
    'eval.hidden_persistence',
    'eval.memory_out_flat_share',
    'eval.memory_out_noisy_share',
    'eval.memory_out_signal_share',
    'eval.leak_forage_corr',
    'eval.leak_hunt_corr',
    'eval.leak_flee_corr',
    'eval.hebb_drift',
    'eval.hebb_drift_clamped_share',
    'eval.input_active_share',
    'eval.weight_drift_silent',
    'eval.weight_clamp_share',
    'eval.rare_input_saturation_jump',
    'eval.sigma_mean',
];

describe('the registered metrics', () => {
    it('are the eighteen of the Metrics table, all watch to eval:compare', () => {
        expect(Object.keys(BRAIN_DIRECTIONS).sort()).toEqual([...NAMES].sort());
        for (const name of NAMES) {
            expect(metricDirection(name)).toBe('watch');
        }
    });

    it('are all in computeMetrics, null with a reason on an empty observer', () => {
        const { world, observer } = observed();
        const all = computeMetrics(observer, world);
        for (const name of NAMES) {
            expect(all[name].value).toBeNull();
            expect(all[name].reason).toBeTypeOf('string');
        }
        expect(Object.keys(brainMetrics(observer)).sort()).toEqual([...NAMES].sort());
    });
});

describe('the observer hooks', () => {
    it('samples the memory outputs per tick and the input activity after burn-in', () => {
        const { world, observer } = observed({ maxAgents: 8, hebbianRate: 0.001 });
        const slot = addBlob(world);
        world.outputs[slot * world.layout.outputCount + OUTPUT_INDEX.MEMORY_A] = 0.5;
        world.pooled[slot * world.layout.inputCount] = 1;
        world.tick = 8;
        observeBrain(observer, world);
        expect(observer.memoryOut.count[slot]).toBe(1);
        expect(observer.activity.samples).toBe(0);
        world.tick = BURN_IN_TICKS;
        observeBrain(observer, world);
        expect(observer.activity.samples).toBe(1);
        expect(observer.activity.active[0]).toBe(1);
    });

    it('writes the rare mask into a policy silentTarget on the 16-tick grid', () => {
        const { world, observer } = observed({ maxAgents: 8 });
        observer.silentTarget = new Uint8Array(world.layout.inputCount).fill(1);
        world.tick = BURN_IN_TICKS;
        observeBrain(observer, world);
        expect(observer.silentTarget.every((v) => v === 0)).toBe(true);
    });

    it('takes the checkpoint samples only at or after burn-in', () => {
        const { world, observer } = observed({ maxAgents: 8 });
        const slot = addBlob(world);
        observer.sampled = Int32Array.of(slot);
        world.tick = BURN_IN_TICKS - 1000;
        sampleBrainCheckpoint(observer, world);
        expect(observer.memory.leakUnits).toBe(0);
        world.tick = BURN_IN_TICKS;
        sampleBrainCheckpoint(observer, world);
        expect(observer.memory.leakUnits).toBe(world.layout.hidden);
        expect(observer.weightPools.weights).toBeGreaterThan(0);
    });

    it('notes a death in the life statistics and clears a slot on reuse', () => {
        const { world, observer } = observed({ maxAgents: 8 });
        const slot = addBlob(world);
        observer.memoryOut.count[slot] = 5;
        noteBrainDeath(observer, world, { slot, genomeId: world.genomeId[slot], ageTicks: 700 });
        expect(observer.memoryOut.lives).toBe(1);
        expect(observer.leakSkill.rows).toBe(1);
        observer.saturation.lastShare[slot] = 0.5;
        resetBrainSlot(observer, slot);
        expect(observer.memoryOut.count[slot]).toBe(0);
        expect(observer.saturation.lastShare[slot]).toBeNaN();
    });
});
