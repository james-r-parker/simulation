// Who an alarm call reaches (alarm-calls.md, Detectors): the hearers of a call, split by `canHunt`, and the honest calls
// per 1000 non-hunter agent-ticks, on hand-built worlds.

import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../../js/evo/metrics.js';
import { createAlarmReach, noteAlarmReach } from '../../js/evo/observer-alarm-reach.js';
import { observeCombat } from '../../js/evo/observer-combat.js';
import { EVENT_TYPE } from '../../js/sim/events.js';
import { HEARD_STRIDE } from '../../js/sim/world.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { nextTick, observed, pushCall } from './helpers/observer-world.js';

const read = (/** @type {any} */ r, /** @type {string} */ name) => computeMetrics(r.observer, r.world)[`eval.${name}`];

/** A world with a caller at (500, 500), two prey hearers, one hunter hearer, one out of range and one that is deaf. */
function scene() {
    const r = observed({ maxAgents: 16 });
    const { world, observer } = r;
    const radius = world.config.callRadius;
    const caller = addBlob(world);
    const near = [addBlob(world), addBlob(world)];
    const hunter = addBlob(world);
    const far = addBlob(world);
    const deaf = addBlob(world);
    world.spec[hunter] = 1;
    observer.combat.hunterSpec[1] = 1;
    world.x[far] = 500 + radius + 5;
    for (const s of [...near, hunter, far]) {
        world.heard[s * HEARD_STRIDE] = 0.5;
    }
    world.x[deaf] = 510;
    return { ...r, caller, deaf, radius };
}

function call(/** @type {any} */ r, /** @type {number} */ tick) {
    nextTick(r.world, tick);
    pushCall(r.world, EVENT_TYPE.ALARM_CALLED, r.caller);
    observeCombat(r.observer.combat, r.world, r.observer.intent);
}

describe('eval.alarm_hearers_per_call and eval.alarm_hunter_hearers_per_call', () => {
    it('are null with no call', () => {
        const r = scene();
        expect(read(r, 'alarm_hearers_per_call')).toEqual({ value: null, reason: 'no alarm call' });
        expect(read(r, 'alarm_hunter_hearers_per_call').value).toBeNull();
    });

    it('count the hearers inside callRadius, prey and hunters apart, leaving out the caller, the deaf and the far', () => {
        const r = scene();
        noteAlarmReach(r.observer.combat.alarmReach, {
            hunterSpec: r.observer.combat.hunterSpec,
            world: r.world,
            caller: r.caller,
        });
        expect(read(r, 'alarm_hearers_per_call').value).toBe(2);
        expect(read(r, 'alarm_hunter_hearers_per_call').value).toBe(1);
    });

    it('average over calls', () => {
        const reach = createAlarmReach();
        reach.calls = 4;
        reach.hearers = 6;
        reach.hunterHearers = 1;
        const r = scene();
        r.observer.combat.alarmReach = reach;
        expect(read(r, 'alarm_hearers_per_call').value).toBe(1.5);
        expect(read(r, 'alarm_hunter_hearers_per_call').value).toBe(0.25);
    });

    it('are fed by AlarmCalled events through the combat counters', () => {
        const r = scene();
        call(r, 5);
        expect(r.observer.combat.alarmReach.calls).toBe(1);
        expect(r.observer.combat.alarmReach.hearers).toBe(2);
    });
});

describe('eval.alarm_calls_with_threat_per_1k', () => {
    it('is the calls made with a threat sighting per 1000 non-hunter agent-ticks', () => {
        const r = scene();
        r.observer.agentTicks = 3000;
        r.observer.combat.hunterAgentTicks = 1000;
        r.observer.intent.run.alarms = 9;
        r.observer.intent.run.alarmsPrecise = 4;
        expect(read(r, 'alarm_calls_with_threat_per_1k').value).toBe(2);
    });

    it('is null with no agent-ticks', () => {
        const r = scene();
        expect(read(r, 'alarm_calls_with_threat_per_1k').value).toBeNull();
    });
});
