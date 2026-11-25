import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createPreStep5Config } from '../helpers/pre-step5.js';
import { preStep5Arena } from '../helpers/pre-step5.js';
import { playForaging, playIdle, playLiving } from '../../js/evo/role-scenes-thrive.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const world = createPreStep5Config({});
const COURSER = JSON.parse(readFileSync('evals/fair-chase/courser.json', 'utf8'));

describe('playIdle', () => {
    it(
        'a sitter alone lives the ticks its energy lasts with the body cooling: 2744 from 200, 7741 from 800 (a forager)',
        () => {
            expect(playIdle(world, { spec: 'forager', energy: 200, speed: 0 })).toEqual({
                ticks: { life: 2744 },
                outcome: { died: true, coldest: expect.any(Number) },
            });
            expect(playIdle(world, { spec: 'forager', energy: 800, speed: 0 }).ticks.life).toBe(7741);
        },
        scaleTimeout(30000),
    );

    it('a walker dies sooner than a sitter: it pays for every px, and keeps warmer', () => {
        const walked = playIdle(world, { spec: 'forager', energy: 200, speed: 2.1 });
        const sat = playIdle(world, { spec: 'forager', energy: 200, speed: 0 });
        expect(walked.ticks.life).toBeLessThan(sat.ticks.life);
        expect(walked.outcome.coldest).toBeGreaterThan(sat.outcome.coldest);
    });

    it('ends at maxAgeTicks when the energy would outlast it (old age)', () => {
        const rich = createPreStep5Config({ maxAgeTicks: 500, maturityTicks: 100 });
        const r = playIdle(rich, { spec: 'forager', energy: 800, speed: 0 });
        expect(r.ticks.life).toBe(500);
    });
});

describe('setEnergy through playIdle', () => {
    it(
        'raises a staged body to more than the spawn energy and lowers it to less',
        () => {
            const rich = playIdle(world, { spec: 'forager', energy: 1200, speed: 0 });
            const poor = playIdle(world, { spec: 'forager', energy: 200, speed: 0 });
            expect(rich.ticks.life).toBeGreaterThan(poor.ticks.life);
        },
        scaleTimeout(30000),
    );
});

describe('playForaging', () => {
    it('eats the first meal at once from a grid with food under the body, then settles to a rate', () => {
        const density = (3600 * 0.98) / (16 * Math.PI * 400 * 400);
        const r = playForaging(world, { spec: 'forager', density, energy: 200, stop: 1500 });
        expect(r.ticks.firstMeal).toBe(1);
        expect(r.ticks.settled).toBeGreaterThan(30);
        expect(r.ticks.meals).toBeGreaterThan(10);
        expect(r.outcome.netPerTick).toBeGreaterThan(3);
        expect(r.outcome.energy).toBeGreaterThan(1500);
    });

    it('reads nothing when there is no food in reach before the limit (a grid of one item per 1e6 px2 is eaten out)', () => {
        const r = playForaging(world, { spec: 'forager', density: 1e-6, energy: 200, stop: 1500, limit: 40 });
        expect(r.ticks.settled).toBeNull();
        expect(r.outcome.netPerTick).toBeNull();
    });

    it('replays bit for bit', () => {
        const a = playForaging(world, { spec: 'forager', density: 4e-4, energy: 200, stop: 900 });
        expect(playForaging(world, { spec: 'forager', density: 4e-4, energy: 200, stop: 900 })).toEqual(a);
    });
});

describe('playLiving', () => {
    it('plays the scripted chase at the awareness gap: no kill at the defaults, a kill on the courser arm', () => {
        const none = playLiving(preStep5Arena(), { prey: 'forager', gate: 600, birth: 200 });
        expect(none.ticks.killTick).toBeNull();
        expect(none.outcome).toEqual({ net: null, chasesToGate: null });
        const killed = playLiving(preStep5Arena(COURSER), { prey: 'forager', gate: 600, birth: 200 });
        expect(killed.ticks.killTick).toBeGreaterThan(0);
        expect(typeof killed.outcome.net).toBe('number');
    });
});
