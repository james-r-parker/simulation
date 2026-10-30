import { describe, expect, it } from 'vitest';
import {
    LEAK_SKILL_DIRECTIONS,
    createLeakSkillPools,
    leakSkillMetrics,
    lifeLeak,
    noteLeakSkillDeath,
} from '../../js/evo/metrics-leak-skill.js';
import { leakRateOf } from '../../js/sim/traits.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

/**
 * Ends `lives` lives in one slot, each with a leak gene and counters from `life(i)`.
 * @param {number} lives how many
 * @param {(i: number) => {gene: number, food?: [number, number], kills?: [number, number], escapes?: [number, number]}} life
 * @param {number} [spec] the slot's specialisation index
 * @returns {any} the observer
 */
function run(lives, life, spec = 0) {
    const { world, observer } = observed({ brainHidden: 2, maxAgents: 8 });
    const slot = addBlob(world, { spec });
    observer.spec[slot] = spec;
    const { layout } = world;
    for (let i = 0; i < lives; i++) {
        const f = life(i);
        world.weights.fill(f.gene, slot * layout.weightCount + layout.leakStart, (slot + 1) * layout.weightCount);
        const { intent } = observer;
        [intent.deliberateFood[slot], intent.chanceFood[slot]] = f.food ?? [0, 0];
        [intent.deliberateKills[slot], observer.kills[slot]] = f.kills ?? [0, 0];
        [intent.respondedEscape[slot], intent.escapedLife[slot]] = f.escapes ?? [0, 0];
        noteLeakSkillDeath(observer.leakSkill, { observer, world }, { slot, genomeId: world.genomeId[slot] });
    }
    return observer;
}

describe('lifeLeak', () => {
    it('is the mean of leakRateOf over the leak genes', () => {
        const { world } = observed({ brainHidden: 2, maxAgents: 8 });
        const slot = addBlob(world);
        const at = slot * world.layout.weightCount + world.layout.leakStart;
        world.weights.set([-2, 3], at);
        const want = (leakRateOf(-2, world.config.leakMin) + leakRateOf(3, world.config.leakMin)) / 2;
        expect(lifeLeak(world, slot)).toBeCloseTo(want, 6);
    });
});

describe('the leak-skill correlations', () => {
    it('is Pearson of the life leak with the deliberate food share over lives that ate', () => {
        const genes = Array.from({ length: 200 }, (_, i) => (i % 20) / 5 - 2);
        const observer = run(200, (i) => ({ gene: genes[i], food: [(i % 20) + 1, 20 - (i % 20)] }));
        const leak = genes.map((g) => leakRateOf(g, 0.05));
        const share = genes.map((_, i) => ((i % 20) + 1) / 21);
        const r = leakSkillMetrics(observer)['eval.leak_forage_corr'].value;
        const mean = (/** @type {number[]} */ v) => v.reduce((a, b) => a + b) / v.length;
        const ml = mean(leak);
        const ms = mean(share);
        const cov = leak.reduce((s, v, i) => s + (v - ml) * (share[i] - ms), 0);
        const vl = leak.reduce((s, v) => s + (v - ml) ** 2, 0);
        const vs = share.reduce((s, v) => s + (v - ms) ** 2, 0);
        expect(r).toBeCloseTo(cov / Math.sqrt(vl * vs), 4);
        expect(r).toBeGreaterThan(0.9);
    });

    it('drops lives with nothing to measure, and is null below the life counts', () => {
        const observer = run(199, (i) => ({ gene: i % 7, food: [i % 3, 1] }));
        expect(leakSkillMetrics(observer)['eval.leak_forage_corr'].reason).toMatch(/200 lives/);
        expect(leakSkillMetrics(observer)['eval.leak_hunt_corr'].reason).toMatch(/100 lives/);
        const empty = run(300, (i) => ({ gene: i % 7 }));
        expect(leakSkillMetrics(empty)['eval.leak_forage_corr'].value).toBeNull();
    });

    it('is null without variance', () => {
        const observer = run(250, () => ({ gene: 1, food: [1, 1] }));
        expect(leakSkillMetrics(observer)['eval.leak_forage_corr'].reason).toMatch(/no variance/);
    });

    it('reads the hunt skill only for a hunting specialisation and the flee skill from escaped episodes', () => {
        const config = observed().world.config;
        const hunter = config.specialisations.predator.index;
        const life = (/** @type {number} */ i) => ({
            gene: (i % 10) - 5,
            kills: /** @type {[number, number]} */ ([i % 10, 10]),
            escapes: /** @type {[number, number]} */ ([10 - (i % 10), 10]),
        });
        const hunting = run(120, life, hunter);
        expect(leakSkillMetrics(hunting)['eval.leak_hunt_corr'].value).toBeGreaterThan(0.9);
        expect(leakSkillMetrics(hunting)['eval.leak_flee_corr'].value).toBeLessThan(-0.9);
        const grazing = run(120, life, config.specialisations.forager.index);
        expect(leakSkillMetrics(grazing)['eval.leak_hunt_corr'].value).toBeNull();
        expect(leakSkillMetrics(grazing)['eval.leak_flee_corr'].value).toBeLessThan(-0.9);
    });

    it('skips a life whose slot the world has already refilled', () => {
        const { world, observer } = observed({ brainHidden: 2, maxAgents: 8 });
        const slot = addBlob(world);
        noteLeakSkillDeath(observer.leakSkill, { observer, world }, { slot, genomeId: world.genomeId[slot] + 1 });
        expect(observer.leakSkill.rows).toBe(0);
        expect(createLeakSkillPools().rows).toBe(0);
    });

    it('is watch', () => {
        expect(Object.values(LEAK_SKILL_DIRECTIONS)).toEqual(['watch', 'watch', 'watch']);
    });
});
