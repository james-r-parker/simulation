// The hunter age and source detectors (hunter-learning.md T2) against hand-built `HunterKill` and `HunterLedger` records and
// alive sets, with the band ticks checked against a naive tick-by-tick reference.

import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE, EVENT_TYPE, createEventRing, pushEvent } from '../../js/sim/events.js';
import { BIRTH_SOURCE } from '../../js/sim/hunter-ledger.js';
import {
    AGE_BAND_NAMES,
    HUNTER_BIRTH_NAMES,
    ageMetrics,
    createAgeScene,
    noteAgeDeath,
    noteAgeKill,
} from '../../js/evo/scene-hunter-age.js';
import { directionOf, loose, namesOf } from './helpers/metric-registry.js';

const J = 1000;

/**
 * @param {number} age the age at the kill
 * @param {number} count the killer's kills so far
 * @returns {Float64Array} a ring holding one `HunterKill` record at offset 0
 */
function killRecord(age, count) {
    const ring = createEventRing(1);
    const o = pushEvent(ring, EVENT_TYPE.HUNTER_KILL, 1);
    ring.data[o + 2] = 7;
    ring.data[o + 3] = age;
    ring.data[o + 4] = count;
    return ring.data;
}

/**
 * @param {{age: number, kills: number, source?: number}} life a dying hunter
 * @returns {Float64Array} a ring holding one `HunterLedger` record at offset 0
 */
function deathRecord({ age, kills, source = BIRTH_SOURCE.INITIAL }) {
    const ring = createEventRing(1);
    const o = pushEvent(ring, EVENT_TYPE.HUNTER_LEDGER, 1);
    ring.data[o + 3] = age;
    ring.data[o + 4] = (kills * 8 + DEATH_CAUSE.STARVED) * 8 + source;
    return ring.data;
}

/**
 * @param {Array<{age: number, kills: number, source: number}>} alive hunters alive at the last tick
 * @returns {Record<string, any>} a hand-built world at the last tick; spec 1 hunts
 */
function worldWith(alive) {
    const n = Math.max(alive.length, 1);
    const w = {
        alive: new Uint8Array(n),
        spec: new Uint8Array(n),
        huntBySpec: new Float64Array([0, 1]),
        ageTicks: new Float64Array(n),
        ledgerKills: new Float64Array(n),
        birthSource: new Uint8Array(n),
    };
    alive.forEach((life, slot) => {
        w.alive[slot] = 1;
        w.spec[slot] = 1;
        w.ageTicks[slot] = life.age;
        w.ledgerKills[slot] = life.kills;
        w.birthSource[slot] = life.source;
    });
    return w;
}

/**
 * The naive reference: walks every tick of every life and counts it in the band it falls in.
 * @param {number[]} ages the lives' ages
 * @returns {number[]} the ticks in the juvenile, young and adult bands
 */
function naiveBandTicks(ages) {
    const ticks = [0, 0, 0];
    for (const age of ages) {
        for (let t = 0; t < age; t++) {
            ticks[t < J ? 0 : t < 4 * J ? 1 : 2] += 1;
        }
    }
    return ticks;
}

describe('the hunter age metrics', () => {
    it('are null with a reason on a fresh scene', () => {
        const m = ageMetrics(createAgeScene(J), worldWith([]));
        expect(Object.keys(m).sort()).toEqual(namesOf('js/evo/scene-hunter-age.js').sort());
        for (const [name, result] of Object.entries(m)) {
            expect(result.value, name).toBeNull();
            expect(result.reason, name).toBeTypeOf('string');
        }
    });

    it('takes the median age of first kills and ignores later kills', () => {
        const scene = createAgeScene(J);
        for (const [age, count] of [
            [100, 1],
            [900, 2],
            [300, 1],
            [5000, 3],
            [800, 1],
        ]) {
            noteAgeKill(scene, killRecord(age, count), 0);
        }
        expect(ageMetrics(scene, worldWith([]))['eval.hunter_first_kill_age']).toEqual({ value: 300 });
    });

    it('rates kills per 1,000 life ticks in each band, dead and alive lives counted, against the naive band ticks', () => {
        const scene = createAgeScene(J);
        const deaths = [500, 5000, 12000];
        const alive = [14000, 800];
        for (const age of deaths) {
            noteAgeDeath(scene, deathRecord({ age, kills: 0 }), 0);
        }
        for (const age of [500, 3500, 3600, 12500]) {
            noteAgeKill(scene, killRecord(age, 2), 0);
        }
        const m = ageMetrics(scene, worldWith(alive.map((age) => ({ age, kills: 0, source: BIRTH_SOURCE.INITIAL }))));
        const ticks = naiveBandTicks([...deaths, ...alive]);
        const kills = [1, 2, 1];
        AGE_BAND_NAMES.forEach((name, i) => {
            expect(loose(m)[`eval.hunter_kill_rate_by_age.${name}`].value).toBeCloseTo(
                (kills[i] / ticks[i]) * 1000,
                12,
            );
        });
    });

    it('shares the deaths below the juvenile window', () => {
        const scene = createAgeScene(J);
        for (const age of [10, 999, 1000, 4000]) {
            noteAgeDeath(scene, deathRecord({ age, kills: 0 }), 0);
        }
        expect(ageMetrics(scene, worldWith([]))['eval.hunter_juvenile_death_share']).toEqual({ value: 0.5 });
    });

    it('rates kills per life tick by birth source, the dead from the ledger and the alive from their slots', () => {
        const scene = createAgeScene(J);
        noteAgeDeath(scene, deathRecord({ age: 1000, kills: 2, source: BIRTH_SOURCE.SPEC_FLIP }), 0);
        noteAgeDeath(scene, deathRecord({ age: 500, kills: 4, source: BIRTH_SOURCE.FLOOR }), 0);
        const m = ageMetrics(scene, worldWith([{ age: 3000, kills: 1, source: BIRTH_SOURCE.SPEC_FLIP }]));
        expect(m['eval.hunter_kill_rate_by_source.spec-flip']?.value).toBeCloseTo((3 / 4000) * 1000, 12);
        expect(m['eval.hunter_kill_rate_by_source.floor']?.value).toBeCloseTo((4 / 500) * 1000, 12);
        expect(m['eval.hunter_kill_rate_by_source.mate-hunter-parent']?.value).toBeNull();
    });

    it('leaves an immigrant hunter out of the source rates and keeps it in the bands', () => {
        const scene = createAgeScene(J);
        noteAgeDeath(scene, deathRecord({ age: 400, kills: 3, source: BIRTH_SOURCE.IMMIGRANT }), 0);
        const m = ageMetrics(scene, worldWith([]));
        for (const name of HUNTER_BIRTH_NAMES) {
            expect(loose(m)[`eval.hunter_kill_rate_by_source.${name}`].value).toBeNull();
        }
        expect(m['eval.hunter_kill_rate_by_age.juvenile']?.value).toBe(0);
    });

    it('ignores alive agents that cannot hunt', () => {
        const w = worldWith([{ age: 2000, kills: 5, source: BIRTH_SOURCE.INITIAL }]);
        w.spec[0] = 0;
        expect(ageMetrics(createAgeScene(J), w)['eval.hunter_kill_rate_by_age.young']?.value).toBeNull();
    });

    it('names the direction of every metric: only the juvenile death share is a verdict', () => {
        expect(directionOf('eval.hunter_juvenile_death_share')).toBe('lower');
        expect(directionOf('eval.hunter_first_kill_age')).toBe('watch');
    });
});

describe('an alive hunter whose birth source has no name', () => {
    it('counts its age in the bands but not in a source', () => {
        const scene = createAgeScene(J);
        const m = ageMetrics(scene, worldWith([{ age: 500, kills: 3, source: BIRTH_SOURCE.IMMIGRANT }]));
        expect(m['eval.hunter_kill_rate_by_age.juvenile']?.value).toBe(0);
        for (const name of HUNTER_BIRTH_NAMES) {
            expect(loose(m)[`eval.hunter_kill_rate_by_source.${name}`].value).toBeNull();
        }
    });
});
