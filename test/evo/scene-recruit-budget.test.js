// The recruit budget detectors (honest-budgets T33a): net chase energy with failed chases kept, and the territory-blocked share of
// hunters that could otherwise breed, against hand-built worlds.

import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { CHASE_OUTCOME } from '../../js/evo/chase-outcome.js';
import { budgetMetrics, createBudgetScene, noteBudgetChase, sampleBudget } from '../../js/evo/scene-recruit-budget.js';

/**
 * @param {Array<{x: number, spec?: number, age?: number, energy?: number, cooldown?: number, pregnancy?: number}>} agents the alive agents
 * @param {Record<string, any>} [config] config overrides
 * @returns {Record<string, any>} a hand-built world at a checkpoint after burn-in; spec 1 hunts and splits above 100 energy
 */
function worldOf(agents, config = {}) {
    const n = agents.length;
    const cfg = { maturityTicks: 100, territoryRadius: 50, territoryMax: 1, ...config };
    const world = {
        tick: BURN_IN_TICKS + 1000,
        config: cfg,
        lanes: {
            maturityTicks: new Float64Array(n).fill(cfg.maturityTicks),
            territoryRadius: new Float64Array(n).fill(cfg.territoryRadius),
            territoryMax: new Float64Array(n).fill(cfg.territoryMax),
        },
        alive: new Uint8Array(n).fill(1),
        spec: new Uint8Array(n),
        huntBySpec: new Float64Array([0, 1]),
        splitMinBySpec: new Float64Array([100, 100]),
        ageTicks: new Float64Array(n),
        energy: new Float64Array(n),
        cooldown: new Float64Array(n),
        pregnancy: new Float64Array(n),
        x: new Float64Array(n),
        y: new Float64Array(n),
    };
    agents.forEach((a, i) => {
        world.spec[i] = a.spec ?? 1;
        world.ageTicks[i] = a.age ?? 500;
        world.energy[i] = a.energy ?? 500;
        world.cooldown[i] = a.cooldown ?? 0;
        world.pregnancy[i] = a.pregnancy ?? 0;
        world.x[i] = a.x;
    });
    return world;
}

describe('net chase energy', () => {
    it('averages the energy change of every chase and of the failed ones, a catch included in the first only', () => {
        const scene = createBudgetScene();
        const world = { energy: new Float64Array([450, 380, 600]) };
        noteBudgetChase(scene, world, { slot: 0, outcome: CHASE_OUTCOME.ESCAPED, energy: 500 }); // -50
        noteBudgetChase(scene, world, { slot: 1, outcome: CHASE_OUTCOME.GAVE_UP, energy: 400 }); // -20
        noteBudgetChase(scene, world, { slot: 2, outcome: CHASE_OUTCOME.CAUGHT, energy: 300 }); // +300
        const m = budgetMetrics(scene);
        expect(m['eval.chase_net_energy']).toEqual({ value: 230 / 3 });
        expect(m['eval.chase_failed_energy']).toEqual({ value: -35 });
    });

    it('is null with a reason before a chase, and the failed read is null when every chase caught', () => {
        const none = budgetMetrics(createBudgetScene());
        expect(none['eval.chase_net_energy']?.value).toBeNull();
        expect(none['eval.chase_failed_energy']?.reason).toContain('escaped or given-up');
        const scene = createBudgetScene();
        noteBudgetChase(
            scene,
            { energy: new Float64Array([10]) },
            { slot: 0, outcome: CHASE_OUTCOME.CAUGHT, energy: 5 },
        );
        const m = budgetMetrics(scene);
        expect(m['eval.chase_net_energy']).toEqual({ value: 5 });
        expect(m['eval.chase_failed_energy']?.value).toBeNull();
    });
});

describe('territory-blocked eligible hunters', () => {
    it('counts a hunter another mature hunter crowds out, not one that is alone or not eligible', () => {
        const scene = createBudgetScene();
        // Slots 0 and 1 stand within 50 px with territoryMax 1: each has one neighbour, which is allowed. Slot 2 joins them.
        const world = worldOf([{ x: 0 }, { x: 10 }, { x: 20 }, { x: 900 }, { x: 5, energy: 50 }, { x: 6, spec: 0 }]);
        sampleBudget(scene, world);
        // Eligible: slots 0 to 3 (slot 4 is under its split energy, slot 5 is not a hunter). 0, 1, 2 each see two neighbours.
        expect(budgetMetrics(scene)['eval.hunter_territory_blocked_share']).toEqual({ value: 3 / 4 });
    });

    it('leaves out the juvenile, resting and pregnant, and a sample before burn-in', () => {
        const scene = createBudgetScene();
        const world = worldOf([
            { x: 0, age: 10 },
            { x: 1, cooldown: 5 },
            { x: 2, pregnancy: 5 },
        ]);
        sampleBudget(scene, world);
        const m = budgetMetrics(scene)['eval.hunter_territory_blocked_share'];
        expect(m?.value).toBeNull();
        const early = worldOf([{ x: 0 }]);
        early.tick = BURN_IN_TICKS - 1;
        sampleBudget(scene, early);
        expect(scene.samples).toBe(1);
    });

    it('pools the checkpoints', () => {
        const scene = createBudgetScene();
        sampleBudget(scene, worldOf([{ x: 0 }]));
        sampleBudget(scene, worldOf([{ x: 0 }, { x: 5 }, { x: 8 }], { territoryMax: 1 }));
        // 1 eligible and free, then 3 eligible of which all 3 see two neighbours.
        expect(budgetMetrics(scene)['eval.hunter_territory_blocked_share']).toEqual({ value: 3 / 4 });
    });
});
