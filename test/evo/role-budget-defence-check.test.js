import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { preStep5Arena } from '../helpers/pre-step5.js';
import { defenceCheck } from '../../js/evo/role-budget-defence-check.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';

describe('defenceCheck at the defaults', () => {
    const { readings, drift } = defenceCheck(preStep5Arena(), MODEL_DEFAULTS);

    it('reads the call, the hearing, the touch, the kill, both smokes and the aimed drop, with no drift', () => {
        expect(drift).toBe(0);
        expect(readings.map((r) => `${r.row} ${r.what}`)).toEqual([
            'defender:predator alarm tick',
            'defender:predator heard tick',
            'defender:predator defender moves',
            'defender:predator kill tick, no defender',
            'defender:predator defender touches the hunter',
            'defender:predator defender lands its power before the kill',
            'defender:predator kill tick',
            'smoke:prey hidden ticks',
            'smoke:prey cloud centre, px ahead of the hunter',
            'smoke:prey cloud life',
            'smoke:prey out of view when the cover ends',
            'smoke:defender release tick',
            'smoke:defender a defender facing the hunter drops the cloud toward it: the cloud is between',
        ]);
        // at the escort distance the defender's path to the smoke spot grazes the caller (the formula has no bumps), so the
        // walk is not read at the defaults; it is read from 150 px below
        expect(readings.some((r) => r.row === 'smoke:defender walk')).toBe(false);
    });

    it('puts the formula beside the scene, with the tolerance in words', () => {
        const alarm = readings[0];
        expect([alarm.formula, alarm.scene, alarm.tolerance, alarm.drift]).toEqual([2, 2, '0 ticks', false]);
        expect(readings.find((r) => r.what === 'cloud life')?.formula).toBe(179);
    });
});

describe('defenceCheck with other models', () => {
    /** The scenes these tests pin were first read with the defender 150 px off the caller. */
    const FAR = { ...MODEL_DEFAULTS, escortGap: 150 };
    const SLOW = {
        maxVelocity: 4.5,
        defenderRepelEnergy: 40,
        defenderRepelImpulse: 4,
        defenderRepelCost: 2,
        specialisations: { predator: { sprintBoost: 0.5 } },
    };

    it('with the shove on, the defender lands its power before the kill in the formula and in the scene', () => {
        const run = defenceCheck(preStep5Arena(SLOW), FAR);
        const lands = run.readings.find((r) => r.what.startsWith('defender lands its power'));
        expect([lands?.formula, lands?.scene]).toEqual([true, true]);
    });

    it('with the shove on it reads the first shove, whether the bite breaks and the energy prevented, and they agree', () => {
        const run = defenceCheck(preStep5Arena(SLOW), FAR);
        const read = (/** @type {string} */ what) => run.readings.find((r) => r.what === what);
        expect(read('first shove tick')).toMatchObject({ formula: 39, scene: 39, drift: false, tolerance: '2 ticks' });
        expect(read('shove breaks the bite')).toMatchObject({ formula: true, scene: true, drift: false });
        expect(read('bite energy prevented')?.drift).toBe(false);
    });

    it('with the shove on the kill tick agrees: the hunter bites the defender dead, rests, then kills the caller (T12a)', () => {
        const run = defenceCheck(preStep5Arena(SLOW), FAR);
        expect(run.readings.filter((r) => r.drift)).toEqual([]);
        const kill = run.readings.find((r) => r.what === 'kill tick');
        expect([kill?.formula, kill?.scene, kill?.tolerance]).toEqual([201, 201, '2 ticks']);
    });

    it('with the shove off the kill tick is read within the plan tolerance of 2 ticks', () => {
        const kill = defenceCheck(preStep5Arena(), MODEL_DEFAULTS).readings.find((r) => r.what === 'kill tick');
        expect(kill?.tolerance).toBe('2 ticks');
    });

    it('for a release before the hunter reaches the cloud it also reads the cloud, the blind ticks and the caller escape', () => {
        const quick = { smokeDecoyTicks: 0, maxVelocity: 5, specialisations: { predator: { visionRange: 100 } } };
        const run = defenceCheck(preStep5Arena(quick), { ...MODEL_DEFAULTS, reactionTicks: 0 });
        expect(run.drift).toBe(0);
        const names = run.readings.filter((r) => r.row === 'smoke:defender').map((r) => r.what);
        expect(names).toContain('hidden ticks');
        expect(names).toContain('caller out of view when the cover ends');
        expect(names).toContain('cloud centre, px ahead of the hunter');
    });

    it('the brains of the scenes react at the reactionTicks of the model, which the formula reads too', () => {
        const same = defenceCheck(preStep5Arena(), { ...MODEL_DEFAULTS, reactionTicks: 4 });
        expect(same.drift).toBe(0);
        expect(same.readings[2].formula).toBe(9);
    });

    it('the walk is read from the real start, and not for a defender never heard or one whose path runs through the caller', () => {
        const walk = defenceCheck(preStep5Arena(), FAR).readings.filter((r) => r.row === 'smoke:defender walk');
        expect(walk.map((r) => r.drift)).toEqual([false, false, false]);
        expect(walk[0].formula).toBeGreaterThan(40);
        for (const gap of [300, 60]) {
            const run = defenceCheck(preStep5Arena(), { ...MODEL_DEFAULTS, escortGap: gap });
            expect(run.readings.some((r) => r.row === 'smoke:defender walk')).toBe(false);
        }
    });

    it('a defender out of earshot is never heard, in the formula and in the scene alike', () => {
        const far = defenceCheck(preStep5Arena(), { ...MODEL_DEFAULTS, escortGap: 300 });
        expect(far.drift).toBe(0);
        expect([far.readings[1].formula, far.readings[1].scene]).toEqual([-1, -1]);
    });
});

describe('defenceCheck with the guard posture', () => {
    /** The step 5 candidate: the shove on (`defenderRepelEnergy` 40, `defenderRepelImpulse` 4) and the rest of its settings. */
    const STEP5 = JSON.parse(readFileSync('evals/role-budget/step5-d.json', 'utf8'));
    const BETWEEN = { ...MODEL_DEFAULTS, guardPosture: /** @type {const} */ ('between') };

    it('plays the scene in the posture the formula reads: the shove lands and breaks the bite in both', () => {
        const run = defenceCheck(preStep5Arena(STEP5), BETWEEN);
        const read = (/** @type {string} */ what) => run.readings.find((r) => r.what === what);
        expect(run.readings.filter((r) => r.row === 'defender:predator' && r.drift)).toEqual([]);
        expect(read('first shove tick')?.scene).not.toBeNull();
        expect(read('shove breaks the bite')).toMatchObject({ formula: true, scene: true });
        expect(read('bite energy prevented')?.scene).toBeGreaterThan(0);
    });

    it('reads the kill tick of a hunter the guard blocks: it kills the guard, goes round and agrees with the sim', () => {
        const run = defenceCheck(preStep5Arena(), BETWEEN);
        const kill = run.readings.find((r) => r.what === 'kill tick');
        expect(kill).toMatchObject({ drift: false, tolerance: '2 ticks' });
        expect(kill?.formula).not.toBeNull();
        expect(run.drift).toBe(0);
    });

    it('with the shove on and the stagger on neither the formula nor the sim has the hunter through the guard', () => {
        const run = defenceCheck(preStep5Arena(STEP5), BETWEEN);
        const kill = run.readings.find((r) => r.what === 'kill tick');
        expect([kill?.formula, kill?.scene, kill?.drift]).toEqual([null, null, false]);
    });
});
