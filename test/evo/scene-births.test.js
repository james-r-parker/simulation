// Birth sources: births by cause with rescue and invasion taken out of the immigrants, from known counts and events.

import { describe, expect, it } from 'vitest';
import { BORN_CAUSE, EVENT_TYPE, clearEvents, pushEvent } from '../../js/sim/events.js';
import { computeMetrics } from '../../js/evo/metrics.js';
import { BIRTH_SOURCES, noteBirthSource } from '../../js/evo/scene-births.js';
import { observed } from './helpers/observer-world.js';

const T0 = 10000;

const read = (/** @type {any} */ r, /** @type {string} */ name) =>
    computeMetrics(r.observer, r.world)[`eval.birth_source_share.${name}`];

/** Pushes a rescue or invasion event and feeds it to the scene. */
function event(
    /** @type {any} */ r,
    /** @type {number} */ type,
    /** @type {number} */ tick,
    /** @type {number} */ count,
) {
    clearEvents(r.world.events);
    const o = pushEvent(r.world.events, type, tick);
    r.world.events.data[o + 2] = count;
    noteBirthSource(r.observer.scenes.births, r.world.events.data, 0);
}

describe('eval.birth_source_share.*', () => {
    it('are the shares of births after burn-in by cause, with rescue and invasion out of the immigrants', () => {
        const r = observed();
        const after = r.observer.birthsAfterBurnIn;
        after[BORN_CAUSE.SPLIT] = 10;
        after[BORN_CAUSE.MATE] = 20;
        after[BORN_CAUSE.FLOOR] = 5;
        after[BORN_CAUSE.IMMIGRANT] = 15;
        for (let i = 0; i < 3; i++) {
            event(r, EVENT_TYPE.PREDATOR_RESCUE, T0 + i, 1);
        }
        event(r, EVENT_TYPE.INVASION_ARRIVED, T0 + 5, 4);
        event(r, EVENT_TYPE.INVASION_ARRIVED, T0 - 1, 9);
        const expected = { split: 0.2, mate: 0.4, floor: 0.1, immigrant: 0.16, rescue: 0.06, invasion: 0.08 };
        for (const name of BIRTH_SOURCES) {
            expect(read(r, name).value, name).toBeCloseTo(expected[/** @type {keyof typeof expected} */ (name)], 12);
        }
    });

    it('sum to 1 over the six sources', () => {
        const r = observed();
        r.observer.birthsAfterBurnIn[BORN_CAUSE.MATE] = 3;
        r.observer.birthsAfterBurnIn[BORN_CAUSE.IMMIGRANT] = 2;
        event(r, EVENT_TYPE.PREDATOR_RESCUE, T0, 1);
        const sum = BIRTH_SOURCES.reduce((total, name) => total + (read(r, name).value ?? 0), 0);
        expect(sum).toBeCloseTo(1, 12);
    });

    it('are null with a reason before any birth after burn-in', () => {
        const r = observed();
        for (const name of BIRTH_SOURCES) {
            expect(read(r, name)).toEqual({ value: null, reason: 'no birth after burn-in' });
        }
    });
});
