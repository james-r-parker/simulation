// The reward-hacking audit (fitness-and-selection.md, intent classifier and exploit bounds): scripted controllers play
// staged scenes whose outcome is known, and the credits the intent classifier and `fitnessV6` paid them are checked
// against it. A scene says what the behaviour is; the assertion says what the credit rule should pay for it, or, where it
// cannot tell the behaviour from another, what it pays today (the sim-notes entry "Audit: fitness proxies, memory and
// operators" lists those). Dated measurements are in that entry.

import { describe, expect, it } from 'vitest';
import { FITNESS_V6 } from '../../js/evo/fitness-v6.js';
import { CENTRE } from './helpers/credit-stage.js';
import { duel, foodPatch, foodRow, forage } from './helpers/credit-scenes.js';

const FOOD = 300;
/** The slow predator: it cannot sprint, so a fleer that sprints outruns it. */
const SLOW_HUNTER = { specialisations: { predator: { sprintBoost: 0.01 } } };
const ROW_AHEAD = foodRow(5, 150, { x: 1300 });

/**
 * `fitnessV6`'s skill for an agent with this intake, as the doc composes it: intake, plus the gate times survival (age
 * capped by the intake) and the forager role term (capped by the intake) and any credits.
 * @param {{intake: number, age: number, credits?: number}} agent what the agent took in and how long it lived
 * @returns {number} the skill group's value
 */
function expectedSkill({ intake, age, credits = 0 }) {
    const gate = Math.min(1, intake / FITNESS_V6.GATE);
    const survival = FITNESS_V6.SURVIVAL_RATE * Math.min(age, FITNESS_V6.SURVIVAL_CAP, intake);
    const role = Math.min(0.2 * intake, intake);
    return intake + gate * (survival + role + credits);
}

describe('food credit: movement that meets food by chance', () => {
    const patch = foodPatch(40, { seed: 5 });

    for (const arm of ['spinner', 'wanderer', 'splitSpammer']) {
        it(`${arm} eats in a dense patch and none of it is deliberate, so it scores nothing`, () => {
            const c = forage(arm, { foods: patch, start: CENTRE });
            expect(c.chanceFood, arm).toBeGreaterThanOrEqual(FOOD);
            expect(c.deliberateFood, arm).toBe(0);
            expect(c.fitness, arm).toBe(0);
        });
    }

    it('a cruiser whose row of food is 70 px off its line eats it all by chance', () => {
        const c = forage('cruiser', { foods: foodRow(5, 150, { x: 1300, y: CENTRE.y + 70 }) });
        expect(c.chanceFood).toBeGreaterThan(4 * FOOD);
        expect([c.deliberateFood, c.fitness]).toEqual([0, 0]);
    });

    it('a wanderer, which turns away from food, eats in a patch only by accident', () => {
        const c = forage('wanderer', { foods: patch, start: CENTRE });
        expect(c.chanceFood).toBeGreaterThan(0);
        expect([c.deliberateFood, c.fitness]).toEqual([0, 0]);
    });
});

describe('food credit: deliberate pursuit', () => {
    it('a foodSeeker that steers at food 200 px off to the side is paid the food and the terms it opens', () => {
        const c = forage('foodSeeker', { foods: [{ x: 1300, y: CENTRE.y + 200 }] });
        expect(c.deliberateFood).toBe(FOOD);
        expect(c.chanceFood).toBe(0);
        expect(c.skill).toBeCloseTo(expectedSkill({ intake: FOOD, age: c.ageTicks }), 6);
        expect(c.fitness).toBe(c.skill);
    });

    it('known limitation: a cruiser that never turns is paid as a seeker when the food is exactly on its line', () => {
        // The classifier credits a sighting that stayed on the ray dead ahead from first sight to the meal (the agent
        // had no reason to turn), so a blind run along a row of food reads as steering at it. If this fails the
        // classifier has learned the difference; update the sim-notes entry.
        const cruiser = forage('cruiser', { foods: ROW_AHEAD });
        const seeker = forage('foodSeeker', { foods: ROW_AHEAD });
        expect(cruiser.deliberateFood).toBeGreaterThanOrEqual(4 * FOOD);
        expect(cruiser.fitness).toBe(seeker.fitness);
    });
});

describe('food credit: not reaching the food, and reaching it backwards', () => {
    it('nearMiss approaches three food items, stops short of each and is paid nothing', () => {
        const c = forage('nearMiss', { foods: foodRow(3, 300, { x: 1300 }) });
        expect([c.deliberateFood, c.chanceFood, c.fitness]).toEqual([0, 0, 0]);
    });

    it('backingCollider reverses into food it faces away from: eaten, but by chance, so unpaid', () => {
        // Reversing makes the food a rear-ray sighting, which is never "dead ahead" and needs no turn, so a purposeful
        // approach is classed as chance (a false negative; it is not an exploit).
        const c = forage('backingCollider', { foods: [{ x: 1200, y: CENTRE.y }] });
        expect(c.chanceFood).toBe(FOOD);
        expect([c.deliberateFood, c.fitness]).toEqual([0, 0]);
    });
});

describe('food credit: circling inside a dense patch', () => {
    /**
     * @param {string} arm the controller
     * @returns {{deliberate: number, chance: number}} food eaten over four patches
     */
    function circle(arm) {
        let deliberate = 0;
        let chance = 0;
        for (let seed = 1; seed <= 4; seed++) {
            const c = forage(arm, { foods: foodPatch(40, { seed }), start: CENTRE, seed });
            deliberate += c.deliberateFood;
            chance += c.chanceFood;
        }
        return { deliberate, chance };
    }

    it('a wide circle meets plenty of food and is paid for a small share of it as deliberate, far below a seeker', () => {
        // The circle's constant turn counts as a turn towards every food hit on its turning side, and each lap closes
        // on some of it: a false positive. The share is bounded here; the exploit suite bounds the fitness.
        const seeker = circle('foodSeeker');
        for (const arm of ['patchCircler', 'patchCirclerRight']) {
            const c = circle(arm);
            expect(c.chance, arm).toBeGreaterThan(c.deliberate);
            expect(c.deliberate / (c.deliberate + c.chance), arm).toBeLessThan(0.2);
            expect(c.deliberate, arm).toBeLessThan(0.5 * seeker.deliberate);
        }
    });

    it('a tight circle (spinner) earns no deliberate credit at all', () => {
        let deliberate = 0;
        for (let seed = 1; seed <= 4; seed++) {
            deliberate += forage('spinner', { foods: foodPatch(40, { seed }), start: CENTRE, seed }).deliberateFood;
        }
        expect(deliberate).toBe(0);
    });
});

describe('combat credit', () => {
    it('a hunter that kills a still prey is paid the bite energy, the kill and the terms the intake opens', () => {
        const { hunter, prey } = duel({ canHunt: 'hunter', rest: 'sitter' }, { gap: 200 });
        expect(hunter.kills).toBe(1);
        expect(hunter.deliberateKills).toBe(1);
        expect(hunter.deliberateBite).toBeGreaterThan(FITNESS_V6.GATE);
        expect(hunter.chanceBite).toBe(0);
        expect(hunter.convergedKills, 'a lone hunter is not a converging pack').toBe(0);
        expect(hunter.fitness).toBeGreaterThan(hunter.deliberateBite);
        expect(prey.fitness).toBe(0);
    });

    it('a hunter that kills a fleeing prey is paid as well, and the fleer that dies earns nothing', () => {
        const { hunter, prey } = duel({ canHunt: 'hunter', rest: 'fleer' }, { gap: 200 });
        expect(hunter.kills).toBe(1);
        expect(hunter.deliberateBite).toBeGreaterThan(FITNESS_V6.GATE);
        expect([prey.escapes, prey.fitness]).toEqual([0, 0]);
    });

    it('a predator that follows its prey and never bites is paid nothing', () => {
        const { hunter } = duel({ canHunt: 'chaseDrifter', rest: 'sitter' }, { gap: 200 });
        expect([hunter.deliberateBite, hunter.kills, hunter.fitness]).toEqual([0, 0, 0]);
    });

    it('a hunter too slow for its fleeing prey lands one bite and is paid that bite, not a kill', () => {
        const { hunter, prey } = duel(
            { canHunt: 'hunter', rest: 'fleer' },
            { gap: 150, config: SLOW_HUNTER, preyEnergy: 2000 },
        );
        expect(hunter.kills).toBe(0);
        expect(hunter.deliberateBite).toBeGreaterThan(0);
        expect(hunter.deliberateBite).toBeLessThan(FITNESS_V6.GATE);
        expect(prey.ageTicks).toBeGreaterThan(300);
    });
});

describe('escape credit', () => {
    it('a fleer that survives a bite is counted as escaped but is paid nothing while its intake is zero', () => {
        const { prey } = duel(
            { canHunt: 'hunter', rest: 'fleer' },
            { gap: 150, config: SLOW_HUNTER, preyEnergy: 2000 },
        );
        expect(prey.escapes).toBe(1);
        expect([prey.deliberateFood, prey.skill, prey.fitness]).toEqual([0, 0, 0]);
    });

    it('with food on its escape line the credit is paid, capped at the credit share of the intake', () => {
        const foods = foodRow(10, 120, { x: 1500 });
        const { prey } = duel(
            { canHunt: 'hunter', rest: 'fleer' },
            { gap: 150, config: SLOW_HUNTER, preyEnergy: 2000, foods },
        );
        expect(prey.escapes).toBe(1);
        const intake = prey.deliberateFood;
        const credit = Math.min(FITNESS_V6.CREDIT_CAP * intake, FITNESS_V6.ESCAPE);
        expect(intake, 'a fleer running a straight line along food is paid for it as deliberate').toBeGreaterThan(0);
        expect(prey.skill).toBeCloseTo(expectedSkill({ intake, age: prey.ageTicks, credits: credit }), 6);
    });
});
