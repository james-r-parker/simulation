// Source tests, intent family, calls and smoke (docs/designs/metric-trust.md, T17): `metrics-intent.js` and
// `observer-alarm-reach.js` read on the real `step`. A cue (a threat, or prey) is current for `INTENT_WINDOW` (30) ticks
// after the caller's last sighting of it; a caller's base rate is its cue ticks over its alive ticks, so a caller that
// sees the cue from birth, calls, and then loses it for `HIDDEN` ticks has HIDDEN - 30 ticks off cue. Bodies sit left of
// the simple world's wall at x 500; a body parked at (900, y) is out of sight.

import { describe, expect, it } from 'vitest';
import { OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { FORAGER, PREDATOR, biteStep, chaseSteps, huntRun, park, pose } from './helpers/hunt-scene.js';

const STILL = { maturityTicks: 100000 };
const WINDOW = 30;
const HIDDEN = 60;

/**
 * Steps `ticks` times, re-posing the bodies before each step and wanting `output` of `caller` on step `callAt`.
 * @param {any} run the run
 * @param {{ticks: number, poses: () => void, caller?: number, output?: number, callAt?: number}} plan the steps
 * @returns {void}
 */
function steps(run, { ticks, poses, caller = -1, output = 0, callAt = -1 }) {
    for (let t = 0; t < ticks; t++) {
        poses();
        if (t === callAt) {
            run.want(caller, output);
        }
        run.tick();
        if (t === callAt) {
            run.release(caller, output);
        }
    }
}

/**
 * A caller at (200, 600) with two foragers and a hunter within `callRadius`: it calls an alarm on its 10th step with the
 * hunter in sight (or, `blind`, with the hunter out of sight throughout), then the hunter is gone for `HIDDEN` steps.
 * @param {{blind?: boolean}} [options] whether the caller never sees the hunter
 */
function alarmRun({ blind = false } = {}) {
    const { run, world, spawn } = huntRun({ over: STILL });
    run.tick();
    const near = /** @type {[number, number]} */ ([200, 500]);
    const hunter = spawn(PREDATOR, 0, { at: blind ? [900, 100] : near });
    const others = [spawn(FORAGER, 0, { at: [320, 600] }), spawn(FORAGER, 0, { at: [80, 600] })];
    const caller = spawn(FORAGER, 0, { at: [200, 600] });
    const hold = (/** @type {boolean} */ seen) => () => {
        pose(world, hunter, seen ? near : [900, 100]);
        pose(world, caller, [200, 600]);
        pose(world, others[0], [320, 600]);
        pose(world, others[1], [80, 600]);
        [hunter, caller, ...others].forEach((s) => (world.energy[s] = 800));
    };
    steps(run, { ticks: 10, poses: hold(!blind), caller, output: OUTPUT_INDEX.ALARM, callAt: 9 });
    steps(run, { ticks: HIDDEN, poses: hold(false) });
    return { m: run.metrics(), alive: run.observer.intent.aliveTicks[caller], observer: run.observer };
}

describe('alarm_lift and alarm_calls_with_threat_per_1k', () => {
    it('read a call made on a threat seen from birth: lift 1 minus the base, (alive - (alive - 30)) / alive', () => {
        const { m, alive, observer } = alarmRun();
        expect(alive).toBe(10 + HIDDEN); // every step after its birth; the birth observe is not an alive tick
        expect(m['eval.alarm_lift'].value).toBeCloseTo((HIDDEN - WINDOW) / alive, 12);
        const prey = observer.agentTicks - observer.combat.hunterAgentTicks;
        expect(m['eval.alarm_calls_with_threat_per_1k'].value).toBeCloseTo(1000 / prey, 12);
    });

    it('read a call made with no threat in sight as lift 0 and no precise call', () => {
        const { m } = alarmRun({ blind: true });
        expect(m['eval.alarm_lift']).toEqual({ value: 0 });
        expect(m['eval.alarm_calls_with_threat_per_1k']).toEqual({ value: 0 });
    });
});

describe('alarm_hearers_per_call and alarm_hunter_hearers_per_call', () => {
    it('count the two foragers and the hunter inside callRadius that hear the call', () => {
        const { m } = alarmRun();
        expect(m['eval.alarm_hearers_per_call']).toEqual({ value: 2 });
        expect(m['eval.alarm_hunter_hearers_per_call']).toEqual({ value: 1 });
    });

    it('count only the foragers once the hunter is out of reach', () => {
        const { m } = alarmRun({ blind: true });
        expect(m['eval.alarm_hearers_per_call']).toEqual({ value: 2 });
        expect(m['eval.alarm_hunter_hearers_per_call']).toEqual({ value: 0 });
    });
});

describe('idle_signals_per_1k', () => {
    it('counts the one call made without its cue, per 1000 agent-ticks', () => {
        const { m, observer } = alarmRun({ blind: true });
        expect(m['eval.idle_signals_per_1k'].value).toBeCloseTo(1000 / observer.agentTicks, 12);
        expect(alarmRun().m['eval.idle_signals_per_1k']).toEqual({ value: 0 });
    });
});

describe('hunt_call_answer and hunt_call_lift', () => {
    /**
     * Hunter A at (200, 600) sees a forager from birth and calls a hunt on its 10th step; hunter B, of A's lineage and
     * inside callRadius, then chases the forager and bites it (unless `unanswered`), a bite the observer's own tracker
     * judges deliberate; the forager is then hidden for packWindow + 5 steps.
     * @param {{unanswered?: boolean}} [options] whether B never bites
     */
    function huntCallRun({ unanswered = false } = {}) {
        const { run, world, spawn } = huntRun({ over: STILL });
        run.tick();
        const prey = spawn(FORAGER, 0, { at: [200, 500] });
        // the caller spawns last: an observe while it is alive but before it has sensed would be an alive tick off cue
        const helper = spawn(PREDATOR, 0, { at: [120, 650] });
        const caller = spawn(PREDATOR, 0, { at: [200, 600, -Math.PI / 2], lineage: world.lineageId[helper] });
        const hold = () => {
            pose(world, caller, [200, 600, -Math.PI / 2]); // facing the prey, so it is ahead
            [prey, helper, caller].forEach((s) => (world.energy[s] = 800));
        };
        steps(run, {
            ticks: 10,
            poses: () => (hold(), pose(world, prey, [200, 500]), pose(world, helper, [120, 650])),
            caller,
            output: OUTPUT_INDEX.HUNT,
            callAt: 9,
        });
        if (!unanswered) {
            chaseSteps(run, { hunter: helper, prey, outcome: 'escaped' });
        }
        // the caller sees the prey alone for 3 steps (during the chase the helper can stand in its line of sight)
        steps(run, { ticks: 3, poses: () => (hold(), pose(world, prey, [200, 500]), park(world, helper, 300)) });
        const lastSeen = world.tick;
        const after = world.config.packWindow + 5;
        steps(run, { ticks: after, poses: () => (hold(), park(world, prey, 100), park(world, helper, 300)) });
        const offCue = world.tick - lastSeen - WINDOW;
        return { m: run.metrics(), offCue, alive: run.observer.intent.aliveTicks[caller] };
    }

    it('read an answered call as 1 and an unanswered one as 0', () => {
        expect(huntCallRun().m['eval.hunt_call_answer']).toEqual({ value: 1 });
        expect(huntCallRun({ unanswered: true }).m['eval.hunt_call_answer']).toEqual({ value: 0 });
    });

    it('read a call made with prey in sight from birth as 1 minus the base: off-cue ticks over alive ticks', () => {
        const { m, offCue, alive } = huntCallRun();
        expect(offCue).toBeGreaterThan(0);
        expect(m['eval.hunt_call_lift'].value).toBeCloseTo(offCue / alive, 12);
    });
});

describe('smoke_precision', () => {
    /** @param {boolean[]} bitten for each forager that releases smoke, whether a hunter bit it first */
    function smokeRun(bitten) {
        const { run, world, spawn } = huntRun({ over: STILL });
        run.tick();
        const hunter = spawn(PREDATOR, 0, { at: [900, 800] });
        bitten.forEach((wasBitten, i) => {
            const prey = spawn(FORAGER, 0, { at: [100, 100 + 100 * i] });
            if (wasBitten) {
                biteStep(run, hunter, prey);
                park(world, hunter, 800);
                pose(world, prey, [100, 100 + 100 * i]);
            }
            for (let t = 0; t < WINDOW + 2 && !wasBitten; t++) {
                run.tick(); // no threat seen for longer than INTENT_WINDOW
            }
            run.want(prey, OUTPUT_INDEX.SMOKE);
            run.tick();
            run.release(prey, OUTPUT_INDEX.SMOKE);
        });
        return run.metrics();
    }

    it('reads the releases made while recently bitten or with a threat in sight: 0, 1/2 and 1', () => {
        expect(smokeRun([false])['eval.smoke_precision']).toEqual({ value: 0 });
        expect(smokeRun([true, false])['eval.smoke_precision']).toEqual({ value: 0.5 });
        expect(smokeRun([true])['eval.smoke_precision']).toEqual({ value: 1 });
        expect(smokeRun([])['eval.smoke_precision']).toEqual({ value: null, reason: 'no smoke release' });
    });
});
