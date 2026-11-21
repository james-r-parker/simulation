// Gate 2 of fair-chase.md, "Before any training": the scout's metrics against the planted warning of role-budget.md Phase 3
// (docs/designs/metric-noise.md, Phase 6, T21). A hunter stands, a scout calls alarm, a forager beside the scout runs from the
// hunter once it hears, and a forager out of earshot stands, played under the eval observer (`playAlarmScene`). The truth is
// read from the world's own speeds and the geometry of the scene, never from the metrics.

import { describe, expect, it } from 'vitest';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { ROLE_METRICS } from '../../js/evo/metric-registry/roles.js';
import { ALARM_RESPONSE_TICKS } from '../../js/evo/observer-combat.js';
import { playAlarmScene } from './helpers/role-scene-alarm.js';

const LIFT = 'eval.alarm_lift';
const RESPONSE = 'eval.alarm_response';
const LEAD = 'eval.scout_alarm_lead_share';
const config = arenaConfig({ seed: 1 });
/** A hunter far from the scout, that appears in its view at tick 100 and stands there. */
const APPEARS = { gap: 3000, appearAt: 100, ticks: 300 };
/** One call, scored ten ticks later: the hunter stands in the scout's view from the start. */
const ONE_CALL = { call: /** @type {const} */ ('sees'), ticks: 200, untilScored: true };

/**
 * @param {ReturnType<typeof playAlarmScene>} run a played scene that scored one call
 * @returns {number} the speed the forager beside the scout gained in the ten ticks after the call, less what the forager out of
 *   earshot gained, over `maxVelocity`: what `eval.alarm_response` reads
 */
function planted(run) {
    const gain = (/** @type {number[]} */ speeds) =>
        speeds[run.firstCall + ALARM_RESPONSE_TICKS - 1] - speeds[run.firstCall - 1];
    return (gain(run.hearer) - gain(run.control)) / config.maxVelocity;
}

describe('the scout metrics against a planted warning', { timeout: scaleTimeout(60_000) }, () => {
    describe('alarm_lift', () => {
        const calls = playAlarmScene({ ...APPEARS, call: 'sees' });
        const blind = playAlarmScene({ gap: 3000, call: 'always', ticks: 400 });
        const always = playAlarmScene({ gap: 3000, appearAt: 300, call: 'always', ticks: 600 });
        const never = playAlarmScene({ ...APPEARS, call: 'never' });

        it('plants calls on the threat in one scene, and calls with none in sight in another', () => {
            expect(calls.firstCall).toBeGreaterThan(100);
            expect(calls.sightTicks).toBe(201);
            expect(blind.firstCall).toBeGreaterThan(0);
            expect(blind.sightTicks).toBe(0);
            expect(never.firstCall).toBe(-1);
        });

        it("reads the share of the scout's time out of sight when every call is made on the threat", () => {
            expect(calls.metrics[LIFT].value).toBeCloseTo(1 - calls.sightTicks / calls.ticks, 9);
        });

        it('reads 0 for a scout that sees the hunter the whole time it calls', () => {
            expect(playAlarmScene({ gap: 300, ...ONE_CALL }).metrics[LIFT].value).toBe(0);
        });

        it('reads 0 for calls with nothing in sight, and near 0 for calls made whatever the scout sees', () => {
            expect(blind.metrics[LIFT].value).toBe(0);
            expect(Math.abs(always.metrics[LIFT].value)).toBeLessThan(0.1);
            expect(always.metrics[LIFT].value).toBeLessThan(calls.metrics[LIFT].value / 2);
        });

        it('has no reading for a scout that never calls', () => {
            expect(never.metrics[LIFT].value).toBeNull();
        });
    });

    describe('alarm_response', () => {
        const hears = playAlarmScene({ gap: 300, ...ONE_CALL });
        const ignores = playAlarmScene({ gap: 300, ...ONE_CALL, flees: false });

        it('is the speed the forager that hears the call gains, less the one out of earshot, over maxVelocity', () => {
            expect(planted(hears)).toBeGreaterThan(0.5);
            expect(hears.metrics[RESPONSE].value).toBeCloseTo(planted(hears), 2);
        });

        it('reads 0 when the forager that hears the call does not move', () => {
            expect(planted(ignores)).toBe(0);
            expect(ignores.metrics[RESPONSE].value).toBe(0);
        });

        it('has no reading when no call is made', () => {
            expect(playAlarmScene({ gap: 300, call: 'never', ticks: 50 }).metrics[RESPONSE].value).toBeNull();
        });
    });

    describe('scout_alarm_lead_share', () => {
        const ahead = playAlarmScene({ gap: 300, ...ONE_CALL });
        const late = playAlarmScene({ gap: 100, ...ONE_CALL });

        it('plants a call with the hunter beyond half the call radius, and one with it inside', () => {
            expect(300).toBeGreaterThanOrEqual(0.5 * config.callRadius);
            expect(100).toBeLessThan(0.5 * config.callRadius);
        });

        it('reads 1 when the scout calls while the hunter is still far, and 0 when it calls with the hunter on it', () => {
            expect(ahead.metrics[LEAD].value).toBe(1);
            expect(late.metrics[LEAD].value).toBe(0);
        });

        it('has no reading for calls the scout made with the hunter out of its sight, or for none', () => {
            expect(playAlarmScene({ gap: 3000, call: 'always', ticks: 400 }).metrics[LEAD].value).toBeNull();
            expect(playAlarmScene({ gap: 300, call: 'never', ticks: 50 }).metrics[LEAD].value).toBeNull();
        });
    });

    it('reads every scout metric of the role table', () => {
        const run = playAlarmScene({ gap: 300, ...ONE_CALL });
        for (const name of ROLE_METRICS.scout) {
            expect(Object.hasOwn(run.metrics, name)).toBe(true);
        }
    });
});
