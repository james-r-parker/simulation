// The detectors' event pass: births and deaths reset the slot's counters (the lean observer's style detector too),
// and a death after burn-in reaches the detectors that read it.

import { describe, expect, it } from 'vitest';
import { BORN_CAUSE, DEATH_CAUSE } from '../../js/sim/events.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { createObserver } from '../../js/evo/observer.js';
import { dispatchEvents } from '../../js/evo/observer-detectors.js';
import { createRng } from '../../js/sim/rng.js';
import { lifeWorld } from '../sim/helpers/life-world.js';
import { nextTick, observed, pushBorn, pushDied } from './helpers/observer-world.js';

describe('dispatchEvents', () => {
    it('resets the slot of a newborn, on a lean observer too', () => {
        for (const lean of [true, false]) {
            const world = lifeWorld();
            const observer = createObserver(world.config, createRng(1), { lean });
            observer.scenes.style.chains[3] = 7;
            nextTick(world, 5);
            pushBorn(world, { slot: 3, genomeId: 11, cause: BORN_CAUSE.FLOOR });
            dispatchEvents(observer.plan, observer, world);
            expect(observer.scenes.style.chains[3], `lean ${lean}`).toBe(0);
        }
    });

    it('resets the slot of an agent that died,', () => {
        const { world, observer } = observed();
        observer.scenes.style.chains[1] = 2;
        nextTick(world, BURN_IN_TICKS + 5);
        pushDied(world, { slot: 1, genomeId: 9, cause: DEATH_CAUSE.OLD_AGE, ageTicks: 300 });
        dispatchEvents(observer.plan, observer, world);
        expect(observer.scenes.style.chains[1]).toBe(0);
    });

    it('does nothing for a tick with no events', () => {
        const { world, observer } = observed();
        observer.scenes.style.chains[0] = 3;
        nextTick(world, 9);
        dispatchEvents(observer.plan, observer, world);
        expect(observer.scenes.style.chains[0]).toBe(3);
    });
});
