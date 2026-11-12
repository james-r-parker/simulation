import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { HOLD_WINDOW, heldMealDeliberate, trackHold } from '../../js/sim/graze-hold.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';

const NEVER = -Infinity;

/** @returns {{world: any, kind: any}} one slot's outputs and a food view whose tracker verdict the test sets */
function rig() {
    const world = { outputs: new Float32Array(OUTPUT_COUNT) };
    const kind = {
        seen: new Float64Array([NEVER]),
        bits: new Uint16Array(1),
        turn: new Float64Array([NEVER]),
        off: new Float64Array([NEVER]),
        start: new Float64Array([NEVER]),
        hold: new Float64Array([NEVER]),
    };
    return { world, kind };
}

/**
 * Sets the tracker's own verdict for tick `tick`: deliberate (a current sighting, a full closing history, a turn) or not.
 * @param {any} kind the food view
 * @param {number} tick the tick
 * @param {boolean} closing whether the tracker calls a meal now deliberate
 */
function setTracker(kind, tick, closing) {
    kind.seen[0] = tick;
    kind.bits[0] = closing ? 0xffff : 0;
    kind.turn[0] = tick;
}

/**
 * Plays one tick: the bite output, the hold's release, and a meal when there is one.
 * @param {{world: any, kind: any}} r the rig
 * @param {{tick: number, biting: boolean, closing: boolean, meal: boolean}} t the tick
 * @returns {boolean | null} the meal's verdict, or null without a meal
 */
function play({ world, kind }, { tick, biting, closing, meal }) {
    world.outputs[OUTPUT_INDEX.BITE] = biting ? 1 : -1;
    setTracker(kind, tick, closing);
    trackHold(world, 0, kind.hold);
    return meal ? heldMealDeliberate(kind, 0, tick) : null;
}

/**
 * The naive reading of the rule: a meal is deliberate when the tracker says so, or when an earlier deliberate meal is
 * at most HOLD_WINDOW ticks back with `BITE` held on every tick after it, up to and including this one.
 * @param {{biting: boolean, closing: boolean, meal: boolean}[]} ticks the run
 * @returns {(boolean | null)[]} each tick's meal verdict, null without a meal
 */
function naive(ticks) {
    /** @type {(boolean | null)[]} */
    const out = [];
    ticks.forEach((t, i) => {
        if (!t.meal) {
            out.push(null);
            return;
        }
        const last = out.findLastIndex((v) => v === true);
        const heldSince = last >= 0 && ticks.slice(last + 1, i + 1).every((x) => x.biting);
        out.push(t.closing || (heldSince && i - last <= HOLD_WINDOW));
    });
    return out;
}

describe('the graze hold', () => {
    it('keeps meals deliberate while the eater grazes in place after a deliberate approach', () => {
        const r = rig();
        expect(play(r, { tick: 1, biting: true, closing: true, meal: true })).toBe(true);
        expect(play(r, { tick: 5, biting: true, closing: false, meal: true })).toBe(true);
        expect(play(r, { tick: 5 + HOLD_WINDOW, biting: true, closing: false, meal: true })).toBe(true);
    });

    it('does not start without a deliberate meal', () => {
        const r = rig();
        expect(play(r, { tick: 1, biting: true, closing: false, meal: true })).toBe(false);
        expect(r.kind.hold[0]).toBe(NEVER);
    });

    it('ends when the eater lets go of BITE, even for one tick', () => {
        const r = rig();
        play(r, { tick: 1, biting: true, closing: true, meal: true });
        play(r, { tick: 2, biting: false, closing: false, meal: false });
        expect(play(r, { tick: 3, biting: true, closing: false, meal: true })).toBe(false);
    });

    it('ends after HOLD_WINDOW ticks without a meal', () => {
        const r = rig();
        play(r, { tick: 1, biting: true, closing: true, meal: true });
        expect(play(r, { tick: 2 + HOLD_WINDOW, biting: true, closing: false, meal: true })).toBe(false);
    });

    it('agrees with the naive reading on random runs', () => {
        const rng = createRng(7);
        for (let run = 0; run < 200; run++) {
            const ticks = Array.from({ length: 120 }, () => ({
                biting: nextFloat(rng) < 0.9,
                closing: nextFloat(rng) < 0.05,
                meal: nextFloat(rng) < 0.15,
            }));
            const r = rig();
            const got = ticks.map((t, i) => play(r, { tick: i + 1, ...t }));
            expect(got).toEqual(naive(ticks));
        }
    });
});
