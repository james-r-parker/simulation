import { describe, expect, it } from 'vitest';
import { SPEC } from '../../js/sim/specs.js';
import { roleDrillValidity } from '../../js/evo/drill-role-validity.js';
import { DEFEND_CALLER } from '../../js/evo/drill-role-defend.js';
import { WARN_HERD } from '../../js/evo/drill-role-warn.js';
import { CLEAR_HERD_BY_SPEC } from '../../js/evo/drill-role-herd.js';
import { MAKE_A_LIVING } from '../../js/evo/drill-role-living.js';

/** The shove on and the damping the row's search found, so the defence is reachable. */
const REACHABLE = { defenderRepelEnergy: 40, defenderRepelImpulse: 4, damping: 0.7125 };
/** Bites of 400 and a faster sprint: the hunter's `eat` step is possible. */
const LIVING = { biteEnergy: 400, specialisations: { predator: { sprintBoost: 2.2 } } };

describe('roleDrillValidity', () => {
    it('reports the defender row at the defaults as impossible: no passable bar, and a reference that wins nothing', () => {
        const v = roleDrillValidity(DEFEND_CALLER, { trials: 3 });
        expect(v.bar).toMatchObject({ status: 'impossible', binding: 'repel: off', passable: false, slackTicks: null });
        expect(v.reference).toMatchObject({ wins: 0, trials: 3, winShare: 0 });
        expect(v).toMatchObject({ referencePasses: false, agreesWithRow: true, valid: false });
        expect(v.reason).toBe('the row is impossible at "repel: off": no passable bar; the reference wins 0 of 3');
    });

    it('reads the defender drill as valid once the row is passable: the reference wins every trial and no random brain does', () => {
        const v = roleDrillValidity(DEFEND_CALLER, { trials: 8, config: REACHABLE });
        expect(v.bar).toMatchObject({ passable: true, slackTicks: 13 });
        expect(v.reference).toMatchObject({ wins: 8, trials: 8 });
        expect(v.random).toMatchObject({ wins: 0, trials: 32 });
        expect(v).toMatchObject({ referencePasses: true, randomFails: true, agreesWithRow: true, valid: true });
        expect(v.random.edgeLow).toBeGreaterThan(0);
        expect(v.reason).toBe('valid: the reference wins 8 of 8 and the random brains do not');
    });

    it('reads the scout drill at the defaults as valid: the row is tight, the reference wins every trial', () => {
        const v = roleDrillValidity(WARN_HERD, { trials: 8 });
        expect(v.bar).toMatchObject({ row: 'scout:predator', status: 'tight', passable: true, slackTicks: 3 });
        expect(v.reference).toMatchObject({ wins: 8, trials: 8 });
        expect(v).toMatchObject({ referencePasses: true, randomFails: true, valid: true });
        expect(v.reference.winShareLow).toBeGreaterThan(v.random.winShare);
    });

    it('is invalid, and disagrees with its row, when the reference does not win a passable row', () => {
        const mute = { name: 'mute', id: 0, spec: SPEC.SCOUT, weights: null, act: () => {} };
        const v = roleDrillValidity({ ...WARN_HERD, reference: () => mute }, { trials: 3 });
        expect(v).toMatchObject({ referencePasses: false, agreesWithRow: false, valid: false });
        expect(v.reason).toBe('invalid: the reference wins 0 of 3');
    });

    it('reports the hunter row at the defaults as impossible at breed: no passable bar, and a reference that wins nothing', () => {
        const v = roleDrillValidity(MAKE_A_LIVING, { trials: 2 });
        expect(v.bar).toMatchObject({
            row: 'predator:living',
            status: 'impossible',
            binding: 'breed',
            passable: false,
        });
        expect(v.reference.wins).toBe(0);
        expect(v).toMatchObject({ agreesWithRow: true, valid: false });
        expect(v.reason).toBe('the row is impossible at "breed": no passable bar; the reference wins 0 of 2');
    });

    it('reads the hunter drill as valid once its row is not impossible', () => {
        const v = roleDrillValidity(MAKE_A_LIVING, { trials: 3, config: LIVING });
        expect(v.bar).toMatchObject({ passable: true, status: 'ok', binding: 'eat' });
        expect(v).toMatchObject({ referencePasses: true, randomFails: true, valid: true });
        expect(v.reference).toMatchObject({ wins: 3, trials: 3 });
    });

    it('reads the forager clearing the herd as valid: the row is tight and the reference wins every trial', () => {
        const v = roleDrillValidity(CLEAR_HERD_BY_SPEC.forager, { trials: 8 });
        expect(v.bar).toMatchObject({ row: 'forager:herd', status: 'tight', passable: true });
        expect(v).toMatchObject({ referencePasses: true, randomFails: true, valid: true });
    });

    it('says when the scene is easier than the row: the reproducer row is impossible at run, the reference clears the herd', () => {
        const v = roleDrillValidity(CLEAR_HERD_BY_SPEC.reproducer, { trials: 3 });
        expect(v.bar).toMatchObject({ row: 'reproducer:herd', status: 'impossible', binding: 'run', passable: false });
        expect(v).toMatchObject({ agreesWithRow: false, valid: false });
        expect(v.reason).toBe(
            'the row is impossible at "run": no passable bar; the reference wins 3 of 3, so the scene is easier than the row says',
        );
    });
});
