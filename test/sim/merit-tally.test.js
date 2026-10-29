import { describe, expect, it } from 'vitest';
import { TALLY } from '../../js/sim/merit-state.js';
import { splitGatedShare, tallyReady } from '../../js/sim/merit-tally.js';
import { addBlob, lifeWorld } from './helpers/life-world.js';

const ON = { splitDeliberateMin: 50, meritSplitFloorPop: 0, splitMinEnergy: 100 };

/**
 * @param {any} w the world
 * @returns {number[]} ready, gated and deliberate-ready totals
 */
function totals(w) {
    return [w.meritTally[TALLY.READY], w.meritTally[TALLY.GATED], w.meritTally[TALLY.DELIBERATE]];
}

describe('tallyReady', () => {
    it('counts a ready agent that passes the gate as ready but not gated', () => {
        const w = lifeWorld(ON);
        addBlob(w, { deliberateIntake: 80 });
        tallyReady(w);
        expect(totals(w)).toEqual([1, 0, 1]);
    });

    it('counts a ready agent the gate blocks as gated', () => {
        const w = lifeWorld(ON);
        addBlob(w, { deliberateIntake: 0 });
        addBlob(w, { deliberateIntake: 10 });
        tallyReady(w);
        expect(totals(w)).toEqual([2, 2, 1]);
    });

    it('skips agents that fail another readyToSplit term, and dead slots', () => {
        const w = lifeWorld(ON);
        addBlob(w, { energy: 50 });
        addBlob(w, { cooldown: 5 });
        addBlob(w, { pregnancy: 5 });
        tallyReady(w);
        expect(totals(w)).toEqual([0, 0, 0]);
    });

    it('opens the gate below the population floor, so nothing is gated', () => {
        const w = lifeWorld({ ...ON, meritSplitFloorPop: 5 });
        addBlob(w);
        addBlob(w);
        tallyReady(w);
        expect(totals(w)).toEqual([2, 0, 0]);
    });

    it('counts no gated agents when the gate is off (splitDeliberateMin 0)', () => {
        const w = lifeWorld({ ...ON, splitDeliberateMin: 0 });
        addBlob(w);
        tallyReady(w);
        expect(totals(w)).toEqual([1, 0, 0]);
    });

    it('accumulates over ticks', () => {
        const w = lifeWorld(ON);
        addBlob(w);
        tallyReady(w);
        tallyReady(w);
        expect(totals(w)).toEqual([2, 2, 0]);
    });

    it('counts nothing when the cap leaves no free slot, as splitAll then evaluates no agent', () => {
        const w = lifeWorld({ ...ON, capBirthsEnabled: true, splitCapMargin: 7 });
        addBlob(w);
        addBlob(w);
        tallyReady(w);
        expect(totals(w)).toEqual([0, 0, 0]);
        w.config = { ...w.config, splitCapMargin: 2 };
        tallyReady(w);
        expect(totals(w)).toEqual([2, 2, 0]);
    });
});

describe('splitGatedShare', () => {
    it('is null before any agent was ready', () => {
        expect(splitGatedShare(lifeWorld(ON))).toBeNull();
    });

    it('is the gated share of ready agent-ticks', () => {
        const w = lifeWorld(ON);
        addBlob(w, { deliberateIntake: 0 });
        addBlob(w, { deliberateIntake: 90 });
        addBlob(w, { deliberateIntake: 90 });
        addBlob(w, { deliberateIntake: 90 });
        tallyReady(w);
        expect(splitGatedShare(w)).toBe(0.25);
    });
});
