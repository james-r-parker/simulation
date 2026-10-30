import { describe, expect, it } from 'vitest';
import { creditKills, noteBite, noteKill } from '../../js/sim/kills.js';
import { meritPhase } from '../../js/sim/merit-phase.js';
import { reap } from '../../js/sim/population.js';
import { addBlob, lifeWorld, recordingPolicy } from './helpers/life-world.js';

const PREDATOR = 1;

/**
 * A predator and a prey it has bitten, with the predator's prey tracker reading deliberate or not.
 * @param {boolean} deliberate whether the biter's bite reads deliberate at the tick
 * @returns {{w: any, hunter: number, prey: number}} the world and the two slots
 */
function bitten(deliberate) {
    const w = lifeWorld({ maxAgents: 8, maturityTicks: 100, meritHalfLife: 0 });
    const hunter = addBlob(w, { spec: PREDATOR, ageTicks: 5 });
    const prey = addBlob(w, { ageTicks: 5, bittenTimer: 1 });
    w.lastBiter[prey] = w.genomeId[hunter];
    w.tick = 50;
    if (deliberate) {
        w.meritPrey.seen[hunter] = w.tick;
        w.meritPrey.bits[hunter] = 0b11111111;
        w.meritPrey.turn[hunter] = w.tick;
    }
    return { w, hunter, prey };
}

describe('noteBite', () => {
    it('records whether the biter was deliberate, for the victim', () => {
        const yes = bitten(true);
        noteBite(yes.w, yes.prey);
        expect(yes.w.lastBiteDeliberate[yes.prey]).toBe(1);
        const no = bitten(false);
        noteBite(no.w, no.prey);
        expect(no.w.lastBiteDeliberate[no.prey]).toBe(0);
    });

    it('records a gone biter as not deliberate', () => {
        const { w, prey } = bitten(true);
        w.lastBiter[prey] = 99999;
        noteBite(w, prey);
        expect(w.lastBiteDeliberate[prey]).toBe(0);
    });
});

describe('a kill', () => {
    it('is credited to the living killer when the victim was last bitten deliberately', () => {
        const { w, hunter, prey } = bitten(true);
        noteBite(w, prey);
        noteKill(w, prey);
        creditKills(w);
        expect(w.deliberateKills[hunter]).toBe(1);
        expect(w.killCount).toBe(0);
    });

    it('is not credited after a chance bite, or to a killer that is gone', () => {
        const chance = bitten(false);
        noteBite(chance.w, chance.prey);
        noteKill(chance.w, chance.prey);
        creditKills(chance.w);
        expect(chance.w.deliberateKills[chance.hunter]).toBe(0);
        const gone = bitten(true);
        noteBite(gone.w, gone.prey);
        noteKill(gone.w, gone.prey);
        gone.w.alive[gone.hunter] = 0;
        gone.w.genomeId[gone.hunter] = 0;
        creditKills(gone.w);
        expect(gone.w.killCount).toBe(0);
    });

    it('is logged when an eaten agent is reaped, and credited by the merit phase of the tick', () => {
        const { w, hunter, prey } = bitten(true);
        noteBite(w, prey);
        w.energy[prey] = 0;
        w.lastLoss[prey] = 2;
        reap(w, recordingPolicy([]));
        expect(w.alive[prey]).toBe(0);
        expect(w.killCount).toBe(1);
        meritPhase(w);
        expect(w.deliberateKills[hunter]).toBe(1);
        expect(w.killCount).toBe(0);
    });

    it('is not logged for a death that is not an eating', () => {
        const { w, prey } = bitten(true);
        noteBite(w, prey);
        w.lastBiter[prey] = 0;
        w.energy[prey] = 0;
        reap(w, recordingPolicy([]));
        expect(w.killCount).toBe(0);
    });
});
