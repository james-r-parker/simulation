import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { CALM_MIN_TICKS, RESPONSE_WINDOW } from '../../js/evo/observer-intent-state.js';
import { noteEscape } from '../../js/evo/observer-intent-episode.js';
import {
    CH,
    FORAGER,
    PREDATOR,
    clearRays,
    intentArena,
    seeThreat,
    setRay,
    tickIntent,
} from './helpers/intent-world.js';
import { addBorn } from './helpers/observer-world.js';

const FIRST = 50;
const DUE = FIRST + RESPONSE_WINDOW;

/**
 * A forager bitten at `FIRST`. A threat is on its rays on `seenFrom..FIRST` when `seenFrom` is given. `sprint(tick)`
 * says whether it sprints that tick, `smoke(tick)` whether it sits inside smoke. Runs to `until`.
 * @param {{seenFrom?: number, sprint?: (tick: number) => boolean, smoke?: (tick: number) => boolean, until: number,
 *   spec?: number}} f the scene
 * @returns {{world: any, intent: any, slot: number}}
 */
function scene(f) {
    const { world, intent } = intentArena();
    const slot = addBorn(world, { spec: f.spec ?? FORAGER });
    for (let tick = 1; tick <= f.until; tick++) {
        clearRays(world, slot);
        if (f.seenFrom !== undefined && tick >= f.seenFrom && tick <= FIRST) {
            seeThreat(world, slot, 2);
        }
        if (f.smoke?.(tick)) {
            setRay(world, slot, 9, 1, CH.SMOKE);
        }
        world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.SPRINT] = f.sprint?.(tick) ? 1 : 0;
        world.bittenTimer[slot] = tick === FIRST ? 1 : 30;
        tickIntent(world, intent, tick);
    }
    return { world, intent, slot };
}

/**
 * @param {any} intent the intent state
 * @param {number} slot the slot
 * @returns {number[]} undefended, unseen and classified counts
 */
function counts(intent, slot) {
    return [intent.undefendedBite[slot], intent.unseenBite[slot], intent.run.episodesClassified];
}

const FROM = CALM_MIN_TICKS + 11;

describe('episode latch', () => {
    it('classifies an unseen bite at episodeFirst + 30, and not before', () => {
        const early = scene({ until: DUE - 1 });
        expect(counts(early.intent, early.slot)).toEqual([0, 0, 0]);
        const done = scene({ until: DUE });
        expect(counts(done.intent, done.slot)).toEqual([0, 1, 1]);
    });

    it('classifies a seen bite with no response as undefended', () => {
        const { intent, slot } = scene({ seenFrom: FROM, until: DUE });
        expect(counts(intent, slot)).toEqual([1, 0, 1]);
        expect([intent.run.undefendedEpisodes, intent.run.unseenEpisodes]).toEqual([1, 0]);
    });

    it('counts a threat-only sprinter as responded: its rate beats its unthreatened rate by the lift', () => {
        const { intent, slot } = scene({ seenFrom: FROM, sprint: (t) => t >= FROM, until: DUE });
        expect(counts(intent, slot)).toEqual([0, 0, 1]);
        expect(intent.responded[slot]).toBe(1);
    });

    it('gives no credit to an agent that sprints half the ticks whatever is in sight', () => {
        const { intent, slot } = scene({ seenFrom: FROM, sprint: (t) => t % 2 === 0, until: DUE });
        expect(counts(intent, slot)).toEqual([1, 0, 1]);
    });

    it('takes the unthreatened rate as 0 under 30 unthreatened ticks', () => {
        const { intent, slot } = scene({ seenFrom: 10, sprint: (t) => t % 2 === 0, until: DUE });
        expect(intent.calmTicks[slot]).toBeLessThan(CALM_MIN_TICKS);
        expect(counts(intent, slot)).toEqual([0, 0, 1]);
    });

    it('ignores a response that starts after the classification tick', () => {
        const { intent, slot } = scene({ seenFrom: FROM, sprint: (t) => t > DUE, until: DUE + 20 });
        expect(counts(intent, slot)).toEqual([1, 0, 1]);
        expect(intent.responded[slot]).toBe(0);
    });

    it('sitting inside smoke is a response', () => {
        const { intent, slot } = scene({ seenFrom: FROM, smoke: (t) => t >= FROM, until: DUE });
        expect(counts(intent, slot)).toEqual([0, 0, 1]);
    });

    it('does not run for agents that can hunt', () => {
        const { intent, slot } = scene({ spec: PREDATOR, until: DUE });
        expect(intent.episodeOpen[slot]).toBe(0);
        expect(intent.run.episodesClassified).toBe(0);
    });
});

describe('noteEscape', () => {
    it('credits respondedEscape after a response and closes the episode', () => {
        const { world, intent, slot } = scene({ seenFrom: FROM, sprint: (t) => t >= FROM, until: DUE });
        noteEscape(intent, slot, world);
        expect([intent.respondedEscape[slot], intent.run.escapedResponded, intent.episodeOpen[slot]]).toEqual([
            1, 1, 0,
        ]);
    });

    it('credits nothing without a response, or when no episode is open', () => {
        const { world, intent, slot } = scene({ seenFrom: FROM, until: DUE });
        noteEscape(intent, slot, world);
        noteEscape(intent, slot, world);
        expect([intent.respondedEscape[slot], intent.run.escapedResponded, intent.episodeOpen[slot]]).toEqual([
            0, 0, 0,
        ]);
    });
});
