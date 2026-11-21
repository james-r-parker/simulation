import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { roleParams } from '../../js/evo/role-budget-params.js';
import { hearLoudness, hearWindow, reliableView, seeLead, viewReach } from '../../js/evo/role-budget-senses.js';

const config = arenaConfig();
const body = (/** @type {any} */ name) => roleParams(config, name);

describe('viewReach', () => {
    it('is the vision range ahead and the all-round eye of the forager, reproducer and scout behind', () => {
        expect(viewReach(body('forager'), 0)).toBe(300);
        expect(viewReach(body('forager'), Math.PI)).toBe(300);
        expect(viewReach(body('reproducer'), Math.PI)).toBe(250);
        expect(viewReach(body('scout'), Math.PI)).toBe(400);
    });

    it('falls to the rear share behind a body with one: 400 and 160 for the predator, 300 and 240 for the defender', () => {
        expect(viewReach(body('predator'), 0)).toBe(400);
        expect(viewReach(body('predator'), Math.PI)).toBeCloseTo(160, 9);
        expect(viewReach(body('predator'), Math.PI / 2)).toBeCloseTo(280, 9);
        expect(viewReach(body('defender'), Math.PI)).toBeCloseTo(240, 9);
        expect(viewReach(body('defender'), Math.PI / 2)).toBeCloseTo(270, 9);
    });
});

describe('reliableView', () => {
    it('is size / sin(pi / rays): 148.65 for a size 29 target at 16 rays', () => {
        expect(reliableView(body('predator'), 29)).toBeCloseTo(148.65, 2);
        expect(reliableView({ view: { rays: 8 } }, 29)).toBeCloseTo(29 / Math.sin(Math.PI / 8), 9);
    });
});

describe('seeLead', () => {
    it('is the hunter reach ahead less the prey reach towards it', () => {
        expect(seeLead(body('predator'), body('forager'), Math.PI)).toBe(100);
        expect(seeLead(body('predator'), body('scout'), Math.PI)).toBe(0);
        expect(seeLead(body('forager'), body('predator'), 0)).toBe(-100);
    });
});

describe('hearLoudness and hearWindow', () => {
    const forager = body('forager');

    it('is (1 - d / R)(1 - t / callTicks): 0.5 at 150 px and tick 0', () => {
        expect(hearLoudness(150, 0, forager)).toBe(0.5);
        expect(hearLoudness(150, 30, forager)).toBe(0.25);
        expect(hearLoudness(0, 0, forager)).toBe(1);
    });

    it('is 0 at or beyond the radius and after the call is over', () => {
        expect(hearLoudness(300, 0, forager)).toBe(0);
        expect(hearLoudness(150, 60, forager)).toBe(0);
    });

    it('has a window of 49 ticks at 150 px above 0.1 (the float32 of the sim reads t = 48 as just above) and 270 px', () => {
        const window = hearWindow(150, forager, 0.1);
        expect(hearLoudness(150, 48, forager)).toBeGreaterThan(0.1);
        expect(hearLoudness(150, 49, forager)).toBeLessThan(0.1);
        expect(window).toEqual({ ticks: 49, distance: 270 });
    });

    it('has no ticks at a distance the call never reaches above the threshold', () => {
        expect(hearWindow(290, forager, 0.1).ticks).toBe(0);
    });
});
