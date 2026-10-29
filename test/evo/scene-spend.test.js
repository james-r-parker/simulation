// Parent spends: mothers sampled ready at known energies and born from after known waits, and a lineage whose
// mothers' childShare follows their condition with a known slope.

import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../../js/evo/metrics.js';
import { MIN_SLOPE_BIRTHS, MIN_WAIT_PAIRS, noteSpendBirth, sampleSpend } from '../../js/evo/scene-spend.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

const T0 = 10000;

const read = (/** @type {any} */ r, /** @type {string} */ name) => computeMetrics(r.observer, r.world)[`eval.${name}`];

/** A mate birth of `mother` into `child` at the world's tick. */
function birth(/** @type {any} */ r, /** @type {number} */ mother, /** @type {number} */ child) {
    r.world.parentSlotA[child] = mother;
    noteSpendBirth(r.observer.scenes.spend, r.world, { child, motherId: r.world.genomeId[mother] });
}

describe('eval.mother_wait_by_condition', () => {
    it('is the poorest third mean wait minus the richest third, less the pregnancy ticks', () => {
        const r = observed({ maxAgents: 16 });
        const { maxEnergy, pregnancyTicks } = r.world.config;
        const waits = [100, 100, 50, 50, 20, 20];
        const mothers = waits.map((_, i) => addBlob(r.world, { energy: maxEnergy * 0.1 * (i + 1) }));
        r.world.tick = T0;
        sampleSpend(r.observer.scenes.spend, r.world);
        const child = addBlob(r.world);
        mothers.forEach((mother, i) => {
            r.world.tick = T0 + waits[i] + pregnancyTicks;
            birth(r, mother, child);
        });
        expect(read(r, 'mother_wait_by_condition').value).toBe(80);
    });

    it('samples a mother once, only when she is ready and can bear, and not before burn-in', () => {
        const r = observed({ maxAgents: 16 });
        const ready = addBlob(r.world, { energy: 5000 });
        const poor = addBlob(r.world, { energy: 100 });
        const pregnant = addBlob(r.world, { energy: 5000, pregnancy: 10 });
        r.world.tick = T0;
        sampleSpend(r.observer.scenes.spend, r.world);
        r.world.tick = T0 + 10;
        sampleSpend(r.observer.scenes.spend, r.world);
        const s = r.observer.scenes.spend;
        expect([s.readySince[ready], s.readySince[poor], s.readySince[pregnant]]).toEqual([T0, -1, -1]);
        const child = addBlob(r.world);
        r.world.tick = T0 - 5000;
        birth(r, ready, child);
        expect(s.waitCount).toBe(0);
    });

    it('is null below the least number of waits', () => {
        const r = observed();
        expect(MIN_WAIT_PAIRS).toBe(6);
        expect(read(r, 'mother_wait_by_condition').value).toBeNull();
    });
});

describe('eval.childshare_by_condition', () => {
    it('is the mean within-lineage slope of childShare on energy before the birth', () => {
        const r = observed({ hashCellSize: 256 });
        const { maxEnergy } = r.world.config;
        const mother = addBlob(r.world);
        const flat = addBlob(r.world);
        const child = addBlob(r.world, { energy: 0 });
        r.world.tick = T0;
        for (let i = 0; i < MIN_SLOPE_BIRTHS; i++) {
            const x = 0.04 * (i + 1);
            r.world.energy[mother] = x * maxEnergy;
            r.world.childShare[mother] = 0.1 + 0.5 * x;
            r.world.energy[flat] = 0.3 * maxEnergy;
            r.world.childShare[flat] = 0.2 + (i % 2) * 0.1;
            birth(r, mother, child);
            birth(r, flat, child);
        }
        // `flat` bears at one condition only, so its slope is undefined and it is left out.
        expect(read(r, 'childshare_by_condition').value).toBeCloseTo(0.5, 4);
    });

    it('adds the child gift back to the mother energy, and is null below the least births', () => {
        const r = observed({ hashCellSize: 256 });
        const { maxEnergy } = r.world.config;
        const mother = addBlob(r.world, { energy: 0.2 * maxEnergy });
        const child = addBlob(r.world, { energy: 0.1 * maxEnergy });
        r.world.tick = T0;
        birth(r, mother, child);
        const t = r.observer.scenes.spend.slopes;
        expect(t.log.sx[0]).toBeCloseTo(0.3, 12);
        expect(read(r, 'childshare_by_condition').value).toBeNull();
    });
});
