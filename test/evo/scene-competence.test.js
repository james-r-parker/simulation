// The competence detectors (hunter-learning.md T2a): kill conversion binned by the hunter's age at the opening of a chase, and
// the censored time to first kill, against hand-built chase lists and life lists.

import { describe, expect, it } from 'vitest';
import { EVENT_TYPE, createEventRing, pushEvent } from '../../js/sim/events.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import {
    CHASE_OUTCOME,
    competenceMetrics,
    createCompetenceScene,
    noteChase,
    noteCompetenceBirth,
    noteCompetenceRecord,
} from '../../js/evo/scene-competence.js';
import { directionOf, namesOf } from './helpers/metric-registry.js';

const CONFIG = { juvenileTicks: 3000 };
const T = BURN_IN_TICKS + 5000;

/**
 * @param {Array<{id: number, age: number, spec?: number}>} [alive] hunters alive at the last tick
 * @returns {Record<string, any>} a hand-built world at tick `T`; spec 1 hunts
 */
function world(alive = []) {
    const w = {
        tick: T,
        alive: new Uint8Array(8),
        spec: new Uint8Array(8),
        genomeId: new Uint32Array(8),
        ageTicks: new Float64Array(8),
        huntBySpec: new Float64Array([0, 1]),
    };
    alive.forEach(({ id, age, spec = 1 }, slot) => {
        w.alive[slot] = 1;
        w.spec[slot] = spec;
        w.genomeId[slot] = id;
        w.ageTicks[slot] = age;
    });
    return w;
}

/**
 * Starts the observation of a hunter born after burn-in.
 * @param {Record<string, any>} scene the scene
 * @param {number} id the hunter's genome id
 * @param {{tick?: number, spec?: number}} [options] the birth tick and specialisation
 * @returns {void}
 */
function born(scene, id, { tick = BURN_IN_TICKS + 10, spec = 1 } = {}) {
    const w = world([{ id, age: 0, spec }]);
    w.tick = tick;
    noteCompetenceBirth(scene, w, 0);
}

/**
 * @param {Record<string, any>} scene the scene
 * @param {number} type an `EVENT_TYPE`
 * @param {[number, number, number?, number?]} fields genome id, age, and for a kill the kills so far and the dependent bit
 * @returns {void}
 */
function record(scene, type, [id, age, kills = 0, dependent = 0]) {
    const ring = createEventRing(1);
    const o = pushEvent(ring, type, 1);
    ring.data.set([id, age, kills, dependent], o + 2);
    noteCompetenceRecord(scene, ring.data, o);
}

/**
 * @param {Record<string, any>} scene the scene
 * @param {Record<string, any>} w the world
 * @param {number} ageAtResolve the hunter's age when the chase resolves
 * @param {number} ticksSinceOpen the ticks the chase lasted
 * @param {number} outcome the `CHASE_OUTCOME`
 * @returns {void}
 */
function chase(scene, w, ageAtResolve, ticksSinceOpen, outcome) {
    w.ageTicks[0] = ageAtResolve;
    noteChase(scene, w, { slot: 0, outcome, openedTick: w.tick - ticksSinceOpen });
}

describe('kill conversion by age at the opening of a chase', () => {
    it('is null with a reason on a fresh scene, and names the 1k-2k band as the one to raise', () => {
        const m = competenceMetrics(createCompetenceScene(CONFIG), world());
        for (const [name, result] of Object.entries(m)) {
            expect(result.value, name).toBeNull();
            expect(result.reason, name).toBeTypeOf('string');
        }
        expect(Object.keys(m).sort()).toEqual(namesOf('js/evo/scene-competence.js').sort());
        expect(directionOf('eval.hunter_kill_conversion_by_age.1k-2k')).toBe('higher');
        expect(directionOf('eval.hunter_kill_conversion_by_age.under1k')).toBe('watch');
    });

    it('bins by the age at the opening and not at the resolution, against a hand-built list', () => {
        const scene = createCompetenceScene(CONFIG);
        const w = world([{ id: 1, age: 0 }]);
        // [age at resolution, ticks the chase lasted, outcome]: the age at the opening is the difference
        const chases = [
            [900, 100, CHASE_OUTCOME.CAUGHT], // opened at 800: under1k
            [1100, 200, CHASE_OUTCOME.GAVE_UP], // opened at 900: under1k
            [1200, 100, CHASE_OUTCOME.CAUGHT], // opened at 1100: 1k-2k
            [2100, 100, CHASE_OUTCOME.ESCAPED], // opened at 2000: over2k
            [2000, 50, CHASE_OUTCOME.GAVE_UP], // opened at 1950: 1k-2k
            [9000, 10, CHASE_OUTCOME.CAUGHT], // opened at 8990: over2k
            [1999, 0, CHASE_OUTCOME.GAVE_UP], // opened at 1999: 1k-2k
        ];
        for (const [age, lasted, outcome] of chases) {
            chase(scene, w, age, lasted, outcome);
        }
        const m = competenceMetrics(scene, w);
        expect(m['eval.hunter_kill_conversion_by_age.under1k']).toEqual({ value: 1 / 2 });
        expect(m['eval.hunter_kill_conversion_by_age.1k-2k']).toEqual({ value: 1 / 3 });
        expect(m['eval.hunter_kill_conversion_by_age.over2k']).toEqual({ value: 1 / 2 });
        expect(m['eval.hunter_chases_by_age.under1k']).toEqual({ value: 2 });
        expect(m['eval.hunter_chases_by_age.1k-2k']).toEqual({ value: 3 });
        expect(m['eval.hunter_chases_by_age.over2k']).toEqual({ value: 2 });
    });

    it('is null for a band no chase opened in, while the others stand', () => {
        const scene = createCompetenceScene(CONFIG);
        const w = world([{ id: 1, age: 0 }]);
        chase(scene, w, 500, 10, CHASE_OUTCOME.CAUGHT);
        const m = competenceMetrics(scene, w);
        expect(m['eval.hunter_kill_conversion_by_age.under1k']).toEqual({ value: 1 });
        expect(m['eval.hunter_kill_conversion_by_age.1k-2k']).toEqual({
            value: null,
            reason: 'no chase opened in the band',
        });
    });
});

describe('kill conversion over chases opened hungry', () => {
    /**
     * @param {Record<string, any>} scene the scene
     * @param {Record<string, any>} w the world
     * @param {[number, boolean, number]} c age at the resolution, whether it could eat at the opening, the outcome
     * @returns {void}
     */
    function hungryChase(scene, w, [age, hungry, outcome]) {
        w.ageTicks[0] = age;
        noteChase(scene, w, { slot: 0, outcome, openedTick: w.tick - 100, hungry });
    }

    it('is registered as watch and counts only hungry chases opened at 1000 to 1999', () => {
        expect(directionOf('eval.hunter_kill_conversion_hungry.1k-2k')).toBe('watch');
        const scene = createCompetenceScene(CONFIG);
        const w = world([{ id: 1, age: 0 }]);
        hungryChase(scene, w, [1200, true, CHASE_OUTCOME.CAUGHT]); // opened 1100, hungry
        hungryChase(scene, w, [1300, true, CHASE_OUTCOME.GAVE_UP]); // hungry
        hungryChase(scene, w, [1400, false, CHASE_OUTCOME.GAVE_UP]); // opened sated: excluded
        hungryChase(scene, w, [1500, false, CHASE_OUTCOME.GAVE_UP]); // sated: excluded
        hungryChase(scene, w, [1050, true, CHASE_OUTCOME.CAUGHT]); // opened at 950: under1k, excluded
        hungryChase(scene, w, [2100, true, CHASE_OUTCOME.CAUGHT]); // opened at 2000: over2k, excluded
        const m = competenceMetrics(scene, w);
        expect(m['eval.hunter_kill_conversion_hungry.1k-2k']).toEqual({ value: 1 / 2 });
        expect(m['eval.hunter_kill_conversion_by_age.1k-2k']).toEqual({ value: 1 / 4 });
    });

    it('is null when every chase in the band opened sated', () => {
        const scene = createCompetenceScene(CONFIG);
        const w = world([{ id: 1, age: 0 }]);
        hungryChase(scene, w, [1200, false, CHASE_OUTCOME.CAUGHT]);
        expect(competenceMetrics(scene, w)['eval.hunter_kill_conversion_hungry.1k-2k'].value).toBeNull();
    });
});

describe('the censored time to first kill', () => {
    it('reads the Kaplan-Meier median and restricted mean over killers, a hunter that died without a kill and a live one', () => {
        const scene = createCompetenceScene(CONFIG);
        for (const id of [1, 2, 3, 4, 5]) {
            born(scene, id);
        }
        born(scene, 6, { tick: BURN_IN_TICKS - 1 });
        born(scene, 7, { spec: 0 });
        record(scene, EVENT_TYPE.HUNTER_KILL, [1, 300, 1]);
        record(scene, EVENT_TYPE.HUNTER_KILL, [2, 900, 1]);
        record(scene, EVENT_TYPE.HUNTER_KILL, [2, 1500, 2]);
        record(scene, EVENT_TYPE.HUNTER_KILL, [5, 700, 1]);
        record(scene, EVENT_TYPE.HUNTER_KILL, [6, 100, 1]);
        record(scene, EVENT_TYPE.HUNTER_LEDGER, [3, 400]);
        record(scene, EVENT_TYPE.HUNTER_LEDGER, [1, 2000]);
        const m = competenceMetrics(
            scene,
            world([
                { id: 4, age: 2500 },
                { id: 5, age: 3200 },
            ]),
        );
        // observations: 300 event, 400 censored, 700 event, 900 event, 2500 censored
        expect(m['eval.hunter_first_kill_km_median']).toEqual({ value: 900 });
        expect(m['eval.hunter_first_kill_rmst'].value).toBeCloseTo(
            300 + 0.8 * 400 + ((0.8 * 2) / 3) * 200 + (0.8 / 3) * 5100,
            9,
        );
    });

    it('counts a hunter that never killed in the curve: all censored gives no median and the area is the horizon', () => {
        const scene = createCompetenceScene(CONFIG);
        born(scene, 1);
        born(scene, 2);
        record(scene, EVENT_TYPE.HUNTER_LEDGER, [1, 800]);
        const m = competenceMetrics(scene, world([{ id: 2, age: 1200 }]));
        expect(m['eval.hunter_first_kill_km_median']).toEqual({ value: null, reason: 'median not reached' });
        expect(m['eval.hunter_first_kill_rmst']).toEqual({ value: 6000 });
    });

    it('keeps a killer that is still alive as an event, and a death after the kill as no second observation', () => {
        const scene = createCompetenceScene(CONFIG);
        born(scene, 1);
        record(scene, EVENT_TYPE.HUNTER_KILL, [1, 500, 1]);
        record(scene, EVENT_TYPE.HUNTER_LEDGER, [1, 4000]);
        const m = competenceMetrics(scene, world());
        expect(m['eval.hunter_first_kill_km_median']).toEqual({ value: 500 });
        expect(m['eval.hunter_first_kill_rmst']).toEqual({ value: 500 });
    });

    it('is null with a reason when no hunter was born after burn-in', () => {
        const scene = createCompetenceScene(CONFIG);
        born(scene, 1, { tick: 0 });
        const m = competenceMetrics(scene, world([{ id: 1, age: 700 }]));
        expect(m['eval.hunter_first_kill_rmst']).toEqual({ value: null, reason: 'no hunter born after burn-in' });
        expect(m['eval.hunter_first_kill_km_median'].reason).toBe('no hunter born after burn-in');
    });
});

describe('the independent kill share', () => {
    it('is the share of HunterKill records whose dependent bit is clear, null without a kill', () => {
        const scene = createCompetenceScene(CONFIG);
        expect(competenceMetrics(scene, world())['eval.hunter_independent_kill_share']).toEqual({
            value: null,
            reason: 'no deliberate kill',
        });
        record(scene, EVENT_TYPE.HUNTER_KILL, [1, 300, 1, 0]);
        record(scene, EVENT_TYPE.HUNTER_KILL, [1, 600, 2, 1]);
        record(scene, EVENT_TYPE.HUNTER_KILL, [2, 900, 1, 1]);
        record(scene, EVENT_TYPE.HUNTER_KILL, [3, 900, 1, 0]);
        record(scene, EVENT_TYPE.HUNTER_KILL, [3, 950, 2]);
        expect(competenceMetrics(scene, world())['eval.hunter_independent_kill_share']).toEqual({ value: 0.6 });
    });

    it('has the direction higher', () => {
        expect(directionOf('eval.hunter_independent_kill_share')).toBe('higher');
    });
});

describe('conversion gain within a lifetime', () => {
    const CAUGHT = CHASE_OUTCOME.CAUGHT;
    const MISSED = CHASE_OUTCOME.ESCAPED;
    const REASON = 'no hunter lived to both bands';

    /**
     * Resolves chases for one hunter, each resolved at once.
     * @param {Record<string, any>} scene the scene
     * @param {number} id the hunter's genome id
     * @param {Array<[number, number]>} chases the age at the opening and the outcome
     * @returns {void}
     */
    function chasesOf(scene, id, chases) {
        const w = world([{ id, age: 0 }]);
        for (const [age, outcome] of chases) {
            chase(scene, w, age, 0, outcome);
        }
    }

    it('is null with the reason when no hunter has two chases in each band', () => {
        const scene = createCompetenceScene(CONFIG);
        chasesOf(scene, 1, [
            [1100, CAUGHT],
            [1200, CAUGHT],
            [3100, CAUGHT],
        ]);
        chasesOf(scene, 2, [
            [3100, CAUGHT],
            [3200, CAUGHT],
        ]);
        const m = competenceMetrics(scene, world());
        expect(m['eval.hunter_conversion_gain']).toEqual({ value: null, reason: REASON });
        expect(m['eval.hunter_conversion_gain_hunters']).toEqual({ value: null, reason: REASON });
    });

    it('is the mean over qualifying hunters of late minus early conversion, band edges included', () => {
        const scene = createCompetenceScene(CONFIG);
        chasesOf(scene, 1, [
            [1000, MISSED],
            [1999, MISSED],
            [3000, CAUGHT],
            [3999, MISSED],
            [2500, CAUGHT],
            [4000, CAUGHT],
        ]); // early 0 of 2, late 1 of 2: gain +0.5
        chasesOf(scene, 2, [
            [1500, CAUGHT],
            [1600, CAUGHT],
            [3500, MISSED],
            [3600, MISSED],
        ]); // early 2 of 2, late 0 of 2: gain -1
        const m = competenceMetrics(scene, world());
        expect(m['eval.hunter_conversion_gain']).toEqual({ value: -0.25 });
        expect(m['eval.hunter_conversion_gain_hunters']).toEqual({ value: 2 });
    });

    it('has the directions higher and watch', () => {
        expect(directionOf('eval.hunter_conversion_gain')).toBe('higher');
        expect(directionOf('eval.hunter_conversion_gain_hunters')).toBe('watch');
    });
});
