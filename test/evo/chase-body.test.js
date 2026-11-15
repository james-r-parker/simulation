import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { bodyTable } from '../../js/evo/chase-body.js';

describe('bodyTable', () => {
    const config = arenaConfig();
    const rows = bodyTable(config);
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));

    it('has one row per specialisation, in index order', () => {
        expect(rows.map((r) => r.name)).toEqual(['forager', 'predator', 'reproducer', 'scout', 'defender']);
    });

    it('reads the speed cap and the sprint cap of the config', () => {
        const { maxVelocity, sprintMultiplier, specialisations } = config;
        expect(byName.forager.cruiseSpeed).toBeCloseTo(maxVelocity, 3);
        for (const row of rows) {
            const boost = specialisations[row.name].sprintBoost;
            expect(row.sprintSpeed).toBeCloseTo(maxVelocity * (1 + sprintMultiplier * boost), 3);
        }
    });

    it('turns a body with a turn multiplier below 1 on a wider circle, and a sprint on a wider one than a cruise', () => {
        expect(byName.predator.turnRadius).toBeGreaterThan(byName.forager.turnRadius);
        for (const row of rows) {
            expect(row.sprintTurnRadius).toBeGreaterThan(row.turnRadius);
            expect(row.sprintEnergy).toBeGreaterThan(row.cruiseEnergy);
            expect(row.stopDistance).toBeGreaterThan(0);
        }
    });

    it('stops in the distance the damping gives: speed x damping / (1 - damping)', () => {
        const { damping } = config;
        expect(byName.forager.stopDistance).toBeCloseTo((byName.forager.cruiseSpeed * damping) / (1 - damping), 0);
    });
});
