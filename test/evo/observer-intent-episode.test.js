import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { RESPONSE_WINDOW } from '../../js/evo/observer-intent-state.js';
import { noteEscape } from '../../js/evo/observer-intent-episode.js';
import { CH, FORAGER, PREDATOR, clearRays, intentArena, setRay, tickIntent } from './helpers/intent-world.js';
import { addBorn } from './helpers/observer-world.js';

/**
 * A forager bitten at `FIRST`, with a threat on its rays from `seenAt` (when given), sprinting at the ticks listed
 * in `sprintAt`; runs to `until`.
 * @param {{seenAt?: number, sprintAt?: number[], until: number, spec?: number}} f the scene
 * @returns {{world: any, intent: any, slot: number}}
 */
function scene(f) {
    const { world, intent } = intentArena();
    const slot = addBorn(world, { spec: f.spec ?? FORAGER });
    for (let tick = 1; tick <= f.until; tick++) {
        clearRays(world, slot);
        const seen = f.seenAt !== undefined && tick >= f.seenAt && tick <= FIRST;
        const sprint = f.sprintAt?.includes(tick);
        if (seen || sprint) {
            setRay(world, slot, 2, 0.6, CH.BIGGER);
        }
        world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.SPRINT] = sprint ? 1 : 0;
        world.bittenTimer[slot] = tick === FIRST ? 1 : 30;
        tickIntent(world, intent, tick);
    }
    return { world, intent, slot };
}

const FIRST = 10;
const DUE = FIRST + RESPONSE_WINDOW;

/**
 * @param {any} intent the intent state
 * @param {number} slot the slot
 * @returns {number[]} undefended, unseen and classified counts
 */
function counts(intent, slot) {
    return [intent.undefendedBite[slot], intent.unseenBite[slot], intent.run.episodesClassified];
}

describe('episode latch', () => {
    it('classifies an unseen bite at episodeFirst + 30, and not before', () => {
        const early = scene({ until: DUE - 1 });
        expect(counts(early.intent, early.slot)).toEqual([0, 0, 0]);
        const done = scene({ until: DUE });
        expect(counts(done.intent, done.slot)).toEqual([0, 1, 1]);
    });

    it('classifies a seen bite with no response as undefended', () => {
        const { intent, slot } = scene({ seenAt: 5, until: DUE });
        expect(counts(intent, slot)).toEqual([1, 0, 1]);
        expect([intent.run.undefendedEpisodes, intent.run.unseenEpisodes]).toEqual([1, 0]);
    });

    it('counts a seen bite with a response as neither, up to episodeFirst + 30', () => {
        const { intent, slot } = scene({ seenAt: 5, sprintAt: [DUE], until: DUE });
        expect(counts(intent, slot)).toEqual([0, 0, 1]);
        expect(intent.responded[slot]).toBe(1);
    });

    it('ignores a response at episodeFirst + 31', () => {
        const { intent, slot } = scene({ seenAt: 5, sprintAt: [DUE + 1], until: DUE + 5 });
        expect(counts(intent, slot)).toEqual([1, 0, 1]);
        expect(intent.responded[slot]).toBe(0);
    });

    it('counts a flight that began before the bite, from the threat sighting', () => {
        const { intent, slot } = scene({ seenAt: 5, sprintAt: [FIRST], until: DUE });
        expect(counts(intent, slot)).toEqual([0, 0, 1]);
    });

    it('sitting inside smoke is a response', () => {
        const { world, intent } = intentArena();
        const slot = addBorn(world, { spec: FORAGER });
        for (let tick = 1; tick <= DUE; tick++) {
            clearRays(world, slot);
            if (tick <= FIRST) {
                setRay(world, slot, 5, 0.6, CH.BIGGER);
            }
            if (tick === 20) {
                setRay(world, slot, 5, 1, CH.SMOKE);
            }
            world.bittenTimer[slot] = tick === FIRST ? 1 : 30;
            tickIntent(world, intent, tick);
        }
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
        const { intent, slot } = scene({ seenAt: 5, sprintAt: [12], until: DUE });
        noteEscape(intent, slot);
        expect([intent.respondedEscape[slot], intent.run.escapedResponded, intent.episodeOpen[slot]]).toEqual([
            1, 1, 0,
        ]);
    });

    it('credits nothing without a response, or when no episode is open', () => {
        const { intent, slot } = scene({ seenAt: 5, until: DUE });
        noteEscape(intent, slot);
        noteEscape(intent, slot);
        expect([intent.respondedEscape[slot], intent.run.escapedResponded, intent.episodeOpen[slot]]).toEqual([
            0, 0, 0,
        ]);
    });
});
