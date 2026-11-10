// Source tests, hunters family, the hunter lives (docs/designs/metric-trust.md, T16): `scene-hunters.js` and
// `scene-hunter-age.js` read on the real `step`. Three hunters with known fates: A (initial) kills three times
// deliberately, at ages 51, 201 and 601, the last kill eating hunter C; B (a floor spawn) kills once by a chance bite; C
// dies at 31. B starves at 250 and A at 700 in the final tick. The step adds a tick of age before the bite, so a kill
// set at age 50 records 51. Every kill is a body that dies in the tick of its bite.

import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { BIRTH_SOURCE } from '../../js/sim/hunter-ledger.js';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { starve } from './helpers/source-world.js';
import { FORAGER, PREDATOR, huntRun, killStep, park } from './helpers/hunt-scene.js';

const RUN_TICKS = BURN_IN_TICKS + 400;
const JUVENILE = 100;

/**
 * The three-hunter run.
 * @param {{chanceOnly?: boolean}} [options] make every kill a chance bite
 * @returns {Record<string, any>} the metrics
 */
function hunterLives({ chanceOnly = false } = {}) {
    const { run, world, spawn } = huntRun({ runTicks: RUN_TICKS, over: { juvenileTicks: JUVENILE } });
    const a = spawn(PREDATOR);
    const b = spawn(PREDATOR, BORN_CAUSE.FLOOR);
    const c = spawn(PREDATOR);
    park(world, b, 100);
    park(world, c, 200);
    const deliberate = !chanceOnly;
    run.jump(BURN_IN_TICKS);
    killStep(run, a, spawn(FORAGER), { age: 50, deliberate });
    run.jump(BURN_IN_TICKS + 50);
    killStep(run, a, spawn(FORAGER), { age: 200, deliberate });
    run.jump(BURN_IN_TICKS + 100);
    const v3 = spawn(FORAGER);
    park(world, a, 300);
    killStep(run, b, v3, { age: 150, deliberate: false });
    run.jump(BURN_IN_TICKS + 150);
    world.ageTicks[c] = 30;
    killStep(run, a, c, { age: 600, deliberate });
    run.jump(BURN_IN_TICKS + 200);
    run.tick((w) => starve(w, b, 250));
    run.jump(RUN_TICKS - 1);
    run.tick((w) => starve(w, a, 700));
    return run.metrics();
}

const LIVES = hunterLives();

describe('hunter_kills_per_life_p50, hunter_kills_per_life_mean and hunter_zero_kill_share', () => {
    it('read the ledger kills 3, 0, 0: median 0, mean 1, two of three lives without a kill', () => {
        expect(LIVES['eval.hunter_kills_per_life_p50']).toEqual({ value: 0 });
        expect(LIVES['eval.hunter_kills_per_life_mean']).toEqual({ value: 1 });
        expect(LIVES['eval.hunter_zero_kill_share'].value).toBeCloseTo(2 / 3, 12);
    });

    it('credit no kill for chance bites: every life reads 0', () => {
        const chance = hunterLives({ chanceOnly: true });
        expect(chance['eval.hunter_kills_per_life_mean']).toEqual({ value: 0 });
        expect(chance['eval.hunter_zero_kill_share']).toEqual({ value: 1 });
    });
});

describe('hunter_median_lifespan and hunter_death_share.<cause>', () => {
    it('read the ages 31, 250, 700 and the causes starved, starved, eaten', () => {
        expect(LIVES['eval.hunter_median_lifespan']).toEqual({ value: 250 });
        expect(LIVES['eval.hunter_death_share.starved'].value).toBeCloseTo(2 / 3, 12);
        expect(LIVES['eval.hunter_death_share.eaten'].value).toBeCloseTo(1 / 3, 12);
        for (const name of [
            'eval.hunter_death_share.collision',
            'eval.hunter_death_share.trampled',
            'eval.hunter_death_share.disease',
            'eval.hunter_death_share.other',
        ]) {
            expect(LIVES[name]).toEqual({ value: 0 });
        }
    });

    it('are null before any hunter dies', () => {
        const { run, spawn } = huntRun({ runTicks: RUN_TICKS });
        spawn(PREDATOR);
        run.tick();
        const m = run.metrics();
        expect(m['eval.hunter_median_lifespan']).toEqual({ value: null, reason: 'no hunter deaths' });
        expect(m['eval.hunter_death_share.starved']).toEqual({ value: null, reason: 'no hunter deaths' });
    });
});

describe('hunter_income_share.<kill|bite|carcass|herd>', () => {
    it('book the three deliberate kills as kill energy and the chance kill as bite gain, of equal meals: 3/4 and 1/4', () => {
        expect(LIVES['eval.hunter_income_share.kill'].value).toBeCloseTo(0.75, 12);
        expect(LIVES['eval.hunter_income_share.bite'].value).toBeCloseTo(0.25, 12);
        expect(LIVES['eval.hunter_income_share.carcass']).toEqual({ value: 0 });
        expect(LIVES['eval.hunter_income_share.herd']).toEqual({ value: 0 });
    });

    it('read all bite gain when every kill is a chance bite', () => {
        const chance = hunterLives({ chanceOnly: true });
        expect(chance['eval.hunter_income_share.kill']).toEqual({ value: 0 });
        expect(chance['eval.hunter_income_share.bite']).toEqual({ value: 1 });
    });
});

describe('hunter_ticks_last_quarter', () => {
    it('sums the alive hunters at every observe after 3/4 of the run: 3 at three spawns and three kills, then 2, 1, 0', () => {
        expect(LIVES['eval.hunter_ticks_last_quarter']).toEqual({ value: 3 * 6 + 2 + 1 + 0 });
    });
});

describe('hunter_first_kill_age and hunter_juvenile_death_share', () => {
    it("read A's first deliberate kill at 51 and C's death at 31 below juvenileTicks (1 of 3 deaths)", () => {
        expect(LIVES['eval.hunter_first_kill_age']).toEqual({ value: 51 });
        expect(LIVES['eval.hunter_juvenile_death_share'].value).toBeCloseTo(1 / 3, 12);
    });

    it('have no first kill when no kill is deliberate', () => {
        expect(hunterLives({ chanceOnly: true })['eval.hunter_first_kill_age']).toEqual({
            value: null,
            reason: 'no hunter made a deliberate kill',
        });
    });
});

describe('hunter_kill_rate_by_age.<band> and hunter_kill_rate_by_source.<source>', () => {
    // Life ticks by band (juvenile < 100, young < 400): A 700 = 100 + 300 + 300, B 250 = 100 + 150, C 31.
    it('read one kill per band over 231, 450 and 300 life ticks', () => {
        expect(LIVES['eval.hunter_kill_rate_by_age.juvenile'].value).toBeCloseTo(1000 / 231, 9);
        expect(LIVES['eval.hunter_kill_rate_by_age.young'].value).toBeCloseTo(1000 / 450, 9);
        expect(LIVES['eval.hunter_kill_rate_by_age.adult'].value).toBeCloseTo(1000 / 300, 9);
    });

    it('read 3 kills over the initial lives (731 ticks), 0 over the floor life, and no ticks for the other sources', () => {
        expect(LIVES['eval.hunter_kill_rate_by_source.initial'].value).toBeCloseTo(3000 / 731, 9);
        expect(LIVES['eval.hunter_kill_rate_by_source.floor']).toEqual({ value: 0 });
        for (const name of [
            'eval.hunter_kill_rate_by_source.mate-hunter-parent',
            'eval.hunter_kill_rate_by_source.split-hunter-parent',
            'eval.hunter_kill_rate_by_source.spec-flip',
        ]) {
            expect(LIVES[name]).toEqual({ value: null, reason: 'no agent-ticks' });
        }
    });
});

describe('predator_end_local_share', () => {
    /** @param {number[]} sources the birth source of each hunter alive at the end */
    function endShare(sources) {
        const { run, world, spawn } = huntRun({ runTicks: RUN_TICKS });
        sources.forEach((source, i) => {
            const slot = spawn(PREDATOR);
            park(world, slot, 100 + 100 * i);
            world.birthSource[slot] = source;
        });
        const doomed = spawn(PREDATOR);
        run.jump(RUN_TICKS - 1);
        run.tick((w) => starve(w, doomed, 50));
        return run.metrics()['eval.predator_end_local_share'];
    }

    it('reads the share of living hunters born by a hunter mating, a hunter split or a flip: 0, 1/2, 1', () => {
        const { INITIAL, FLOOR, SPLIT_HUNTER, MATE_HUNTER, SPEC_FLIP } = BIRTH_SOURCE;
        expect(endShare([INITIAL, FLOOR])).toEqual({ value: 0 });
        expect(endShare([SPLIT_HUNTER, FLOOR, MATE_HUNTER, INITIAL])).toEqual({ value: 0.5 });
        expect(endShare([SPEC_FLIP, MATE_HUNTER])).toEqual({ value: 1 });
        expect(endShare([])).toEqual({ value: null, reason: 'no hunter alive at the last tick' });
    });
});
