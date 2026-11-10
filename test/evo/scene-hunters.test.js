import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE, EVENT_STRIDE, EVENT_TYPE, pushEvent, createEventRing } from '../../js/sim/events.js';
import { BIRTH_SOURCE, INCOME, INCOME_KINDS } from '../../js/sim/hunter-ledger.js';
import {
    createHunterScene,
    hunterMetrics,
    noteHunterBirth,
    noteHunterKill,
    noteHunterLedger,
    tickHunters,
} from '../../js/evo/scene-hunters.js';
import { loose } from './helpers/metric-registry.js';

const HUNT = new Float64Array([0, 1]);

/**
 * @param {Record<string, any>} [over] world fields
 * @returns {Record<string, any>} a two-slot hand-built world: spec 1 hunts
 */
function world(over = {}) {
    return {
        alive: new Uint8Array(4),
        spec: new Uint8Array(4),
        birthSource: new Uint8Array(4),
        ageTicks: new Float64Array(4),
        ledgerKills: new Float64Array(4),
        huntBySpec: HUNT,
        hunterIncomeBySpec: new Float64Array(2 * INCOME_KINDS),
        ...over,
    };
}

/**
 * @param {Record<string, any>} scene the scene
 * @param {{cause: number, kills: number, age: number}} death a hunter death
 * @returns {void}
 */
function die(scene, { cause, kills, age }) {
    const ring = createEventRing(1);
    const o = pushEvent(ring, EVENT_TYPE.HUNTER_LEDGER, 1);
    ring.data[o + 3] = age;
    ring.data[o + 4] = (kills * 8 + cause) * 8;
    noteHunterLedger(scene, ring.data, 0);
    expect(o).toBe(0);
    expect(ring.data.length).toBe(EVENT_STRIDE);
}

/**
 * @param {Record<string, any>} scene the scene
 * @param {Record<string, any>} w the world
 * @param {number} source the child's `BIRTH_SOURCE`
 * @returns {void}
 */
function born(scene, w, source) {
    w.spec[0] = 1;
    w.birthSource[0] = source;
    noteHunterBirth(scene, w, 0);
}

describe('the hunter death metrics', () => {
    it('are null with a reason when no hunter died', () => {
        const m = hunterMetrics(createHunterScene(1000), world());
        for (const name of [
            'eval.hunter_kills_per_life_p50',
            'eval.hunter_kills_per_life_mean',
            'eval.hunter_zero_kill_share',
            'eval.hunter_median_lifespan',
        ]) {
            expect(loose(m)[name].value).toBeNull();
            expect(loose(m)[name].reason).toBe('no hunter deaths');
        }
        expect(m['eval.hunter_death_share.starved']?.value).toBeNull();
    });

    it('give the median and mean kills, the zero-kill share, the median lifespan and the death shares', () => {
        const scene = createHunterScene(1000);
        die(scene, { cause: DEATH_CAUSE.STARVED, kills: 0, age: 100 });
        die(scene, { cause: DEATH_CAUSE.STARVED, kills: 0, age: 300 });
        die(scene, { cause: DEATH_CAUSE.EATEN, kills: 4, age: 500 });
        die(scene, { cause: DEATH_CAUSE.POISONED, kills: 2, age: 700 });
        const m = hunterMetrics(scene, world());
        expect(m['eval.hunter_kills_per_life_p50']).toEqual({ value: 1 });
        expect(m['eval.hunter_kills_per_life_mean']).toEqual({ value: 1.5 });
        expect(m['eval.hunter_zero_kill_share']).toEqual({ value: 0.5 });
        expect(m['eval.hunter_median_lifespan']).toEqual({ value: 400 });
        expect(m['eval.hunter_death_share.starved']).toEqual({ value: 0.5 });
        expect(m['eval.hunter_death_share.eaten']).toEqual({ value: 0.25 });
        expect(m['eval.hunter_death_share.other']).toEqual({ value: 0.25 });
        expect(m['eval.hunter_death_share.collision']).toEqual({ value: 0 });
    });
});

describe('the hunter birth, income and end metrics', () => {
    it('share the hunter births by source and ignore a non-hunter child and an immigrant', () => {
        const scene = createHunterScene(1000);
        const w = world();
        born(scene, w, BIRTH_SOURCE.MATE_HUNTER);
        born(scene, w, BIRTH_SOURCE.MATE_HUNTER);
        born(scene, w, BIRTH_SOURCE.SPEC_FLIP);
        born(scene, w, BIRTH_SOURCE.FLOOR);
        born(scene, w, BIRTH_SOURCE.IMMIGRANT);
        w.spec[0] = 0;
        noteHunterBirth(scene, w, 0);
        const m = hunterMetrics(scene, w);
        expect(m['eval.hunter_birth_source_share.mate-hunter-parent']).toEqual({ value: 0.5 });
        expect(m['eval.hunter_birth_source_share.spec-flip']).toEqual({ value: 0.25 });
        expect(m['eval.hunter_birth_source_share.floor']).toEqual({ value: 0.25 });
        expect(m['eval.hunter_birth_source_share.split-hunter-parent']).toEqual({ value: 0 });
        expect(hunterMetrics(createHunterScene(10), w)['eval.hunter_birth_source_share.floor']?.reason).toBe(
            'no hunter births',
        );
    });

    it('share the stored income of the hunting specialisations by source', () => {
        const w = world();
        w.hunterIncomeBySpec[INCOME.CARCASS] = 900;
        w.hunterIncomeBySpec[INCOME_KINDS + INCOME.KILL] = 10;
        w.hunterIncomeBySpec[INCOME_KINDS + INCOME.BITE] = 60;
        w.hunterIncomeBySpec[INCOME_KINDS + INCOME.HERD] = 30;
        const m = hunterMetrics(createHunterScene(10), w);
        expect(m['eval.hunter_income_share.kill']).toEqual({ value: 0.1 });
        expect(m['eval.hunter_income_share.bite']).toEqual({ value: 0.6 });
        expect(m['eval.hunter_income_share.carcass']).toEqual({ value: 0 });
        expect(m['eval.hunter_income_share.herd']).toEqual({ value: 0.3 });
        expect(hunterMetrics(createHunterScene(10), world())['eval.hunter_income_share.kill']?.value).toBeNull();
    });

    it('give the local share of the hunters alive at the end, null when none is alive', () => {
        const w = world();
        expect(hunterMetrics(createHunterScene(10), w)['eval.predator_end_local_share']?.reason).toBe(
            'no hunter alive at the last tick',
        );
        const sources = [
            BIRTH_SOURCE.MATE_HUNTER,
            BIRTH_SOURCE.SPLIT_HUNTER,
            BIRTH_SOURCE.SPEC_FLIP,
            BIRTH_SOURCE.FLOOR,
        ];
        sources.forEach((source, slot) => {
            w.alive[slot] = 1;
            w.spec[slot] = 1;
            w.birthSource[slot] = source;
        });
        expect(hunterMetrics(createHunterScene(10), w)['eval.predator_end_local_share']).toEqual({ value: 0.75 });
    });

    it('sum the alive hunters over the last quarter of the run', () => {
        const scene = createHunterScene(100);
        const w = world();
        born(scene, w, BIRTH_SOURCE.INITIAL);
        born(scene, w, BIRTH_SOURCE.INITIAL);
        for (let tick = 1; tick <= 100; tick++) {
            if (tick === 90) {
                die(scene, { cause: DEATH_CAUSE.STARVED, kills: 0, age: 90 });
            }
            tickHunters(scene, tick);
        }
        expect(hunterMetrics(scene, w)['eval.hunter_ticks_last_quarter']).toEqual({ value: 14 * 2 + 11 });
        expect(hunterMetrics(createHunterScene(0), w)['eval.hunter_ticks_last_quarter']?.value).toBeNull();
    });
});

describe('the age detectors on the hunter scene', () => {
    it('take the juvenile window from the config and count a death and a kill through the scene', () => {
        const scene = createHunterScene(1000, { juvenileTicks: 500 });
        die(scene, { cause: DEATH_CAUSE.STARVED, kills: 1, age: 400 });
        die(scene, { cause: DEATH_CAUSE.STARVED, kills: 0, age: 600 });
        const ring = createEventRing(1);
        const o = pushEvent(ring, EVENT_TYPE.HUNTER_KILL, 1);
        ring.data[o + 3] = 300;
        ring.data[o + 4] = 1;
        noteHunterKill(scene, ring.data, o);
        const m = hunterMetrics(scene, world());
        expect(m['eval.hunter_juvenile_death_share']).toEqual({ value: 0.5 });
        expect(m['eval.hunter_first_kill_age']).toEqual({ value: 300 });
        expect(m['eval.hunter_kill_rate_by_age.juvenile']?.value).toBeCloseTo((1 / 900) * 1000, 12);
    });
});
