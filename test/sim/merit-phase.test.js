import { describe, expect, it } from 'vitest';
import { EVENT_TYPE } from '../../js/sim/events.js';
import { ESCAPE_TICKS } from '../../js/sim/merit-state.js';
import { meritPhase } from '../../js/sim/merit-phase.js';
import { STEP_PHASES } from '../../js/sim/step.js';
import { addBlob, lifeWorld } from './helpers/life-world.js';

const PREDATOR = 1;

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {any} a merit-on world without decay
 */
function world(over = {}) {
    return lifeWorld({ meritHalfLife: 0, maturityTicks: 100, ...over });
}

/**
 * Makes the slot's food (or prey) tracker read deliberate for the tick the phase runs at.
 * @param {any} w the world
 * @param {number} slot the slot
 * @param {'meritFood' | 'meritPrey'} kind the tracker
 * @returns {void}
 */
function makeDeliberate(w, slot, kind) {
    const view = w[kind];
    view.seen[slot] = w.tick;
    view.bits[slot] = 0b11111111;
    view.turn[slot] = w.tick;
}

describe('meritPhase', () => {
    it('is a named step phase after field and before invariants', () => {
        const names = STEP_PHASES.map((p) => p.name);
        expect(names.indexOf('merit')).toBe(names.indexOf('field') + 1);
        expect(names.indexOf('merit')).toBe(names.indexOf('invariants') - 1);
    });

    it('credits a chance meal nothing and a deliberate one in full', () => {
        const w = world();
        const chance = addBlob(w, { ageTicks: 5, foodEnergy: 40 });
        const deliberate = addBlob(w, { ageTicks: 5, foodEnergy: 40 });
        w.tick = 50;
        makeDeliberate(w, deliberate, 'meritFood');
        meritPhase(w);
        expect(w.merit[chance]).toBe(0);
        expect(w.deliberateIntake[chance]).toBe(0);
        expect(w.merit[deliberate]).toBe(40);
        expect(w.deliberateIntake[deliberate]).toBe(40);
    });

    it('credits only the energy gained since the last tick', () => {
        const w = world();
        const slot = addBlob(w, { ageTicks: 5, foodEnergy: 40 });
        w.tick = 50;
        makeDeliberate(w, slot, 'meritFood');
        meritPhase(w);
        w.tick += 1;
        meritPhase(w);
        expect(w.merit[slot]).toBe(40);
        w.foodEnergy[slot] = 60;
        w.tick += 1;
        meritPhase(w);
        expect(w.merit[slot]).toBe(60);
    });

    it('credits bite energy by the prey tracker', () => {
        const w = world();
        const chance = addBlob(w, { ageTicks: 5, biteEnergy: 20 });
        const deliberate = addBlob(w, { ageTicks: 5, biteEnergy: 20 });
        w.tick = 50;
        makeDeliberate(w, deliberate, 'meritPrey');
        meritPhase(w);
        expect(w.merit[chance]).toBe(0);
        expect(w.merit[deliberate]).toBe(20);
        expect(w.deliberateIntake[deliberate]).toBe(20);
    });

    it('does not count a meal against a newborn slot that reuses an old mark', () => {
        const w = world();
        const slot = addBlob(w, { ageTicks: 5, foodEnergy: 40 });
        meritPhase(w);
        w.alive[slot] = 0;
        w.population -= 1;
        w.foodEnergy[slot] = 0;
        const reused = addBlob(w, { ageTicks: 1 });
        expect(reused).toBe(slot);
        w.tick += 1;
        meritPhase(w);
        expect(w.merit[reused]).toBe(0);
    });

    it('credits an escape 300 ticks after a canHunt agent bit it, if it fled', () => {
        const w = world({ meritEscapeBonus: 60 });
        const hunter = addBlob(w, { ageTicks: 5, spec: PREDATOR });
        const fled = addBlob(w, { ageTicks: 5, bittenTimer: 1, vx: 1000 });
        const froze = addBlob(w, { ageTicks: 5, bittenTimer: 1 });
        for (const victim of [fled, froze]) {
            w.lastBiter[victim] = w.genomeId[hunter];
        }
        w.tick = 100;
        meritPhase(w);
        expect([w.biteOpen[fled], w.biteOpen[froze]]).toEqual([1, 1]);
        w.vx[fled] = 0;
        w.bittenTimer[fled] = 50;
        w.bittenTimer[froze] = 50;
        w.tick = 100 + ESCAPE_TICKS - 1;
        meritPhase(w);
        expect([w.merit[fled], w.merit[froze]]).toEqual([0, 0]);
        w.tick = 100 + ESCAPE_TICKS;
        meritPhase(w);
        expect([w.merit[fled], w.merit[froze]]).toEqual([60, 0]);
        expect([w.biteOpen[fled], w.biteOpen[froze]]).toEqual([0, 0]);
    });

    it('opens no episode for a bite by an agent without canHunt, or by one that is gone', () => {
        const w = world();
        const forager = addBlob(w, { ageTicks: 5, spec: 0 });
        const victim = addBlob(w, { ageTicks: 5, bittenTimer: 1 });
        w.lastBiter[victim] = w.genomeId[forager];
        w.tick = 100;
        meritPhase(w);
        expect(w.biteOpen[victim]).toBe(0);
        w.lastBiter[victim] = 12345;
        meritPhase(w);
        expect(w.biteOpen[victim]).toBe(0);
    });

    it('credits both living parents once when a child reaches maturityTicks', () => {
        const w = world({ meritChildBonus: 300 });
        const mother = addBlob(w, { ageTicks: 500 });
        const father = addBlob(w, { ageTicks: 500 });
        const child = addBlob(w, {
            ageTicks: 99,
            parentA: w.genomeId[mother],
            parentB: w.genomeId[father],
            parentSlotA: mother,
            parentSlotB: father,
        });
        meritPhase(w);
        expect([w.merit[mother], w.merit[father]]).toEqual([0, 0]);
        w.ageTicks[child] = 100;
        meritPhase(w);
        expect([w.merit[mother], w.merit[father]]).toEqual([300, 300]);
        w.ageTicks[child] = 101;
        meritPhase(w);
        expect([w.merit[mother], w.merit[father]]).toEqual([300, 300]);
    });

    it('pushes a MeritSummary on MERIT_LOG_TICKS multiples only', () => {
        const w = world();
        addBlob(w, { ageTicks: 5 });
        w.tick = 999;
        meritPhase(w);
        expect(w.events.count).toBe(0);
        w.tick = 1000;
        meritPhase(w);
        expect(w.events.count).toBe(1);
        expect(w.events.data[0]).toBe(EVENT_TYPE.MERIT_SUMMARY);
    });

    it('draws no randomness', () => {
        const w = world();
        addBlob(w, { ageTicks: 5, foodEnergy: 40 });
        const before = JSON.stringify(w.rng);
        w.tick = 1000;
        meritPhase(w);
        expect(JSON.stringify(w.rng)).toBe(before);
    });
});
