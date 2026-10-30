// Who is chosen: a female with four ready males of known rank and two ready hunters in view. The percentile itself is
// tested beside the sim's mate rank (test/sim/mate-rank.test.js), which the detector shares.

import { describe, expect, it } from 'vitest';
import { SEX } from '../../js/sim/sex.js';
import { computeMetrics } from '../../js/evo/metrics.js';
import { trackMatings } from '../../js/evo/scene-mate.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

const T0 = 10000;

const read = (/** @type {any} */ r, /** @type {string} */ name) => computeMetrics(r.observer, r.world)[`eval.${name}`];

/** A world with a female of spec 0, four males of spec 0 with deliberate meals 0, 3, 6 and 9 of 10, and two hunters. */
function herd() {
    const r = observed({ maxAgents: 16 });
    const { predator } = r.world.config.specialisations;
    const mother = addBlob(r.world, { sex: SEX.FEMALE });
    const males = [0, 3, 6, 9].map((k) => addBlob(r.world, { sex: SEX.MALE, mealsTotal: 10, mealsDeliberate: k }));
    const hunters = [0, 1].map(() => addBlob(r.world, { sex: SEX.MALE, spec: predator.index }));
    return { ...r, mother, males, hunters };
}

/** Makes the mother pregnant by the male `father`, and runs the tick's mating pass. */
function mate(/** @type {any} */ h, /** @type {number} */ father, /** @type {number} */ tick) {
    h.world.fatherId[h.mother] = h.world.genomeId[father];
    h.observer.slotOf.set(h.world.genomeId[father], father);
    h.world.pregnancy[h.mother] = 10;
    h.world.tick = tick;
    trackMatings(h.observer.scenes.mate, h.observer, h.world);
}

describe('eval.mate_skill_gap and eval.mate_hunter_lean', () => {
    it('are the chosen male percentile over the candidates mean, and the hunter share against the ready adults', () => {
        const h = herd();
        mate(h, h.males[3], T0);
        // The mother scores 0 and the four males 1/12, 4/12, 7/12 and 10/12: percentiles 0.25, 0.5, 0.75 and 1 of five.
        expect(read(h, 'mate_skill_gap').value).toBeCloseTo(1 - (0.25 + 0.5 + 0.75 + 1) / 4, 12);
        // One grazer mating; of six ready adults two hunt.
        expect(read(h, 'mate_hunter_lean').value).toBeCloseTo(0 - 2 / 6, 12);
    });

    it('count a mating once, when the mother turns pregnant, and not before burn-in', () => {
        const h = herd();
        mate(h, h.males[3], T0 - 1);
        expect(h.observer.scenes.mate.matings).toBe(0);
        h.world.pregnancy[h.mother] = 0;
        trackMatings(h.observer.scenes.mate, h.observer, h.world);
        mate(h, h.males[3], T0);
        h.world.tick = T0 + 1;
        trackMatings(h.observer.scenes.mate, h.observer, h.world);
        expect(h.observer.scenes.mate.matings).toBe(1);
    });

    it('count the hunter lean without a gap when the father is gone, and are null before any mating', () => {
        const h = herd();
        expect(read(h, 'mate_skill_gap').value).toBeNull();
        expect(read(h, 'mate_hunter_lean').value).toBeNull();
        h.world.fatherId[h.mother] = 4242;
        h.world.pregnancy[h.mother] = 10;
        h.world.tick = T0;
        trackMatings(h.observer.scenes.mate, h.observer, h.world);
        expect(read(h, 'mate_skill_gap').value).toBeNull();
        expect(read(h, 'mate_hunter_lean').value).not.toBeNull();
    });
});
