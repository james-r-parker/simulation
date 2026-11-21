import { describe, expect, it } from 'vitest';
import { DRILLS } from '../../js/evo/drill-scenarios.js';
import { ROLE_DRILLS } from '../../js/evo/drill-scenarios-roles.js';

describe('ROLE_DRILLS', () => {
    it('lists the two role drills built so far, each with a reference, a budget row and a scene of principles.md', () => {
        expect(ROLE_DRILLS.map((d) => d.name)).toEqual(['defend-caller', 'warn-herd']);
        expect(ROLE_DRILLS.map((d) => d.row)).toEqual(['defender:predator', 'scout:predator']);
        for (const drill of ROLE_DRILLS) {
            expect(drill.reference().act).toBeTypeOf('function');
            expect(drill.reference()).not.toBe(drill.reference());
            expect(drill.scene).not.toBe('');
        }
    });

    it('is apart from DRILLS, which the drill command, the learn probe and the train manifest enumerate', () => {
        for (const drill of ROLE_DRILLS) {
            expect(DRILLS.map((d) => d.name)).not.toContain(drill.name);
        }
        expect(Object.isFrozen(ROLE_DRILLS)).toBe(true);
    });
});
