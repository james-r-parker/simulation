import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DRILL_BODY_KEYS, drillBodyRules, layerArena } from '../../js/evo/drill-body-rules.js';
import { sprintArena } from '../../js/evo/drill-scenarios.js';

const courser = JSON.parse(readFileSync(new URL('../../evals/fair-chase/courser.json', import.meta.url), 'utf8'));

describe('drillBodyRules', () => {
    it('carries the sprint store of the courser arm', () => {
        const rules = drillBodyRules(courser);
        expect(rules.sprintStoreEnabled).toBe(true);
        expect(rules.sprintDrain).toBe(0.01);
        expect(rules.specialisations).toEqual({ predator: { sprintDrainMultiplier: 0.5 } });
    });

    it('is empty for a world that sets no body rule, whatever else it sets', () => {
        expect(drillBodyRules({})).toEqual({});
        const other = { width: 800, specialisations: { forager: { sprintBoost: 0.2 } } };
        expect(drillBodyRules(other)).toEqual({});
    });

    it('leaves food, density and world size to the drill', () => {
        const rules = drillBodyRules({ ...courser, width: 800, height: 600, minAgents: 40, foodDensity: 3 });
        const allowed = new Set([...DRILL_BODY_KEYS, 'specialisations']);
        expect(Object.keys(rules).every((key) => allowed.has(key))).toBe(true);
    });
});

describe('layerArena', () => {
    it('is the plain spread when the config has no specialisations', () => {
        const arena = sprintArena(0.2);
        expect(layerArena({ sprintStoreEnabled: true }, arena)).toEqual({ sprintStoreEnabled: true, ...arena });
        expect(layerArena(undefined, arena)).toEqual(arena);
    });

    it('keeps a body rule the arena does not name, and lets the arena win on its own keys', () => {
        const config = { specialisations: { predator: { sprintDrainMultiplier: 0.5 }, forager: { sprintBoost: 9 } } };
        expect(layerArena(config, sprintArena(0.2)).specialisations).toEqual({
            predator: { sprintDrainMultiplier: 0.5 },
            forager: { sprintBoost: 0.2 },
        });
    });
});
