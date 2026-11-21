// The closed-form rows of "Anchors" in docs/designs/role-budget.md for the bodies, the store and the senses: size, thrust, caps,
// ticks to the cap, turn rate and radius, speed on a held turn, energy per 100 ticks, the courser store, views, reliableView,
// hearing. The other rows are tested where they live: the bites, the kick and the straight-chase table (contact ticks, the
// largest gap closed, the rationed contacts) in role-budget-timeline.test.js and role-budget-body.test.js; the herd rows
// (ring radius, ticks to clear, one trample) have no test yet, they belong to the herd phase. The anchors were computed from
// the code on 2026-11-21 (evals/decisions/role-budget/anchors.md); a row that stops reproducing means the code, or the
// formula, moved.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import {
    burstTicks,
    emptyTicks,
    refillTicks,
    steadySpeed,
    swingTicks,
    ticksToSpeed,
    turnCircle,
} from '../../js/evo/role-budget-kinematics.js';
import { roleParams } from '../../js/evo/role-budget-params.js';
import { hearLoudness, hearWindow, reliableView, viewReach } from '../../js/evo/role-budget-senses.js';

const config = arenaConfig();
const prey = ['forager', 'reproducer', 'scout', 'defender'];
const p = (/** @type {any} */ name, cfg = config) => roleParams(cfg, name);

/** The energy of 100 ticks at a speed: the `tickCost` terms of `energy.js` with the body's own numbers. */
function per100(/** @type {any} */ body, /** @type {any} */ speed, /** @type {any} */ sprinting) {
    const { cost } = body;
    const standing = (cost.passive + cost.size * cost.standingMult * body.size) * cost.heat;
    const one =
        (standing + cost.move * speed * speed) * cost.drain * cost.juvenile +
        (sprinting ? cost.sprint * cost.juvenile : 0);
    return 100 * (one + cost.upkeep);
}

describe('anchors: the bodies', () => {
    it('size 29 for the prey and 45 for the predator', () => {
        for (const name of prey) {
            expect(p(name).size).toBe(29);
        }
        expect(p('predator').size).toBe(45);
    });

    it('thrust 0.525 and 0.7875 for the prey, 0.525 and 0.945 for the predator', () => {
        for (const name of prey) {
            expect(p(name).thrust.cruise).toBeCloseTo(0.525, 12);
            expect(p(name).thrust.sprint).toBeCloseTo(0.7875, 12);
        }
        expect(p('predator').thrust.cruise).toBeCloseTo(0.525, 12);
        expect(p('predator').thrust.sprint).toBeCloseTo(0.945, 12);
    });

    it('cap 8 and 12 for the prey, 8 and 14.4 for the predator; uncapped steady speed 9.975 and 14.9625 / 17.955', () => {
        expect(p('forager').cap).toEqual({ cruise: 8, sprint: 12 });
        expect(p('predator').cap.sprint).toBeCloseTo(14.4, 12);
        expect(steadySpeed(p('forager').thrust.cruise, 0.95)).toBeCloseTo(9.975, 9);
        expect(steadySpeed(p('forager').thrust.sprint, 0.95)).toBeCloseTo(14.9625, 9);
        expect(steadySpeed(p('predator').thrust.sprint, 0.95)).toBeCloseTo(17.955, 9);
    });

    it('32 ticks from rest to the cap in all four gaits', () => {
        for (const name of ['forager', 'predator']) {
            const b = p(name);
            expect(ticksToSpeed(b.thrust.cruise, b.damping, b.cap.cruise)).toBe(32);
            expect(ticksToSpeed(b.thrust.sprint, b.damping, b.cap.sprint)).toBe(32);
        }
    });

    it('turn rate 0.15 and 10.47 ticks to swing 90 degrees for the prey, 0.105 and 14.96 for the predator', () => {
        expect(p('forager').turnRate.start).toBeCloseTo(0.15, 12);
        expect(swingTicks(Math.PI / 2, p('forager').turnRate.start)).toBeCloseTo(10.47, 2);
        expect(p('predator').turnRate.start).toBeCloseTo(0.105, 12);
        expect(swingTicks(Math.PI / 2, p('predator').turnRate.start)).toBeCloseTo(14.96, 2);
    });

    it('turn radius 21.54 and 32.31 (prey) and 41.72 and 75.09 (predator), speed on the held turn 3.231, 4.846, 4.380, 7.885', () => {
        const circle = (/** @type {any} */ name, /** @type {any} */ gait) => {
            const b = /** @type {any} */ (p(name));
            return turnCircle(b.thrust[gait], b.damping, b.turnRate.start, b.cap[gait]);
        };
        expect(circle('forager', 'cruise').radius).toBeCloseTo(21.54, 2);
        expect(circle('forager', 'sprint').radius).toBeCloseTo(32.31, 2);
        expect(circle('predator', 'cruise').radius).toBeCloseTo(41.72, 2);
        expect(circle('predator', 'sprint').radius).toBeCloseTo(75.09, 2);
        expect(circle('forager', 'cruise').speed).toBeCloseTo(3.231, 3);
        expect(circle('forager', 'sprint').speed).toBeCloseTo(4.846, 3);
        expect(circle('predator', 'cruise').speed).toBeCloseTo(4.38, 3);
        expect(circle('predator', 'sprint').speed).toBeCloseTo(7.885, 3);
    });

    it('energy per 100 ticks: 102.72 and 227.72 (prey), scout 104.74 and 229.74, defender 121.92 and 270.93, predator 97.63 and 317.66', () => {
        const read = (/** @type {any} */ name, /** @type {any} */ age) => {
            const b = roleParams(config, name, {}, { age });
            return [per100(b, b.cap.cruise, false), per100(b, b.cap.sprint, true)];
        };
        expect(read('forager', 'adult')[0]).toBeCloseTo(102.72, 1);
        expect(read('forager', 'adult')[1]).toBeCloseTo(227.72, 1);
        expect(read('scout', 'adult')[0]).toBeCloseTo(104.74, 1);
        expect(read('scout', 'adult')[1]).toBeCloseTo(229.74, 1);
        expect(read('defender', 'adult')[0]).toBeCloseTo(121.92, 1);
        expect(read('defender', 'adult')[1]).toBeCloseTo(270.93, 1);
        expect(read('predator', 'adult')[0]).toBeCloseTo(97.63, 1);
        expect(read('predator', 'adult')[1]).toBeCloseTo(317.66, 1);
        expect(read('predator', 'juvenile')[0]).toBeCloseTo(58.65, 1);
        expect(read('predator', 'juvenile')[1]).toBeCloseTo(190.68, 1);
    });
});

describe('anchors: the store of the courser arm', () => {
    const courser = arenaConfig(JSON.parse(readFileSync('evals/fair-chase/courser.json', 'utf8')));

    it('has a burst of 70, 100 to empty and 500 to refill for the prey, and 140, 200 and 500 for the predator', () => {
        const a = p('forager', courser).store;
        const b = p('predator', courser).store;
        expect([burstTicks(a), emptyTicks(a), refillTicks(a)]).toEqual([
            expect.closeTo(70, 9),
            expect.closeTo(100, 9),
            expect.closeTo(500, 9),
        ]);
        expect([burstTicks(b), emptyTicks(b), refillTicks(b)]).toEqual([
            expect.closeTo(140, 9),
            expect.closeTo(200, 9),
            expect.closeTo(500, 9),
        ]);
    });
});

describe('anchors: the senses', () => {
    it('views ahead and behind of each spec', () => {
        const view = (/** @type {any} */ name) => [viewReach(p(name), 0), viewReach(p(name), Math.PI)];
        expect(view('forager')).toEqual([300, 300]);
        expect(view('reproducer')).toEqual([250, 250]);
        expect(view('scout')).toEqual([400, 400]);
        expect(view('defender')[0]).toBe(300);
        expect(view('defender')[1]).toBeCloseTo(240, 9);
        expect(view('predator')[0]).toBe(400);
        expect(view('predator')[1]).toBeCloseTo(160, 9);
    });

    it('reliableView of a size 29 target is 148.65 for both', () => {
        expect(reliableView(p('forager'), 29)).toBeCloseTo(148.65, 2);
        expect(reliableView(p('predator'), 29)).toBeCloseTo(148.65, 2);
    });

    it('hearing at 150 px is 0.5 at tick 0 and under 0.1 from tick 49', () => {
        const caller = p('forager');
        expect(hearLoudness(150, 0, caller)).toBe(0.5);
        expect(hearLoudness(150, 48, caller)).toBeGreaterThan(0.1);
        expect(hearLoudness(150, 49, caller)).toBeLessThan(0.1);
        expect(hearWindow(150, caller, 0.1).ticks).toBe(49);
    });

    it('a body that can see from behind sees the hunter at its rear reach plus the hunter size, 345 for a forager', () => {
        expect(viewReach(p('forager'), Math.PI) + p('predator').size).toBe(345);
    });
});
