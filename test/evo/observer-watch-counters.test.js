import { describe, expect, it } from 'vitest';
import { noteChase, patchesVisitedOf } from '../../js/evo/observer-watch-counters.js';
import { observe } from '../../js/evo/observer.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { addBorn, nextTick, observed, pushDied } from './helpers/observer-world.js';

const WINDOW = 120; // the default packWindow

/**
 * A run with a hunter (slot 0, genome id 1) and prey (slot 1) tracked, both born at tick 0.
 * @param {Record<string, any>} [over] config overrides
 * @returns {Record<string, any>}
 */
function chase(over = {}) {
    const r = observed({ packWindow: WINDOW, maxAgents: 8, ...over });
    nextTick(r.world, 0);
    const hunter = addBorn(r.world);
    const prey = addBorn(r.world);
    observe(r.observer, r.world);
    return { ...r, hunter, prey };
}

/**
 * Makes the hunter's bite on the prey land at `tick`, deliberately or not, and runs the chain credit.
 * @param {Record<string, any>} r the run
 * @param {number} tick the tick
 * @param {boolean} [deliberate] whether the intent tracker sees the bite as deliberate
 * @param {number} [victim] the bitten slot
 * @returns {void}
 */
function bite(r, tick, deliberate = true, victim = r.prey) {
    const { world, observer, hunter } = r;
    nextTick(world, tick);
    world.bittenTimer.fill(0);
    world.bittenTimer[victim] = 1;
    world.lastBiter[victim] = world.genomeId[hunter];
    const prey = observer.intent;
    prey.lastPrey[hunter] = deliberate ? tick : -Infinity;
    prey.preyBits[hunter] = deliberate ? 0xffff : 0;
    prey.preyTurn[hunter] = tick;
    noteChase(observer, world);
}

describe('chaseTicks', () => {
    it('credits the ticks between two deliberate bites on the same prey', () => {
        const r = chase();
        bite(r, 10);
        expect(r.observer.chaseTicks[r.hunter]).toBe(0);
        bite(r, 14);
        expect(r.observer.chaseTicks[r.hunter]).toBe(4);
    });

    it('extends a chain bite by bite', () => {
        const r = chase();
        for (const t of [10, 20, 35, 40]) {
            bite(r, t);
        }
        expect(r.observer.chaseTicks[r.hunter]).toBe(30);
    });

    it('credits a gap of exactly packWindow and nothing above it', () => {
        const r = chase();
        bite(r, 10);
        bite(r, 10 + WINDOW);
        expect(r.observer.chaseTicks[r.hunter]).toBe(WINDOW);
        bite(r, 10 + 2 * WINDOW + 1);
        expect(r.observer.chaseTicks[r.hunter]).toBe(WINDOW);
    });

    it('does not credit the broken stretch, and credits the resumed chain again', () => {
        const r = chase();
        bite(r, 10);
        bite(r, 15);
        bite(r, 15 + WINDOW + 50);
        bite(r, 15 + WINDOW + 53);
        expect(r.observer.chaseTicks[r.hunter]).toBe(5 + 3);
    });

    it('does not credit a chance bite, and a chance bite does not extend the chain', () => {
        const r = chase();
        bite(r, 10);
        bite(r, 12, false);
        expect(r.observer.chaseTicks[r.hunter]).toBe(0);
        bite(r, 14);
        expect(r.observer.chaseTicks[r.hunter]).toBe(4);
    });

    it('starts a new chain on a different prey', () => {
        const r = chase();
        const other = addBlob(r.world, {});
        bite(r, 10);
        bite(r, 12, true, other);
        expect(r.observer.chaseTicks[r.hunter]).toBe(0);
        bite(r, 15, true, other);
        expect(r.observer.chaseTicks[r.hunter]).toBe(3);
    });

    it('ignores bites by an untracked biter', () => {
        const r = chase();
        r.world.bittenTimer[r.prey] = 1;
        r.world.lastBiter[r.prey] = 999;
        noteChase(r.observer, r.world);
        expect(r.observer.chaseTicks.every((/** @type {number} */ v) => v === 0)).toBe(true);
    });

    it('is still readable at death, and a new agent in the slot starts at 0', () => {
        const r = chase();
        bite(r, 10);
        bite(r, 16);
        nextTick(r.world, 17);
        pushDied(r.world, { slot: r.hunter, genomeId: r.world.genomeId[r.hunter] });
        r.world.alive[r.hunter] = 0;
        r.world.genomeId[r.hunter] = 0;
        observe(r.observer, r.world);
        expect(r.observer.chaseTicks[r.hunter]).toBe(6);
        expect(r.observer.deaths.genomeId[0]).toBe(1);

        nextTick(r.world, 18);
        const reborn = addBorn(r.world);
        expect(reborn).toBe(r.hunter);
        observe(r.observer, r.world);
        expect(r.observer.chaseTicks[reborn]).toBe(0);
        expect(r.observer.chainPrey[reborn]).toBe(0);
        // A bite right after rebirth does not continue the old agent's chain.
        bite(r, 19);
        expect(r.observer.chaseTicks[reborn]).toBe(0);
    });
});

describe('patchesVisited', () => {
    const PATCHES = { foodPatchCount: 3, foodPatchRadius: 100, maturityTicks: 50 };
    const CENTRES = [
        [100, 100],
        [500, 500],
        [900, 900],
    ];

    /**
     * @param {Record<string, any>} [over] config overrides
     * @returns {Record<string, any>} a run with the patches placed and one agent in slot 0
     */
    function patched(over = {}) {
        const r = observed({ ...PATCHES, maxAgents: 8, ...over });
        CENTRES.forEach(([x, y], p) => {
            r.world.patchX[p] = x;
            r.world.patchY[p] = y;
        });
        nextTick(r.world, 0);
        addBorn(r.world);
        observe(r.observer, r.world);
        return r;
    }

    /**
     * @param {Record<string, any>} r the run
     * @param {number} tick the tick to observe
     * @param {number[]} at where slot 0 is
     * @returns {void}
     */
    function visit(r, tick, at) {
        nextTick(r.world, tick);
        [r.world.x[0], r.world.y[0]] = at;
        observe(r.observer, r.world);
    }

    it('counts distinct patches at 100-tick samples, not entries or time inside', () => {
        const r = patched();
        visit(r, 100, [500, 500]);
        visit(r, 200, [500, 500]);
        expect(patchesVisitedOf(r.observer, 0)).toBe(1);
        visit(r, 300, [100, 100]);
        visit(r, 400, [500, 500]);
        expect(patchesVisitedOf(r.observer, 0)).toBe(2);
    });

    it('ignores positions between samples', () => {
        const r = patched();
        visit(r, 50, [900, 900]);
        visit(r, 100, [300, 300]);
        expect(patchesVisitedOf(r.observer, 0)).toBe(0);
    });

    it('counts an agent born inside a patch at its first sample, and the boundary as outside', () => {
        const r = patched();
        // Born at (500, 500) in the patch; strictly inside only.
        visit(r, 100, [600, 500]);
        expect(patchesVisitedOf(r.observer, 0)).toBe(0);
        visit(r, 200, [599.9, 500]);
        expect(patchesVisitedOf(r.observer, 0)).toBe(1);
    });

    it('counts every patch holding the agent when discs overlap', () => {
        const r = patched();
        r.world.patchX[0] = 540;
        r.world.patchY[0] = 500;
        visit(r, 100, [520, 500]);
        expect(patchesVisitedOf(r.observer, 0)).toBe(2);
    });

    it('is readable at death and reset for the next agent in the slot', () => {
        const r = patched();
        visit(r, 100, [500, 500]);
        nextTick(r.world, 150);
        pushDied(r.world, { slot: 0, genomeId: r.world.genomeId[0], ageTicks: 150 });
        r.world.alive[0] = 0;
        r.world.genomeId[0] = 0;
        observe(r.observer, r.world);
        expect(patchesVisitedOf(r.observer, 0)).toBe(1);
        nextTick(r.world, 151);
        expect(addBorn(r.world)).toBe(0);
        observe(r.observer, r.world);
        expect(patchesVisitedOf(r.observer, 0)).toBe(0);
    });

    it('is 0 with no patches', () => {
        const r = patched({ foodPatchCount: 0 });
        visit(r, 100, [500, 500]);
        expect(patchesVisitedOf(r.observer, 0)).toBe(0);
    });
});
