// reads: evals/fair-chase/courser.json
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { AUDIT_BEARINGS } from '../../js/evo/role-budget-chase.js';
import { TOLERANCE, chaseCells, formulaChase, kinematicRows, simChase } from '../../js/evo/role-budget-check.js';

const courser = arenaConfig(JSON.parse(readFileSync('evals/fair-chase/courser.json', 'utf8')));
const scene = { hunter: 'predator', prey: 'forager', distance: 240, bearing: 0, straight: true };

describe('kinematicRows', () => {
    it('reads speeds, turn radii and energy per 100 ticks of each spec against the body table, none outside its tolerance', () => {
        for (const config of [arenaConfig(), courser]) {
            const rows = kinematicRows(config);
            expect(rows).toHaveLength(5 * 6);
            expect(rows.filter((r) => r.drift)).toEqual([]);
            expect(new Set(rows.map((r) => r.what)).size).toBe(6);
        }
    });

    it('carries the tolerance of the plan for each reading and flags a reading outside it', () => {
        const rows = kinematicRows(arenaConfig());
        const radius = rows.find((r) => r.what === 'turn radius');
        expect(radius?.tolerance).toBe(TOLERANCE.radius);
        expect(rows.find((r) => r.what === 'energy per 100 ticks')?.tolerance).toBe(TOLERANCE.energy);
        // a formula that did not follow the config would drift: the sim of one config against the formula of another
        const sim = kinematicRows(arenaConfig({ maxVelocity: 9 }));
        expect(sim.every((r) => !r.drift)).toBe(true);
        expect(Math.abs(sim[0].formula / kinematicRows(arenaConfig())[0].formula - 1)).toBeGreaterThan(0.1);
    });
});

describe('the scene and the formula', () => {
    it('kill the prey on the straight bound within 2 ticks of each other: the formula is a scalar mirror of the sim', () => {
        const formula = formulaChase(courser, scene).killTick;
        const sim = simChase(courser, scene).killTick;
        expect(formula).not.toBeNull();
        expect(sim).not.toBeNull();
        expect(Math.abs(/** @type {number} */ (formula) - /** @type {number} */ (sim))).toBeLessThanOrEqual(
            TOLERANCE.contactTicks,
        );
    });

    it('both fail to kill a prey out of reach, and a breaking prey the defaults cannot catch', () => {
        expect(simChase(arenaConfig(), { ...scene, distance: 400, straight: false }).killTick).toBeNull();
        expect(formulaChase(arenaConfig(), { ...scene, distance: 400, straight: false }).killTick).toBeNull();
        expect(simChase(courser, { ...scene, distance: 401, bearing: 1.5 }).killTick).toBeNull();
    });

    it('play the bearing of the start: a prey behind the hunter takes longer than one ahead', () => {
        const ahead = formulaChase(courser, { ...scene, distance: 160 }).killTick;
        const behind = formulaChase(courser, { ...scene, distance: 160, bearing: Math.PI }).killTick;
        expect(ahead).not.toBeNull();
        expect(behind === null || behind > /** @type {number} */ (ahead)).toBe(true);
    });
});

describe('chaseCells', () => {
    it('plays a start distance at the eight audit bearings both ways: both kill or both do not, within 2 ticks', () => {
        const cells = chaseCells(courser, { hunter: 'predator', prey: 'forager', straight: true }, [0.4]);
        expect(cells).toHaveLength(AUDIT_BEARINGS.length);
        expect(cells.filter((c) => c.edge || c.drift)).toEqual([]);
        expect(cells.every((c) => c.agrees)).toBe(true);
        for (const c of cells.filter((x) => x.formula !== null && x.sim !== null)) {
            expect(Math.abs(/** @type {number} */ (c.formula) - /** @type {number} */ (c.sim))).toBeLessThanOrEqual(
                TOLERANCE.contactTicks,
            );
        }
    });

    it('flags the cells at the hunter view as the edge, where a disagreement is not read as drift', () => {
        const cells = chaseCells(courser, { hunter: 'predator', prey: 'forager', straight: false }, [1]);
        expect(cells).toHaveLength(AUDIT_BEARINGS.length);
        expect(cells.every((c) => c.edge && c.distance === 400)).toBe(true);
        expect(cells.every((c) => c.agrees || !c.drift)).toBe(true);
    });
});
