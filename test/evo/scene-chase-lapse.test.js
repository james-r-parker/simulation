// Lapse split and chase length: hunters with a hand-set prey view (the sighting tick, the closing bits and the ray
// proximity) run through the real `trackApproaches`, so the flags come from the approach scene's own resolution.

import { describe, expect, it } from 'vitest';
import { CHASE_FLAG, CHASE_OUTCOME, chasesFlagged } from '../../js/evo/chase-outcome.js';
import { computeMetrics } from '../../js/evo/metrics.js';
import { INTENT_WINDOW } from '../../js/evo/observer-intent-state.js';
import { trackApproaches } from '../../js/evo/scene-approach.js';
import { CHASE_TICKS_CAP, RANGE_GROWS, createLapseScene, lapseMetrics } from '../../js/evo/scene-chase-lapse.js';
import { createChaseTally, tallyChase } from '../../js/evo/chase-outcome.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';
import { loose } from './helpers/metric-registry.js';

const T0 = 10000;
const CLOSING = 0x3ff;
const LAPSE_AT = T0 + INTENT_WINDOW + 1;

/**
 * @param {number} hunters how many predators
 * @returns {any} the world, the observer and the hunters' slots
 */
function arena(hunters) {
    const r = observed({});
    const { predator } = r.world.config.specialisations;
    const slots = [];
    for (let i = 0; i < hunters; i++) {
        const slot = addBlob(r.world, { spec: predator.index });
        r.observer.slotOf.set(r.world.genomeId[slot], slot);
        slots.push(slot);
    }
    return { ...r, hunters: slots };
}

/**
 * Plays one tick: the hunters in `closing` close on prey at proximity `prox`; the hunters in `watching` see prey at
 * `prox` without closing; the rest see none.
 * @param {any} a the arena
 * @param {number} tick the tick
 * @param {{closing?: number[], watching?: number[], prox?: number}} [moves] who sees what
 * @returns {void}
 */
function play(a, tick, { closing = [], watching = [], prox = 0.5 } = {}) {
    a.world.tick = tick;
    const { prey } = a.observer.intent;
    for (const h of a.hunters) {
        const sees = closing.includes(h) || watching.includes(h);
        prey.seen[h] = sees ? tick : -Infinity;
        prey.prox[h] = sees ? prox : -1;
        prey.bits[h] = closing.includes(h) ? CLOSING : 0;
    }
    trackApproaches(a.observer.scenes.approach, a.observer, a.world);
}

const read = (/** @type {any} */ a, /** @type {string} */ name) =>
    loose(computeMetrics(a.observer, a.world))[`eval.${name}`];

describe('lapse split', () => {
    it('calls a lapse with the prey off the rays lost, on the rays and nearer quit, and on the rays and further outrun', () => {
        const a = arena(3);
        const [quit, lost, outrun] = a.hunters;
        play(a, T0, { closing: a.hunters, prox: 0.5 });
        for (let t = T0 + 1; t < LAPSE_AT; t++) {
            play(a, t, { watching: [quit, outrun], prox: 0.5 });
        }
        a.observer.intent.prey.prox[quit] = 0.5;
        a.observer.intent.prey.prox[outrun] = 0.5 - RANGE_GROWS - 0.1;
        a.world.tick = LAPSE_AT;
        a.observer.intent.prey.seen[quit] = LAPSE_AT;
        a.observer.intent.prey.seen[outrun] = LAPSE_AT;
        a.observer.intent.prey.seen[lost] = -Infinity;
        trackApproaches(a.observer.scenes.approach, a.observer, a.world);
        const { tally } = a.observer.scenes.approach;
        expect(tally.byClass[CHASE_OUTCOME.GAVE_UP]).toBe(3);
        expect(chasesFlagged(tally, CHASE_FLAG.LAPSE_LOST)).toBe(1);
        expect(chasesFlagged(tally, CHASE_FLAG.LAPSE_OUTRUN)).toBe(1);
        expect(read(a, 'chase_quit_share').value).toBeCloseTo(1 / 3, 12);
        expect(read(a, 'chase_lost_share').value).toBeCloseTo(1 / 3, 12);
        expect(read(a, 'chase_outrun_share').value).toBeCloseTo(1 / 3, 12);
        expect(read(a, 'chase_shaken_share').value).toBeCloseTo(2 / 3, 12);
    });

    it('sums the three lapse shares to the give-up share', () => {
        const a = arena(2);
        play(a, T0, { closing: a.hunters });
        play(a, LAPSE_AT);
        const m = computeMetrics(a.observer, a.world);
        const sum = ['quit', 'lost', 'outrun'].reduce((s, n) => s + loose(m)[`eval.chase_${n}_share`].value, 0);
        expect(sum).toBeCloseTo(loose(m)['eval.chase_giveup_share'].value, 12);
        expect(loose(m)['eval.chase_lost_share'].value).toBe(1);
    });

    it('counts a chase that is not a lapse in the shaken share only when it escaped', () => {
        const tally = createChaseTally();
        tallyChase(tally, { outcome: CHASE_OUTCOME.CAUGHT });
        tallyChase(tally, { outcome: CHASE_OUTCOME.ESCAPED });
        tallyChase(tally, { outcome: CHASE_OUTCOME.GAVE_UP, flags: CHASE_FLAG.LAPSE_OUTRUN });
        tallyChase(tally, { outcome: CHASE_OUTCOME.GAVE_UP });
        const m = lapseMetrics(createLapseScene({ maxAgents: 1 }), tally);
        expect(m['eval.chase_shaken_share']).toEqual({ value: 0.5 });
        expect(m['eval.chase_quit_share']).toEqual({ value: 0.25 });
    });

    it('is null before any chase resolves', () => {
        const m = lapseMetrics(createLapseScene({ maxAgents: 1 }), createChaseTally());
        for (const [name, result] of Object.entries(m)) {
            expect(result.value, name).toBeNull();
        }
    });
});

describe('chase length', () => {
    it('reads the nearest-rank median and 90th percentile of the opening-to-resolution ticks', () => {
        const a = arena(1);
        const [h] = a.hunters;
        const lengths = [];
        // Ten lapses; the i-th chase opens i ticks before its closing stops, so it lasts INTENT_WINDOW + 1 + i ticks.
        let t = T0;
        for (let i = 0; i < 10; i++) {
            play(a, t, { closing: [h] });
            play(a, t + i, { closing: i > 0 ? [h] : [] });
            const end = t + i + INTENT_WINDOW + 1;
            play(a, end);
            lengths.push(end - t);
            t = end + 5;
        }
        const sorted = [...lengths].sort((x, y) => x - y);
        expect(read(a, 'chase_ticks_p50').value).toBe(sorted[4]);
        expect(read(a, 'chase_ticks_p90').value).toBe(sorted[8]);
    });

    it('puts a chase longer than the cap in the last bin', () => {
        const scene = createLapseScene({ maxAgents: 1 });
        scene.lengths[CHASE_TICKS_CAP] += 1;
        scene.counted = 1;
        const m = lapseMetrics(scene, createChaseTally());
        expect(m['eval.chase_ticks_p90']).toEqual({ value: CHASE_TICKS_CAP });
    });
});
