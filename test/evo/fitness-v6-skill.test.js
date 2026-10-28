import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { FITNESS_V1 } from '../../js/evo/fitness.js';
import { FITNESS_V6_SKILL, chanceIntake, createSkillGroup, deliberateIntake } from '../../js/evo/fitness-v6-skill.js';
import { createLifeCounters } from '../../js/evo/life-counters.js';
import { createObserver } from '../../js/evo/observer.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { FEATURES_OFF } from '../../scripts/lib/features-on.mjs';

const config = createConfig({ ...FEATURES_OFF, maxAgents: 8, initialAgents: 0, minAgents: 0 });
const { specialisations } = config;

/**
 * An observer and counters with slot 0 filled in; each field goes to the intent counters when it has one there,
 * then to the life counters, otherwise to the observer.
 * @param {Record<string, number>} fields
 * @param {string} [spec] specialisation name; an unknown index (no role term) by default
 * @returns {{observer: any, counters: any}}
 */
function slotWith(fields, spec) {
    const observer = createObserver(config, fork(createRng(1), 'eval'));
    const counters = createLifeCounters(config);
    observer.spec[0] = spec === undefined ? 99 : specialisations[/** @type {'forager'} */ (spec)].index;
    for (const [k, v] of Object.entries(fields)) {
        (k in observer.intent ? observer.intent : k in counters ? counters : observer)[k][0] = v;
    }
    return { observer, counters };
}

/**
 * Skill (intake plus gated terms) minus the waste charge, with the doc's net rule, as `fitnessV6` will compose them
 * when the other groups are 0 (children are the base term of T33, so they are not part of this).
 * @param {Record<string, number>} fields
 * @param {string} [spec]
 * @param {Record<string, number>} [overrides]
 */
function score(fields, spec, overrides) {
    const { observer, counters } = slotWith(fields, spec);
    const g = createSkillGroup(counters, overrides);
    return g.net(g.skill(observer, 0, config), g.waste(observer, 0));
}

describe('FITNESS_V6_SKILL', () => {
    it('names the doc constants', () => {
        expect(FITNESS_V6_SKILL).toEqual({
            CHANCE_WEIGHT: 0.25,
            GATE: 500,
            SURVIVAL_RATE: 0.5,
            SURVIVAL_CAP: 30000,
            SURVIVAL_PER_DELIBERATE: 1,
            CREDIT_CAP: 0.25,
            ESCAPE: 60,
            CONVERGED_KILL: 50,
            ALARM: 40,
            HUNT_CALL: 40,
            IDLE_SIGNAL: 20,
            UNDEFENDED: 40,
            WASTE_CAP: 0.5,
        });
        expect(Object.isFrozen(FITNESS_V6_SKILL)).toBe(true);
    });
});

describe('skill intake', () => {
    it('is 0 with no counters', () => {
        expect(score({})).toBe(0);
    });

    it('pays deliberate food and bite energy in full and chance intake at 0.25', () => {
        expect(score({ deliberateFood: 100, deliberateBite: 50 })).toBe(150);
        expect(score({ chanceFood: 100, chanceBite: 60 })).toBe(40);
    });

    it('reads the two intakes from the intent counters', () => {
        const { observer } = slotWith({ deliberateFood: 3, deliberateBite: 4, chanceFood: 5, chanceBite: 6 });
        expect(deliberateIntake(observer.intent, 0)).toBe(7);
        expect(chanceIntake(observer.intent, 0)).toBe(11);
    });

    it('does not pay children (the base term belongs to fitnessV6)', () => {
        expect(score({ children: 2 })).toBe(0);
    });
});

describe('skill gate and survival', () => {
    it('ramps the gated terms in with deliberate intake over 500', () => {
        // survival = 0.5 * min(age, cap, 1 * 250) = 125, half of it paid
        expect(score({ deliberateFood: 250, ageTicks: 10000 })).toBe(250 + 0.5 * 125);
        expect(score({ deliberateFood: 500, ageTicks: 10000 })).toBe(500 + 0.5 * 500);
    });

    it('does not count chance intake toward the gate', () => {
        expect(score({ chanceFood: 4000, ageTicks: 10000 })).toBe(1000);
    });

    it('caps survival by age, by the survival cap and by one per deliberate energy', () => {
        expect(score({ deliberateFood: 2000, ageTicks: 100 })).toBe(2000 + 50);
        expect(score({ deliberateFood: 40000, ageTicks: 50000 })).toBe(40000 + 0.5 * 30000);
        expect(score({ deliberateFood: 600, ageTicks: 50000 })).toBe(600 + 0.5 * 600);
    });

    it('takes the gate from deliberate intake only', () => {
        const { observer, counters } = slotWith({ deliberateFood: 125, chanceFood: 9999 });
        expect(createSkillGroup(counters).gate(observer, 0)).toBe(0.25);
    });
});

describe('skill role term', () => {
    const base = { deliberateFood: 1000 };

    it('pays the forager on deliberate food, capped at intake', () => {
        expect(score(base, 'forager')).toBe(1000 + FITNESS_V1.FORAGER * 1000);
        expect(score({ ...base, foodEnergy: 5000 }, 'forager')).toBe(1200);
    });

    it('pays the predator on deliberateKills, not kills', () => {
        expect(score({ ...base, deliberateKills: 2 }, 'predator')).toBe(1000 + 300);
        expect(score({ ...base, kills: 5 }, 'predator')).toBe(1000);
        expect(score({ ...base, deliberateKills: 100 }, 'predator')).toBe(2000);
    });

    it('pays the reproducer on children, gated and capped at intake', () => {
        expect(score({ ...base, children: 1 }, 'reproducer')).toBe(1000 + 150);
        expect(score({ ...base, children: 100 }, 'reproducer')).toBe(2000);
    });

    it('pays the scout on cells300 and the defender on kinBitesAbsorbed', () => {
        expect(score({ ...base, cells300: 10 }, 'scout')).toBe(1000 + FITNESS_V1.SCOUT * 10);
        expect(score({ ...base, kinBitesAbsorbed: 10 }, 'defender')).toBe(1000 + FITNESS_V1.DEFENDER * 10);
    });

    it('is gated like the other terms', () => {
        expect(score({ deliberateFood: 250, deliberateKills: 1 }, 'predator')).toBe(250 + 0.5 * 150);
    });
});

describe('skill credits', () => {
    const base = { deliberateFood: 1000 };
    const credits = ['respondedEscape', 'convergedKills', 'alarmCredits', 'huntCredits'];

    it.each([
        ['respondedEscape', 60],
        ['convergedKills', 50],
        ['alarmCredits', 40],
        ['huntCredits', 40],
    ])('pays %s at %d each', (field, weight) => {
        expect(score({ ...base, [field]: 2 })).toBe(1000 + 2 * weight);
    });

    it.each(credits)('caps %s at 0.25 x intake', (field) => {
        expect(score({ ...base, [field]: 1000 })).toBe(1250);
    });

    it('pays no credit without deliberate intake', () => {
        expect(score({ chanceFood: 4000, respondedEscape: 5, alarmCredits: 5 })).toBe(1000);
    });

    it('caps credits on the chance-discounted intake', () => {
        expect(score({ ...base, chanceFood: 1000, respondedEscape: 1000 })).toBe(1250 + 0.25 * 1250);
    });
});

describe('skill waste', () => {
    it('charges 20 per idle signal and 40 per undefended bite', () => {
        expect(score({ deliberateFood: 1000, idleSignal: 3, undefendedBite: 2 })).toBe(1000 - 60 - 80);
    });

    it('caps the charge at half of the positive score', () => {
        expect(score({ deliberateFood: 1000, idleSignal: 1000 })).toBe(500);
    });

    it('floors at 0 and charges nothing for unseen bites', () => {
        expect(score({ idleSignal: 50, undefendedBite: 50 })).toBe(0);
        expect(score({ deliberateFood: 100, unseenBite: 50 })).toBe(100);
    });

    it('never returns a negative net', () => {
        const { counters } = slotWith({});
        expect(createSkillGroup(counters).net(-5, 100)).toBe(0);
    });
});

describe('createSkillGroup overrides', () => {
    it('merges overrides over the defaults and keeps the rest', () => {
        const { counters } = slotWith({});
        const g = createSkillGroup(counters, { CHANCE_WEIGHT: 0.5 });
        expect(g.weights).toEqual({ ...FITNESS_V6_SKILL, CHANCE_WEIGHT: 0.5 });
        expect(score({ chanceFood: 100 }, undefined, { CHANCE_WEIGHT: 0.5 })).toBe(50);
        expect(score({ deliberateFood: 1000, idleSignal: 1 }, undefined, { IDLE_SIGNAL: 100 })).toBe(900);
    });

    it('leaves FITNESS_V6_SKILL untouched', () => {
        const { counters } = slotWith({});
        createSkillGroup(counters, { GATE: 1 });
        expect(FITNESS_V6_SKILL.GATE).toBe(500);
    });
});
