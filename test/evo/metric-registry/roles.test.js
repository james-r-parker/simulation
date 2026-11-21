import { describe, expect, it } from 'vitest';
import { METRICS } from '../../../js/evo/metric-registry/index.js';
import { ROLE_METRICS, ROLES, metricsForRole, withRoles } from '../../../js/evo/metric-registry/roles.js';
import { SPECIALISATION_KEYS } from '../../../js/sim/config-spec-rules.js';

describe('ROLES', () => {
    it('are the five specialisations then herd', () => {
        expect([...ROLES].sort()).toEqual([...SPECIALISATION_KEYS, 'herd'].sort());
        expect(ROLES.at(-1)).toBe('herd');
        expect(Object.keys(ROLE_METRICS).sort()).toEqual([...ROLES].sort());
    });
});

describe('the role tags of the registry', () => {
    it('tag every metric of the Phase 6 table and no other', () => {
        const tagged = Object.entries(METRICS).filter(([, entry]) => entry.roles !== undefined);
        const listed = new Set(Object.values(ROLE_METRICS).flat());
        expect(tagged.map(([name]) => name).sort()).toEqual([...listed].sort());
        expect(listed.size).toBe(22);
    });

    it('hold only known roles', () => {
        for (const entry of Object.values(METRICS)) {
            expect((entry.roles ?? []).filter((role) => !ROLES.includes(role))).toEqual([]);
        }
    });

    it('list the metrics of a role, the three of the defender', () => {
        expect(metricsForRole(METRICS, 'scout').sort()).toEqual([
            'eval.alarm_lift',
            'eval.alarm_response',
            'eval.scout_alarm_lead_share',
        ]);
        expect(metricsForRole(METRICS, 'predator')).toContain('eval.chase_catch_share');
        expect(metricsForRole(METRICS, 'defender').sort()).toEqual([
            'eval.defender_bite_break_share',
            'eval.defender_repel_per_1k',
            'eval.hunter_defender_bite_ratio',
        ]);
    });

    it('refuse an unknown role', () => {
        expect(() => metricsForRole(METRICS, 'sloth')).toThrow(/unknown role sloth/);
    });

    it('change no reading: a tagged entry keeps its direction', () => {
        const { roles, direction } = METRICS['eval.child_survival'];
        expect(roles).toEqual(['reproducer']);
        expect(direction).toBe('watch');
    });
});

describe('withRoles', () => {
    const base = { 'eval.a': { family: 'x' }, 'eval.b': { family: 'y' } };

    it('sets roles on tagged entries, one metric serving two roles, and leaves the rest alone', () => {
        const merged = /** @type {any} */ (
            withRoles(/** @type {any} */ (base), { predator: ['eval.a'], herd: ['eval.a'], scout: [] })
        );
        expect(merged['eval.a'].roles).toEqual(['predator', 'herd']);
        expect(merged['eval.b']).toEqual({ family: 'y' });
        expect(Object.isFrozen(merged['eval.a'].roles)).toBe(true);
    });

    it('fails loudly on a tagged name with no entry', () => {
        expect(() => withRoles(/** @type {any} */ (base), { predator: ['eval.nope'] })).toThrow(
            /unknown metric eval\.nope/,
        );
    });
});
