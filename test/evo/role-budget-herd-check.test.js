import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { HERD_SCENE_SPECS, HERD_TOLERANCE, herdCheck, herdReadings } from '../../js/evo/role-budget-herd-check.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { playStampede } from '../../js/evo/role-scenes-herd.js';

const world = createConfig({});

describe('herdReadings', () => {
    it('reads four things of a spec: the front, the first trample, the ticks to clear and whether it is trampled', () => {
        const readings = herdReadings(world, MODEL_DEFAULTS, 'forager');
        expect(readings.map((r) => r.what)).toEqual([
            'the front arrives',
            'the first trample, energy',
            'ticks to clear: the formula is an upper bound',
            'a body the formula calls clear is not trampled',
        ]);
        expect(readings.every((r) => r.row === 'forager:herd')).toBe(true);
        expect(readings[0].formula).toBe(59);
        expect(readings[0].scene).toBe(59);
    });

    it('agrees with the sim at the defaults for every spec the scene reads', () => {
        const check = herdCheck(world, MODEL_DEFAULTS);
        expect(check.readings).toHaveLength(4 * HERD_SCENE_SPECS.length);
        expect(check.readings.filter((r) => r.drift)).toEqual([]);
        expect(check.drift).toBe(0);
        expect(HERD_TOLERANCE.warning).toBe(0.1);
    });

    it('reads a body that reacts too late to clear: the sim tramples it where the formula says it is not clear', () => {
        const late = { ...MODEL_DEFAULTS, reactionTicks: 45 };
        const readings = herdReadings(world, late, 'forager');
        expect(readings).toHaveLength(4);
        expect(readings[3].formula).toBe(true);
        expect(readings[3].scene).toBe(true);
        // At a cruise the late body is trampled (two tramples in the sim): the formula's "not clear" is borne out by the sim.
        const ran = playStampede(world, {
            spec: 'forager',
            facing: 'away',
            run: true,
            sprint: false,
            reaction: late.reactionTicks,
        });
        expect(ran.outcome.tramples).toBeGreaterThan(0);
    });

    it('reads only the specs asked for', () => {
        expect(herdCheck(world, MODEL_DEFAULTS, { specs: ['scout'] }).readings).toHaveLength(4);
    });
});
