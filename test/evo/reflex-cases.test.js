import { describe, expect, it } from 'vitest';
import { REFLEX_CASES, caseNamed, casesFor } from '../../js/evo/reflex-cases.js';

describe('REFLEX_CASES', () => {
    it('lists the seventeen cases, the foragers, predators and roles in turn, frozen', () => {
        expect(REFLEX_CASES.map((c) => c.name)).toEqual([
            'flee-threat',
            'approach-food',
            'pick-safe-food',
            'avoid-obstacle',
            'approach-prey',
            'bite-discrimination',
            'sprint-on-prey',
            'hold-the-bite',
            'call-on-threat',
            'turn-to-alarm',
            'flee-on-alarm',
            'flee-on-alarm:reproducer',
            'clear-the-herd',
            'clear-the-herd:predator',
            'clear-the-herd:reproducer',
            'clear-the-herd:scout',
            'clear-the-herd:defender',
        ]);
        expect(Object.isFrozen(REFLEX_CASES)).toBe(true);
    });

    it('names a scene, a spec, a plan and a check for every case', () => {
        for (const c of REFLEX_CASES) {
            expect(c.scene.length).toBeGreaterThan(0);
            expect([0, 1, 2, 3, 4]).toContain(c.spec);
            expect(typeof c.plan).toBe('function');
            expect(typeof c.check).toBe('function');
        }
    });
});

describe('casesFor', () => {
    it('gives foragers six cases, predators five, the reproducer two, the scout two and the defender two', () => {
        expect(casesFor(0)).toHaveLength(6);
        expect(casesFor(1)).toHaveLength(5);
        expect(casesFor(2)).toHaveLength(2);
        expect(casesFor(3)).toHaveLength(2);
        expect(casesFor(4)).toHaveLength(2);
    });
});

describe('caseNamed', () => {
    it('finds a case and names the known ones when it is not there', () => {
        expect(caseNamed('approach-prey').spec).toBe(1);
        expect(() => caseNamed('nope')).toThrow(/unknown case "nope"; known: flee-threat/);
    });
});
