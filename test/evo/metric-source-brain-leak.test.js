// Source tests, brain family, leak against skill (docs/designs/metric-trust.md, T20; brain-capacity-and-memory.md,
// Metrics): the real `step` frees a dead agent's slot before `observe` runs, so the life's mean leak must come from
// what the observer kept at birth, not from the cleared genome row. Every test has a death in its final tick.

import { describe, expect, it } from 'vitest';
import { leakRateOf } from '../../js/sim/traits.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { MIN_FORAGE_LIVES } from '../../js/evo/metrics-leak-skill.js';
import { brainSourceRun, plantFood, starve, zeroPolicy } from './helpers/source-world.js';

/** A zero-weight policy whose next newborn gets every leak gene set to `next.gene`. */
function leakPolicy() {
    const next = { gene: 0 };
    const policy = {
        ...zeroPolicy(),
        initBrain(/** @type {any} */ w, /** @type {number} */ slot) {
            const start = slot * w.layout.weightCount + w.layout.leakStart;
            w.weights.fill(next.gene, start, start + w.layout.hidden);
        },
    };
    return { next, policy };
}

/**
 * Spawns one agent per gene, then from burn-in feeds and starves them one at a time, the last death in the final tick.
 * @param {number[]} genes the leak gene of each life
 * @param {{founder?: boolean}} [options] spawn the first agent in `createWorld`, before the observer's first feed
 * @returns {{r: any, leakMin: number}} the run
 */
function runLives(genes, { founder = false } = {}) {
    const { next, policy } = leakPolicy();
    next.gene = genes[0];
    const r = brainSourceRun({
        policy,
        over: { maxAgents: genes.length + 1, maxFood: genes.length + 1, initialAgents: founder ? 1 : 0 },
    });
    const slots = [];
    for (let slot = 0; slot < r.world.alive.length; slot++) {
        if (r.world.alive[slot] === 1) {
            slots.push(slot);
        }
    }
    for (let i = slots.length; i < genes.length; i++) {
        next.gene = genes[i];
        slots.push(r.spawn());
    }
    r.jump(BURN_IN_TICKS);
    for (const slot of slots) {
        r.tick((/** @type {any} */ w) => plantFood(w, slot));
        r.tick((/** @type {any} */ w) => starve(w, slot, 50));
    }
    return { r, leakMin: r.world.config.leakMin };
}

describe('the leak-skill log on the real step', () => {
    it("logs each life's mean leak from its birth genome, the founder's and the final tick's death included", () => {
        const genes = [-3, -1, 0, 2];
        const { r, leakMin } = runLives(genes, { founder: true });
        const pools = r.observer.leakSkill;
        expect(pools.rows).toBe(genes.length);
        const logged = Array.from(pools.log.leak.subarray(0, pools.rows));
        expect(logged).toEqual(genes.map((gene) => expect.closeTo(leakRateOf(gene, leakMin), 6)));
        expect(Array.from(pools.log.forage.subarray(0, pools.rows))).toEqual(genes.map(() => 0));
    });
});

describe('leak_forage_corr, leak_hunt_corr and leak_flee_corr', () => {
    it('count every life on the real step: with enough fed lives the forage read fails on variance, not on lives', () => {
        const genes = Array.from({ length: MIN_FORAGE_LIVES + 10 }, (_, i) => (i % 9) - 4);
        const m = runLives(genes).r.metrics();
        expect(m['eval.leak_forage_corr']).toEqual({ value: null, reason: 'no variance in leak or in the skill' });
        expect(m['eval.leak_hunt_corr']).toEqual({ value: null, reason: 'fewer than 100 lives with a hunt skill' });
        expect(m['eval.leak_flee_corr']).toEqual({ value: null, reason: 'fewer than 100 lives with a flee skill' });
    });
});
