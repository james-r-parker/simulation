import { describe, expect, it } from 'vitest';
import { HEBB_CLAMP } from '../../js/sim/hebbian.js';
import { HEBB_DIRECTIONS, hebbMetrics, sampleHebb } from '../../js/evo/metrics-hebb.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

/**
 * @param {Record<string, any>} over config overrides
 * @returns {{world: any, observer: any, slot: number}} an agent aged 700 ticks that is the checkpoint sample
 */
function setup(over = {}) {
    const { world, observer } = observed({ brainHidden: 2, hebbianRate: 0.001, ...over });
    const slot = addBlob(world);
    observer.ageTicks[slot] = 700;
    observer.sampled = Int32Array.of(slot);
    return { world, observer, slot };
}

describe('the Hebbian drift metrics', () => {
    it('reads the norm of fastOut minus wOut over the norm of wOut, and the clamped share', () => {
        const { world, observer, slot } = setup();
        const { layout } = world;
        const size = layout.hidden * layout.geneOutputs;
        const w = Array.from({ length: size }, (_, i) => (i % 3) - 1);
        world.weights.set(w, slot * layout.weightCount + layout.wOut);
        const f = w.map((v, i) => (i < 4 ? HEBB_CLAMP : v + (i % 2 ? 0.1 : -0.1)));
        world.fastOut.set(f, slot * size);
        sampleHebb(observer.hebb, observer, world);
        const delta = Math.sqrt(f.reduce((s, v, i) => s + (Math.fround(v) - w[i]) ** 2, 0));
        const norm = Math.sqrt(w.reduce((s, v) => s + v * v, 0));
        const m = hebbMetrics(observer);
        expect(m['eval.hebb_drift'].value).toBeCloseTo(delta / norm, 5);
        expect(m['eval.hebb_drift_clamped_share'].value).toBe(4 / size);
    });

    it('leaves an agent whose output weights are all zero out of the mean: its drift has no scale', () => {
        const { world, observer, slot } = setup();
        const { layout } = world;
        const size = layout.hidden * layout.geneOutputs;
        const silent = addBlob(world);
        observer.ageTicks[silent] = 700;
        observer.sampled = Int32Array.of(silent, slot);
        world.weights.fill(
            0,
            silent * layout.weightCount + layout.wOut,
            silent * layout.weightCount + layout.wOut + size,
        );
        world.fastOut.fill(0.5, silent * size, (silent + 1) * size);
        const w = Array.from({ length: size }, (_, i) => (i % 2 ? 1 : -1));
        world.weights.set(w, slot * layout.weightCount + layout.wOut);
        world.fastOut.set(
            w.map((v) => v * 1.5),
            slot * size,
        );
        sampleHebb(observer.hebb, observer, world);
        expect(hebbMetrics(observer)['eval.hebb_drift'].value).toBeCloseTo(0.5, 5);
    });

    it('skips agents younger than 600 ticks', () => {
        const { world, observer, slot } = setup();
        observer.ageTicks[slot] = 599;
        sampleHebb(observer.hebb, observer, world);
        expect(hebbMetrics(observer)['eval.hebb_drift'].value).toBeNull();
    });

    it('is null with hebbianRate 0', () => {
        const { world, observer } = setup({ hebbianRate: 0 });
        sampleHebb(observer.hebb, observer, world);
        expect(hebbMetrics(observer)['eval.hebb_drift']).toEqual({ value: null, reason: 'hebbianRate is 0' });
    });

    it('is watch', () => {
        expect(Object.values(HEBB_DIRECTIONS)).toEqual(['watch', 'watch']);
    });
});
