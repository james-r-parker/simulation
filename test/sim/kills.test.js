import { describe, expect, it } from 'vitest';
import { INCOME, INCOME_KINDS } from '../../js/sim/hunter-ledger.js';
import { creditKills, noteBite, noteKill } from '../../js/sim/kills.js';
import { meritPhase } from '../../js/sim/merit-phase.js';
import { reap } from '../../js/sim/population.js';
import { fatalBite, EVENT_TYPE } from './helpers/fatal-bite.js';
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

// One kill rule (docs/designs/metric-trust.md, "One kill"): a fatal bite is a kill when the bite itself was deliberate.
// Today the ledger, the events and the observer read the deliberateness of the bite BEFORE the fatal one (the victim is
// freed in `reap` before the merit phase notes the fatal bite), so these are marked `fails` until T14 routes them
// through `isDeliberateKill`; T14 turns each `it.fails` into `it`.
/** The `hunterIncomeBySpec` offset of the predator specialisation (index 1). */
const PREDATOR_ROW = PREDATOR * INCOME_KINDS;

describe('a fatal bite in the tick the victim dies', () => {
    /** The kills a `HunterLedger` record holds. */
    const ledgerKillsOf = (/** @type {number[]} */ record) => Math.floor(record[4] / 64);

    it('is a kill in the ledger, the HunterKill events and the observer when the bite was deliberate', () => {
        const { run, hunter, hunterId, events } = fatalBite({ deliberate: true });
        const { world, observer } = run;
        expect(world.ledgerKills[hunter]).toBe(1);
        expect(events(EVENT_TYPE.HUNTER_KILL).map((r) => r[2])).toEqual([hunterId]);
        expect(observer.intent.run.huntKillsDeliberate).toBe(1);
        expect(world.ledgerKillEnergy[hunter]).toBe(1);
        expect(world.hunterIncomeBySpec[PREDATOR_ROW + INCOME.KILL]).toBe(1);
    });

    it('is a kill in none of them when the bite was not deliberate', () => {
        const { run, hunter, events } = fatalBite({ deliberate: false });
        expect(run.world.ledgerKills[hunter]).toBe(0);
        expect(events(EVENT_TYPE.HUNTER_KILL)).toEqual([]);
        expect(run.observer.intent.run.huntKillsDeliberate).toBe(0);
    });

    it('books the energy a non-deliberate fatal bite gained as bite gain, not kill energy', () => {
        const { run, hunter } = fatalBite({ deliberate: false });
        const { world } = run;
        expect(world.ledgerKillEnergy[hunter]).toBe(0);
        expect(world.ledgerBiteGain[hunter]).toBe(1);
        expect(world.hunterIncomeBySpec[PREDATOR_ROW + INCOME.KILL]).toBe(0);
        expect(world.hunterIncomeBySpec[PREDATOR_ROW + INCOME.BITE]).toBe(1);
    });

    it('is credited to a killer that dies in the same tick, in the ledger record and the event', () => {
        const { hunterId, events } = fatalBite({ deliberate: true, killerDiesToo: true });
        expect(events(EVENT_TYPE.HUNTER_KILL).map((r) => r[2])).toEqual([hunterId]);
        const [record] = events(EVENT_TYPE.HUNTER_LEDGER);
        expect(record[2]).toBe(hunterId);
        expect(ledgerKillsOf(record)).toBe(1);
    });

    it('is not credited to deliberateKills when the killer is gone, whatever the bite', () => {
        const { w, prey } = bitten(true);
        noteBite(w, prey);
        noteKill(w, prey);
        w.alive[0] = 0;
        w.genomeId[0] = 0;
        creditKills(w);
        expect(w.deliberateKills[0]).toBe(0);
    });
});
