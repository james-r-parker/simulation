// The sense lanes of the new traits (body-genes T13a): `hearing` in hearOne, the nose's `antennaReach` and
// `refugeSenseRange`, and `smokeSight` in the ray march. Each lane at its base leaves the sense as it was; a body whose
// lane is moved (as a planted gene or a `body` override moves it) senses further.

import { describe, expect, it } from 'vitest';
import { writeBodyInputs } from '../../js/sim/body-inputs.js';
import { BODY_INPUT, RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { signalAll } from '../../js/sim/calls.js';
import { castRays } from '../../js/sim/ray-march.js';
import { writeScentInputs } from '../../js/sim/scent-inputs.js';
import { ringRadius } from '../../js/sim/terrain.js';
import { HEARD_STRIDE } from '../../js/sim/world.js';
import { addAgent, addCloud, addFood, rebuild, senseWorld } from './helpers/sense-world.js';

const CH_FOOD = 1;
const CH_SMOKE = 8;

describe('the hearing lane', () => {
    /**
     * @param {number} hearing the hearer's lane
     * @returns {number} the alarm loudness a hearer 400 from a caller of radius 300 records, the call at 9/10 strength
     */
    function heard(hearing) {
        const w = senseWorld({ callRadius: 300, callTicks: 10 });
        const caller = addAgent(w, 200, 500, 20);
        const hearer = addAgent(w, 600, 500, 20);
        w.alarmTimer[caller] = 10;
        w.lanes.hearing[hearer] = hearing;
        signalAll(w, rebuild(w));
        return w.heard[hearer * HEARD_STRIDE];
    }

    it('hears nothing beyond the caller radius at its base of 1', () => {
        expect(heard(1)).toBe(0);
    });

    it('hears out to the radius times the lane, with loudness 1 - d / (radius x hearing)', () => {
        expect(heard(1.5)).toBe(Math.fround((1 - 400 / 450) * 0.9));
    });
});

describe('the nose lanes', () => {
    it('sample the antennae at the antennaReach lane', () => {
        const w = senseWorld({ antennaAngle: 0, antennaReach: 150 });
        const me = addAgent(w, 500, 500, 20);
        w.danger[5 * 10 + 7] = 0.4; // the 100-unit cell (7, 5), under (720, 500) and not under (650, 500)
        const at = me * w.layout.rawInputCount + w.config.rayCount * RAY_CHANNELS + 17;
        writeScentInputs(w, me);
        expect(w.inputs[at]).toBe(0);
        w.lanes.antennaReach[me] = 220;
        writeScentInputs(w, me);
        expect(w.inputs[at]).toBeCloseTo(0.4, 6);
    });

    it('reach the refuge near input to the refugeSenseRange lane', () => {
        const w = senseWorld({});
        const me = addAgent(w, 500, 500, 25);
        const edge = ringRadius(w.config);
        w.refugeCentres = Float64Array.of(500 + edge + 1.5 * w.config.refugeSenseRange, 500);
        const at = me * w.layout.rawInputCount + w.config.rayCount * RAY_CHANNELS + BODY_INPUT.REFUGE_NEAR;
        writeBodyInputs(w, me);
        expect(w.inputs[at]).toBe(0);
        w.lanes.refugeSenseRange[me] = 3 * w.config.refugeSenseRange;
        writeBodyInputs(w, me);
        expect(w.inputs[at]).toBeCloseTo(0.5, 6);
    });
});

describe('the smokeSight lane', () => {
    /**
     * @param {number} sight the caster's lane
     * @returns {number[]} the forward ray of a caster at 200 with a cloud at 300 and a food at 400 in line
     */
    function forward(sight) {
        const w = senseWorld();
        const me = addAgent(w, 200, 500, 20);
        addCloud(w, 300, 500);
        addFood(w, 400, 500, 20);
        w.lanes.smokeSight[me] = sight;
        castRays(w, rebuild(w), me);
        const base = me * w.layout.rawInputCount;
        return Array.from(w.inputs.subarray(base, base + RAY_CHANNELS));
    }

    it('ends the ray at the cloud at its base of 1', () => {
        const r = forward(1);
        expect([r[CH_FOOD], r[CH_SMOKE]]).toEqual([0, 1]);
    });

    it('lets the ray keep its share above 1 of the remaining reach and report the next hit, the smoke flag still set', () => {
        const r = forward(2);
        expect([r[CH_FOOD], r[CH_SMOKE]]).toEqual([1, 1]);
        expect(r[0]).toBeCloseTo(1 - (400 - 20 - 200) / 300, 6);
    });

    it('keeps the cloud when the next hit lies past the share it passes', () => {
        const r = forward(1.05);
        expect([r[CH_FOOD], r[CH_SMOKE]]).toEqual([0, 1]);
    });
});
