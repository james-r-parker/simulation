import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { preStep5Arena } from '../helpers/pre-step5.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { roleParams } from '../../js/evo/role-budget-params.js';
import { hunterXs } from '../../js/evo/role-budget-smoke.js';
import { budgetWarn, warnTimeline } from '../../js/evo/role-budget-warn.js';

/** @param {Record<string, any>} overrides @returns {{scout: any, forager: any, hunter: any}} the bodies of the row */
const bodiesOf = (overrides) => {
    const config = preStep5Arena(overrides);
    const [scout, forager, hunter] = ['scout', 'forager', 'predator'].map((s) => roleParams(config, s));
    return { scout, forager, hunter };
};
const budget = (/** @type {Record<string, any>} */ overrides = {}, model = MODEL_DEFAULTS) => {
    const { scout, forager, hunter } = bodiesOf(overrides);
    return budgetWarn(scout, forager, hunter, model);
};
const courser = JSON.parse(readFileSync('evals/fair-chase/courser.json', 'utf8'));
const margins = (/** @type {ReturnType<typeof budget>} */ b) => Object.values(b.cells).map((c) => c.margin);

describe('warnTimeline at the defaults', () => {
    const chain = warnTimeline(bodiesOf({}), MODEL_DEFAULTS);

    it('has the scout see the hunter at its reach plus the hunter size, and the chain run reaction, 1, reaction and the turn', () => {
        expect(chain.gapSee).toBe(445);
        expect([chain.alarmTick, chain.heardTick, chain.startTick, chain.runTick]).toEqual([2, 3, 5, 16]);
    });

    it('creeps at the hunter cruise speed, 8 px a tick, until the forager acts, and sprints from then (Phase 1 convention)', () => {
        const { hunter } = bodiesOf({});
        const sprint = hunterXs(hunter, { speed: hunter.cap.cruise, ticks: 11 });
        expect(chain.gapAtStart).toBe(445 - 8 * 5);
        expect(chain.gapAtRun).toBeLessThan(445 - 8 * 16);
        expect(chain.gapAtRun).toBeGreaterThan(chain.gapAtStart - sprint[11]);
    });

    it('has the forager gain about 25 px on the hunter while it turns, and be flying when it runs (T15a)', () => {
        const { hunter } = bodiesOf({});
        const sprint = hunterXs(hunter, { speed: hunter.cap.cruise, ticks: 11 });
        const gain = chain.gapAtRun - (chain.gapAtStart - sprint[11]);
        expect(gain).toBeGreaterThan(20);
        expect(gain).toBeLessThan(30);
        expect(chain.gapAtRun).toBeCloseTo(314.64, 1);
        expect(chain.flight?.preyStart.speed).toBeCloseTo(5.84, 2);
        expect(chain.flight?.preyStart.offset).toBeCloseTo(0.075, 3);
    });

    it('a tick of delay before the forager acts costs 8 px, one while it turns or waits costs the hunter sprint travel', () => {
        const at = (/** @type {Record<string, number>} */ delays) => warnTimeline(bodiesOf({}), MODEL_DEFAULTS, delays);
        const { hunter } = bodiesOf({});
        const xs = hunterXs(hunter, { speed: hunter.cap.cruise, ticks: 13 });
        expect(at({ see: 3 }).gapAtStart).toBe(chain.gapAtStart - 24);
        expect(at({ hear: 3 }).gapAtRun).toBeCloseTo(chain.gapAtRun - 24, 0);
        // a delay holds the forager still while the hunter sprints on: the gap closes by the sprint travel of those ticks
        expect(at({ turn: 2 }).gapAtRun).toBeCloseTo(chain.gapAtRun - (xs[13] - xs[11]), 0);
        expect(at({ run: 2 }).gapAtRun).toBeCloseTo(at({ turn: 2 }).gapAtRun, 9);
        expect(at({ run: 2 }).gapAtRun).toBeLessThan(chain.gapAtRun - 16);
        expect(at({ hear: 49 }).heardTick).toBe(-1);
        expect(at({ hear: 48 }).heardTick).toBeGreaterThan(0);
    });
});

describe('budgetWarn', () => {
    it('at the defaults the warning beats the forager own sight by 7 ticks, and the turned, flying forager leaves 16 more', () => {
        const b = budget();
        expect(margins(b)).toEqual([12, 28, 7, 16, 16]);
        expect(b.row.status).toBe('ok');
        expect(b.binding).toBe('warn');
        expect(b.gaps).toEqual({ own: 345, catchable: expect.closeTo(86.3, 0), speed: 8 });
        expect(b.cells.run.distance).toBeCloseTo(b.chain.gapAtRun - b.gaps.catchable, 6);
    });

    it('on the courser arm the hunter closes on the warned forager: run is impossible and turn is not read', () => {
        const b = budget(courser);
        expect(b.cells.run.status).toBe('impossible');
        expect(b.cells.turn.status).toBe('n/a');
        expect(b.cells.hear.margin).toBe(48);
        expect(b.binding).toBe('run');
    });

    it('a forager outside the scout call radius never hears: hear is impossible and no step after it is read', () => {
        const b = budget({ specialisations: { scout: { body: { callRadius: 0.4 } } } });
        expect(b.cells.hear.status).toBe('impossible');
        expect(['warn', 'turn', 'run'].map((s) => b.cells[s].status)).toEqual(['n/a', 'n/a', 'n/a']);
        expect(b.binding).toBe('hear');
    });

    it('the scout must out-see the forager: with no lead the see step is impossible', () => {
        const b = budget({ specialisations: { scout: { visionRange: 250 } } });
        expect(b.cells.see.status).toBe('impossible');
        expect(b.binding).toBe('see');
    });

    it('a warning later than the forager own sight is impossible at warn', () => {
        const b = budget({ specialisations: { scout: { visionRange: 310 } } });
        expect(b.cells.warn.status).toBe('impossible');
    });

    it('counts the bites to kill a forager, and more of them when its seen alarm cuts the bite', () => {
        expect(budget().bites).toEqual({ plain: 5, alarmed: 5 });
        expect(budget({ alarmBiteShare: 0.5 }).bites.alarmed).toBeGreaterThan(5);
    });
});
