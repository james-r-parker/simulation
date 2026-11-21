import { describe, expect, it } from 'vitest';
import { EVENT, EVENT_TYPE, EVENTS } from '../../js/sim/events.js';
import { LOG_RULES } from '../../js/sim/log-rules.js';

describe('LOG_RULES', () => {
    it('names only events of EVENTS and only fields they have', () => {
        for (const [name, rule] of Object.entries(LOG_RULES)) {
            const def = EVENTS.find((event) => event.name === name);
            expect(def, name).toBeDefined();
            const fields = [
                ...(rule.hidden ?? []),
                ...Object.keys(rule.decode ?? {}),
                ...Object.keys(rule.expand ?? {}),
            ];
            for (const field of fields) {
                expect(def?.fields, `${name}.${field}`).toContain(field);
            }
        }
    });

    it('decodes a cause code to its name and throws, naming the event, on a code outside the table', () => {
        expect(LOG_RULES.AGENT_BORN.decode?.cause(2)).toBe('split');
        expect(LOG_RULES.BIRTH_BLOCKED.decode?.cause(1)).toBe('energy');
        expect(() => LOG_RULES.AGENT_BORN.decode?.cause(9)).toThrow('AgentBorn has unknown cause code 9');
        expect(() => LOG_RULES.SEEDING_REFUSED.decode?.source(5)).toThrow(
            'SeedingRefused source has unknown cause code 5',
        );
    });

    it('unpacks the hunter ledger word into the death cause, the birth source and the kills', () => {
        const packed = (3 * 8 + 1) * 8 + 5;
        expect(LOG_RULES.HUNTER_LEDGER.expand?.packed(packed, {})).toEqual({
            cause: 'eaten',
            birth: 'spec-flip',
            kills: 3,
        });
    });

    it('writes the partner of a death as prevBiter when eaten and as pinned when trampled, and neither otherwise', () => {
        const partner = LOG_RULES.AGENT_DIED.expand?.partner;
        expect(partner?.(7, { cause: 'eaten' })).toEqual({ prevBiter: 7 });
        expect(partner?.(1, { cause: 'trampled' })).toEqual({ prevBiter: 0, pinned: true });
        expect(partner?.(7, { cause: 'starved' })).toEqual({ prevBiter: 0 });
    });

    it('adds the FloorGuard record beside PopulationFloor, from the hidden population field', () => {
        const d = new Float64Array(13);
        d[EVENT.POPULATION_FLOOR.POPULATION] = 40;
        const extra = LOG_RULES.POPULATION_FLOOR.also?.({ tick: 5, added: 3 }, d, 0);
        expect(extra).toEqual([
            { level: 'info', event: 'FloorGuard', fields: { tick: 5, population: 40, spawned: 3 } },
        ]);
        expect(EVENT_TYPE.POPULATION_FLOOR).toBe(4);
    });
});
