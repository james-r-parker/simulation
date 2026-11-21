import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { DEFENDER_CANDIDATES, searchDefender } from '../../js/evo/role-budget-search-defend.js';

const SHOVE = { defenderRepelEnergy: 40, defenderRepelImpulse: 4 };
const search = (/** @type {Record<string, any>} */ overrides, /** @type {'defence' | 'smoke'} */ goal, extra = {}) =>
    searchDefender(arenaConfig(overrides), { overrides, model: MODEL_DEFAULTS, goal, ...extra });

describe('searchDefender', () => {
    it('finds nothing for the defence at the defaults: with the shove off no scaling of a setting turns it on', () => {
        expect(search({}, 'defence')).toEqual([]);
    });

    it('with the shove on, names the single settings that let the defender arrive in time, smallest change first', () => {
        const found = search(SHOVE, 'defence');
        expect(found.length).toBeGreaterThan(0);
        for (const f of found) {
            expect(f.goal).toBe('defence');
            for (const step of ['hear', 'turn', 'run', 'intercept']) {
                expect(f.margins[step]).not.toBeNull();
            }
        }
        const changes = found.map((f) => Math.abs(f.factor - 1));
        expect(changes).toEqual([...changes].sort((a, b) => a - b));
    });

    it('each finding is a full overrides object: the config makes it, and it carries the base overrides', () => {
        for (const f of search(SHOVE, 'defence')) {
            expect(() => arenaConfig(f.overrides)).not.toThrow();
            expect(f.overrides.defenderRepelEnergy).toBe(40);
        }
    });

    it('is empty when the goal is already reached, and skips a setting that is 0 in the config', () => {
        const [first] = search(SHOVE, 'defence');
        expect(search(first.overrides, 'defence')).toEqual([]);
        const only = search(SHOVE, 'defence', { candidates: ['defenderRepelEnergy'], factors: [2] });
        expect(only.every((f) => f.path === 'defenderRepelEnergy')).toBe(true);
        expect(search({}, 'defence', { candidates: ['defenderRepelEnergy'], factors: [2] })).toEqual([]);
    });

    it('skips a value the config refuses', () => {
        expect(search(SHOVE, 'defence', { candidates: ['damping'], factors: [2] })).toEqual([]);
    });

    it('lists the settings it tries', () => {
        expect(DEFENDER_CANDIDATES).toContain('defenderRepelEnergy');
        expect(DEFENDER_CANDIDATES).toContain('smokeRadius');
    });
});
