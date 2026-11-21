import { describe, expect, it } from 'vitest';
import { roleDrillValidity } from '../../js/evo/drill-role-validity.js';
import { DEFEND_CALLER } from '../../js/evo/drill-role-defend.js';
import { WARN_HERD } from '../../js/evo/drill-role-warn.js';
import { CLEAR_HERD_BY_SPEC, HERD_SPECS } from '../../js/evo/drill-role-herd.js';
import { MAKE_A_LIVING } from '../../js/evo/drill-role-living.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

/** The shove on and the damping the row's search found, so the defence is reachable. */
const REACHABLE = { defenderRepelEnergy: 40, defenderRepelImpulse: 4, damping: 0.7125 };
/** Bites of 400 and a faster sprint: the hunter's `eat` step is possible. */
const LIVING = { biteEnergy: 400, specialisations: { predator: { sprintBoost: 2.2 } } };

describe('role drill validity at the trial count of a gate checkpoint', () => {
    it(
        'defend-caller at the defaults has no passable bar: the row is impossible and the reference wins none of 64',
        () => {
            const v = roleDrillValidity(DEFEND_CALLER, { trials: 64 });
            expect(v.bar.passable).toBe(false);
            expect(v.reference.wins).toBe(0);
            expect(v.agreesWithRow).toBe(true);
        },
        scaleTimeout(60_000),
    );

    it(
        'defend-caller with the shove on and the searched damping: the reference wins all 64, the random brains none',
        () => {
            const v = roleDrillValidity(DEFEND_CALLER, { trials: 64, config: REACHABLE });
            expect(v).toMatchObject({ valid: true, reference: { wins: 64 }, random: { wins: 0, trials: 256 } });
        },
        scaleTimeout(60_000),
    );

    it(
        'warn-herd at the defaults: the reference wins all 64 and the random brains clearly fewer',
        () => {
            const v = roleDrillValidity(WARN_HERD, { trials: 64 });
            expect(v).toMatchObject({ valid: true, reference: { wins: 64 } });
            expect(v.random.winShare).toBeLessThan(0.5);
            expect(v.random.edgeLow).toBeGreaterThan(0.3);
        },
        scaleTimeout(60_000),
    );

    it(
        'make-a-living at the defaults has no passable bar: the row is impossible at eat and the reference wins none of 64',
        () => {
            const v = roleDrillValidity(MAKE_A_LIVING, { trials: 64 });
            expect(v.bar.passable).toBe(false);
            expect(v).toMatchObject({ agreesWithRow: true, valid: false, reference: { wins: 0 } });
        },
        scaleTimeout(120_000),
    );

    it(
        'make-a-living with bites of 400 and a faster sprint: the reference wins all 64, the random brains none',
        () => {
            const v = roleDrillValidity(MAKE_A_LIVING, { trials: 64, config: LIVING });
            expect(v).toMatchObject({ valid: true, reference: { wins: 64 }, random: { wins: 0, trials: 256 } });
        },
        scaleTimeout(120_000),
    );

    it(
        'clear-herd at the defaults: the forager and the scout are valid; the reproducer and the defender rows are impossible at run, yet the reference clears 64 of 64',
        () => {
            const read = (/** @type {string} */ spec) => roleDrillValidity(CLEAR_HERD_BY_SPEC[spec], { trials: 64 });
            expect(HERD_SPECS).toEqual(['forager', 'reproducer', 'scout', 'defender']);
            for (const spec of ['forager', 'scout']) {
                const v = read(spec);
                expect(v).toMatchObject({ valid: true, reference: { wins: 64 } });
                expect(v.random.winShare).toBeLessThan(0.1);
            }
            for (const spec of ['reproducer', 'defender']) {
                const v = read(spec);
                expect(v.bar.passable).toBe(false);
                expect(v).toMatchObject({ agreesWithRow: false, valid: false, reference: { wins: 64 } });
            }
        },
        scaleTimeout(120_000),
    );
});
