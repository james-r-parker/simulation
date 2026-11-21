// The scenes' event pass: births and deaths reset the slot's scene counters, and a death after burn-in reaches the
// scenes that read it.

import { describe, expect, it } from 'vitest';
import { BORN_CAUSE, DEATH_CAUSE } from '../../js/sim/events.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { createObserver } from '../../js/evo/observer.js';
import { noteEvents, resetSceneSlot } from '../../js/evo/observer-scenes-events.js';
import { createRng } from '../../js/sim/rng.js';
import { lifeWorld } from '../sim/helpers/life-world.js';
import { nextTick, observed, pushBorn, pushDied } from './helpers/observer-world.js';

describe('resetSceneSlot', () => {
    it('clears a slot of the style scene on a lean observer and on a full one', () => {
        for (const lean of [true, false]) {
            const world = lifeWorld();
            const observer = createObserver(world.config, createRng(1), { lean });
            observer.scenes.style.chains[2] = 4;
            resetSceneSlot(observer.scenes, 2);
            expect(observer.scenes.style.chains[2], `lean ${lean}`).toBe(0);
        }
    });
});

describe('noteEvents', () => {
    it('resets the slot of a newborn, on a lean observer too', () => {
        for (const lean of [true, false]) {
            const world = lifeWorld();
            const observer = createObserver(world.config, createRng(1), { lean });
            observer.scenes.style.chains[3] = 7;
            nextTick(world, 5);
            pushBorn(world, { slot: 3, genomeId: 11, cause: BORN_CAUSE.FLOOR });
            noteEvents(observer.scenes, observer, world);
            expect(observer.scenes.style.chains[3], `lean ${lean}`).toBe(0);
        }
    });

    it('resets the slot of an agent that died,', () => {
        const { world, observer } = observed();
        observer.scenes.style.chains[1] = 2;
        nextTick(world, BURN_IN_TICKS + 5);
        pushDied(world, { slot: 1, genomeId: 9, cause: DEATH_CAUSE.OLD_AGE, ageTicks: 300 });
        noteEvents(observer.scenes, observer, world);
        expect(observer.scenes.style.chains[1]).toBe(0);
    });

    it('does nothing for a tick with no events', () => {
        const { world, observer } = observed();
        observer.scenes.style.chains[0] = 3;
        nextTick(world, 9);
        noteEvents(observer.scenes, observer, world);
        expect(observer.scenes.style.chains[0]).toBe(3);
    });
});
