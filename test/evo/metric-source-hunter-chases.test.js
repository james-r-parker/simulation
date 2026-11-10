// Source tests, hunters family, chases (docs/designs/metric-trust.md, T16): `scene-approach.js`, `scene-competence.js`
// and `scene-matched.js` read on the real `step`. A chase opens when the observer's prey tracker sees the hunter close
// on prey in view (thrust toward it); it ends caught (a fatal bite), escaped (a bite the prey lives through for 30 ticks)
// or given up (the closing stops for 30 ticks). The last chase of each run resolves in its final tick.

import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { starve } from './helpers/source-world.js';
import { FORAGER, PREDATOR, chaseSteps, huntRun, killStep, park, settleChases } from './helpers/hunt-scene.js';

const STILL = { maturityTicks: 100000 };

/**
 * One hunter runs the chases in order after burn-in, each against a fresh prey.
 * @param {Array<'caught' | 'escaped' | 'gaveup'>} outcomes the chases
 * @returns {Record<string, any>} the metrics
 */
function chases(outcomes) {
    const { run, spawn } = huntRun({ over: STILL });
    run.jump(BURN_IN_TICKS);
    const hunter = spawn(PREDATOR);
    for (const outcome of outcomes) {
        chaseSteps(run, { hunter, prey: spawn(FORAGER), outcome });
        settleChases(run);
    }
    return run.metrics();
}

describe('chase_catch_share, chase_escape_share, chase_giveup_share and hunt_abort_rate', () => {
    it('read one chase of each outcome as 1 in its own share', () => {
        const caught = chases(['caught']);
        expect(caught['eval.chase_catch_share']).toEqual({ value: 1 });
        expect(caught['eval.chase_giveup_share']).toEqual({ value: 0 });
        expect(caught['eval.hunt_abort_rate']).toEqual({ value: 0 });
        expect(chases(['escaped'])['eval.chase_escape_share']).toEqual({ value: 1 });
        const gaveUp = chases(['gaveup']);
        expect(gaveUp['eval.chase_giveup_share']).toEqual({ value: 1 });
        expect(gaveUp['eval.hunt_abort_rate']).toEqual({ value: 1 });
    });

    it('read a mix of two catches, one escape and one give-up as 1/2, 1/4, 1/4, and abort 1 of 4 approaches', () => {
        const m = chases(['caught', 'escaped', 'gaveup', 'caught']);
        expect(m['eval.chase_catch_share']).toEqual({ value: 0.5 });
        expect(m['eval.chase_escape_share']).toEqual({ value: 0.25 });
        expect(m['eval.chase_giveup_share']).toEqual({ value: 0.25 });
        expect(m['eval.hunt_abort_rate']).toEqual({ value: 0.25 });
    });

    it('are null before any chase resolves after burn-in', () => {
        expect(chases([])['eval.chase_catch_share']).toEqual({
            value: null,
            reason: 'no chase resolved after burn-in',
        });
    });
});

/**
 * One hunter runs `script` after burn-in, each chase against a fresh prey at the age and opening energy given.
 * @param {Array<{outcome: 'caught' | 'escaped' | 'gaveup', age: number, energy?: number}>} script the chases
 * @param {Record<string, any>} [over] config overrides
 * @returns {Record<string, any>} the metrics
 */
function agedChases(script, over = {}) {
    const { run, spawn } = huntRun({ over: { ...STILL, ...over } });
    run.jump(BURN_IN_TICKS);
    const hunter = spawn(PREDATOR);
    for (const chase of script) {
        chaseSteps(run, { hunter, prey: spawn(FORAGER), ...chase });
        settleChases(run);
    }
    return run.metrics();
}

describe('hunter_kill_conversion_by_age.<band> and hunter_chases_by_age.<band>', () => {
    it('bin each chase by the age at its opening: 1 of 2, 2 of 3 and 0 of 1', () => {
        const m = agedChases([
            { outcome: 'caught', age: 500 },
            { outcome: 'gaveup', age: 500 },
            { outcome: 'caught', age: 1500 },
            { outcome: 'escaped', age: 1500 },
            { outcome: 'caught', age: 1500 },
            { outcome: 'escaped', age: 2500 },
        ]);
        expect(m['eval.hunter_kill_conversion_by_age.under1k']).toEqual({ value: 0.5 });
        expect(m['eval.hunter_kill_conversion_by_age.1k-2k'].value).toBeCloseTo(2 / 3, 12);
        expect(m['eval.hunter_kill_conversion_by_age.over2k']).toEqual({ value: 0 });
        expect(m['eval.hunter_chases_by_age.under1k']).toEqual({ value: 2 });
        expect(m['eval.hunter_chases_by_age.1k-2k']).toEqual({ value: 3 });
        expect(m['eval.hunter_chases_by_age.over2k']).toEqual({ value: 1 });
    });

    it('are null in a band with no chase', () => {
        const m = agedChases([{ outcome: 'caught', age: 500 }]);
        expect(m['eval.hunter_chases_by_age.over2k']).toEqual({ value: null, reason: 'no chase opened in the band' });
    });
});

describe('hunter_kill_conversion_hungry.1k-2k', () => {
    it('counts only the chases opened while the hunter could eat: 1 of 2, beside 3 of 4 for the band', () => {
        const m = agedChases(
            [
                { outcome: 'caught', age: 1500 },
                { outcome: 'gaveup', age: 1500 },
                { outcome: 'caught', age: 1500, energy: 1900 },
                { outcome: 'caught', age: 1500, energy: 1900 },
            ],
            { satiationShare: 0.9 },
        );
        expect(m['eval.hunter_kill_conversion_hungry.1k-2k']).toEqual({ value: 0.5 });
        expect(m['eval.hunter_kill_conversion_by_age.1k-2k']).toEqual({ value: 0.75 });
    });
});

describe('hunter_conversion_gain and hunter_conversion_gain_hunters', () => {
    it('read late minus early catch share for a hunter with 2 chases at 1000 to 1999 and 2 at 3000 to 3999', () => {
        const m = agedChases([
            { outcome: 'caught', age: 1500 },
            { outcome: 'gaveup', age: 1500 },
            { outcome: 'caught', age: 3500 },
            { outcome: 'caught', age: 3500 },
        ]);
        expect(m['eval.hunter_conversion_gain']).toEqual({ value: 0.5 });
        expect(m['eval.hunter_conversion_gain_hunters']).toEqual({ value: 1 });
    });

    it('are null for a hunter with one late chase', () => {
        const m = agedChases([
            { outcome: 'caught', age: 1500 },
            { outcome: 'caught', age: 1500 },
            { outcome: 'caught', age: 3500 },
        ]);
        expect(m['eval.hunter_conversion_gain']).toEqual({ value: null, reason: 'no hunter lived to both bands' });
    });
});

describe('hunter_first_kill_km_median and hunter_first_kill_rmst', () => {
    /**
     * Three hunters born after burn-in (juvenileTicks 100, so the horizon is 200): A kills first at age 100 unless
     * `noKill`; B dies at 50; C is alive at 300 in the final tick. B and C are censored.
     * @param {{noKill?: boolean}} [options] whether A never kills
     */
    function firstKills({ noKill = false } = {}) {
        const { run, world, spawn } = huntRun({ over: { ...STILL, juvenileTicks: 100 } });
        run.jump(BURN_IN_TICKS);
        const [a, b, c] = [spawn(PREDATOR), spawn(PREDATOR), spawn(PREDATOR)];
        park(world, b, 100);
        park(world, c, 200);
        if (!noKill) {
            killStep(run, a, spawn(FORAGER), { age: 99 });
        }
        park(world, a, 300);
        run.tick((w) => starve(w, b, 50));
        run.tick((w) => (w.ageTicks[c] = 299));
        return run.metrics();
    }

    it('read the Kaplan-Meier median 100 and the restricted mean 100 + 0.5 x 100 = 150', () => {
        const m = firstKills();
        expect(m['eval.hunter_first_kill_km_median']).toEqual({ value: 100 });
        expect(m['eval.hunter_first_kill_rmst']).toEqual({ value: 150 });
    });

    it('have no median while no hunter has killed, and the full horizon as the restricted mean', () => {
        const m = firstKills({ noKill: true });
        expect(m['eval.hunter_first_kill_km_median']).toEqual({ value: null, reason: 'median not reached' });
        expect(m['eval.hunter_first_kill_rmst']).toEqual({ value: 200 });
    });
});

describe('hunter_independent_kill_share', () => {
    /** @param {boolean[]} near for each deliberate kill, whether the killer's parent stands within 120 px */
    function kills(near) {
        const { run, world, spawn } = huntRun({ over: STILL });
        const parent = spawn(FORAGER);
        const hunter = spawn(PREDATOR);
        world.parentA[hunter] = world.genomeId[parent];
        for (const isNear of near) {
            if (isNear) {
                world.x[parent] = 200;
                world.y[parent] = 560;
            } else {
                park(world, parent, 100);
            }
            killStep(run, hunter, spawn(FORAGER));
        }
        return run.metrics()['eval.hunter_independent_kill_share'];
    }

    it('reads the kills made with no parent within PARENT_RANGE: 0, 1/2 and 1', () => {
        expect(kills([true])).toEqual({ value: 0 });
        expect(kills([true, false])).toEqual({ value: 0.5 });
        expect(kills([false])).toEqual({ value: 1 });
        expect(kills([])).toEqual({ value: null, reason: 'no deliberate kill' });
    });
});

describe('hunter_conversion_matched.<band> and hunter_conversion_by_dose', () => {
    // 21 chases at age 1500 by one hunter: opening energies cycle low, mid, high (7 each, so the run's terciles split
    // them exactly) and the prior count is the chase's index. A naive reference recomputes both from this script.
    const GROUPS = [200, 800, 1400];
    const script = Array.from({ length: 21 }, (_, i) => ({
        tercile: i % 3,
        prior: i,
        caught: i % 3 === 0 || i % 4 === 1 ? 1 : 0,
    }));
    const m = agedChases(
        script.map(({ tercile, caught }) => ({
            outcome: /** @type {'caught' | 'gaveup'} */ (caught === 1 ? 'caught' : 'gaveup'),
            age: 1500,
            energy: GROUPS[tercile],
        })),
    );

    /** @returns {number} the mean catch share over (tercile, prior class) strata with 5 chases or more */
    function matchedReference() {
        /** @type {Map<string, number[]>} */
        const strata = new Map();
        for (const { tercile, prior, caught } of script) {
            const key = `${tercile}:${prior === 0 ? 0 : prior < 5 ? 1 : 2}`;
            strata.set(key, [...(strata.get(key) ?? []), caught]);
        }
        const shares = [...strata.values()]
            .filter((c) => c.length >= 5)
            .map((c) => c.reduce((a, b) => a + b) / c.length);
        expect(shares.length).toBeGreaterThanOrEqual(3);
        return shares.reduce((a, b) => a + b) / shares.length;
    }

    /** @returns {number} the mean over terciles of the least-squares slope of caught on prior count */
    function doseReference() {
        const slopes = [0, 1, 2].map((t) => {
            const rows = script.filter((c) => c.tercile === t);
            const mx = rows.reduce((s, c) => s + c.prior, 0) / rows.length;
            const my = rows.reduce((s, c) => s + c.caught, 0) / rows.length;
            const sxy = rows.reduce((s, c) => s + (c.prior - mx) * (c.caught - my), 0);
            return sxy / rows.reduce((s, c) => s + (c.prior - mx) ** 2, 0);
        });
        return slopes.reduce((a, b) => a + b) / slopes.length;
    }

    it('read the strata mean of the 1k-2k chases and nothing for the empty bands', () => {
        expect(m['eval.hunter_conversion_matched.1k-2k'].value).toBeCloseTo(matchedReference(), 12);
        expect(m['eval.hunter_conversion_matched.under1k'].value).toBeNull();
        expect(m['eval.hunter_conversion_matched.over2k'].value).toBeNull();
    });

    it('read the mean slope of a catch on the prior chase count within each energy tercile', () => {
        expect(m['eval.hunter_conversion_by_dose'].value).toBeCloseTo(doseReference(), 12);
    });
});
