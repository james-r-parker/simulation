import { describe, expect, it } from 'vitest';
import { preStep5Arena } from '../helpers/pre-step5.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { warnCheck } from '../../js/evo/role-budget-warn-check.js';

describe('warnCheck at the defaults', () => {
    const { readings, drift } = warnCheck(preStep5Arena(), MODEL_DEFAULTS);

    it('reads the alarm, the hearing, the first move, the gaps, the no-flattery sign and the effort-1 sign, with no drift', () => {
        expect(drift).toBe(0);
        expect(readings.map((r) => r.what)).toEqual([
            'alarm tick',
            'forager hears',
            'forager moves',
            'gap when the forager moves',
            'gap when the forager has turned and runs',
            'a forager the formula calls safe is safe in the sim: the formula never flatters it',
            "at effort 1, the oracle hunter's, the formula and the sim agree on whether the forager is caught",
        ]);
        expect(readings.every((r) => r.row === 'scout:predator')).toBe(true);
    });

    it('puts the formula beside the scene, with the tolerance in words', () => {
        const [alarm, , , gap] = readings;
        expect([alarm.formula, alarm.scene, alarm.tolerance, alarm.drift]).toEqual([2, 2, '0 ticks', false]);
        expect([gap.formula, gap.tolerance]).toEqual([405, '1 px']);
    });

    it('has the formula read the gap of the turned forager, which has gained on the hunter, to the sim within 1 px', () => {
        const turned = readings.find((r) => r.what === 'gap when the forager has turned and runs');
        expect(turned?.tolerance).toBe('1 px');
        expect(turned?.drift).toBe(false);
        expect(turned?.formula).toBeCloseTo(314.64, 1);
        expect(turned?.formula).toBeGreaterThan(289.06 + 20);
    });

    it('reads the sign at effort 1 both ways: the formula and the sim both say the forager escapes at the defaults', () => {
        const read = readings.find((r) => r.what.startsWith('at effort 1'));
        expect([read?.formula, read?.scene, read?.tolerance, read?.drift]).toEqual([true, true, 'agree', false]);
    });

    it('flags a reading outside its tolerance: a scout that sees a tick late no longer matches the scene', () => {
        const late = warnCheck(preStep5Arena(), { ...MODEL_DEFAULTS, reactionTicks: 3 });
        expect(late.drift).toBe(0);
        const slow = warnCheck(preStep5Arena({ specialisations: { scout: { visionRange: 380 } } }), MODEL_DEFAULTS);
        expect(slow.readings[0].formula).toBe(slow.readings[0].scene);
    });
});
