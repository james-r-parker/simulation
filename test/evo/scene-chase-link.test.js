// The wiring of the chase detectors: the approach detector's hooks reach the detectors that read a resolved chase and a
// bite, and the stillness detector reads the approach's opening ticks.

import { describe, expect, it } from 'vitest';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

const T0 = 10000;

describe('linkChaseScenes', () => {
    it('hands a resolved chase to the competence, matched, kinematics, budget and stillness detectors', () => {
        const r = observed();
        const s = r.observer.scenes;
        const slot = addBlob(r.world, { spec: r.world.config.specialisations.predator.index });
        r.world.ageTicks[slot] = 1500;
        r.world.tick = T0 + 200;
        const chase = { slot, outcome: 0, openedTick: T0, energy: 0, flags: 0 };
        s.approach.onChase(r.world, chase);
        expect(s.competence.chases[1]).toBe(1);
        expect(s.matched.rows).toBe(1);
        expect(s.budget.chases).toBe(1);
        expect(s.stillness.caughtApproaches).toBe(1);
    });

    it('hands a bite to the pack-lift detector and shares the opening ticks with the stillness detector', () => {
        const r = observed();
        const s = r.observer.scenes;
        const slot = addBlob(r.world, { spec: r.world.config.specialisations.predator.index });
        r.world.tick = T0;
        s.approach.onBite(r.world, slot);
        expect(s.packLift.bites).toBe(1);
        expect(s.stillness.approachOpenedTick).toBe(s.approach.openedTick);
    });
});
