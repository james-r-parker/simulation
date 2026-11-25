import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { createPreStep5Config, preStep5 } from '../helpers/pre-step5.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { SPEC } from '../../js/sim/specs.js';
import { preStep5Arena } from '../helpers/pre-step5.js';
import { layerArena } from '../../js/evo/drill-body-rules.js';
import {
    PARKED_GAP,
    QUIET_TICKS,
    WARN_HERD,
    WARN_ROW,
    lostReason,
    scoutReference,
    warnPlan,
} from '../../js/evo/drill-role-warn.js';
import { ROLE_ARENA } from '../../js/evo/drill-role-staging.js';
import { drillSubject, randomBrains } from '../../js/evo/drill.js';
import { playTrial } from '../../js/evo/memory-probe-run.js';
import { playWarning } from '../../js/evo/role-scenes-warn.js';

const CONFIG = layerArena(preStep5(), ROLE_ARENA);
const mute = { name: 'mute', id: 0, spec: SPEC.SCOUT, weights: null, act: () => {} };
/** A scout that holds ALARM on from the first tick, whatever it sees. */
const spammer = { name: 'spammer', id: 0, spec: SPEC.SCOUT, weights: null, act: lateCaller(0) };

/**
 * @param {import('../../js/evo/memory-probe-run.js').Subject} subject the scout
 * @param {{angle: number, side: 1 | -1}} at the plan's heading and side
 * @returns {{won: boolean, trace: Record<string, any>}} the trial
 */
function play(subject, at) {
    const plan = warnPlan(createConfig(CONFIG), at);
    const won = playTrial({ plan, subject, controlSpec: { name: 'intact' }, seed: 1, config: CONFIG });
    return { won, trace: /** @type {any} */ (plan.trace)(won) };
}

describe('the warn-herd drill', () => {
    it('is the scout drill of the row scout:predator, in the role arena', () => {
        expect(WARN_HERD).toMatchObject({
            name: 'warn-herd',
            spec: SPEC.SCOUT,
            row: WARN_ROW,
            scene: "Call, or don't",
        });
        expect(WARN_HERD.needsHunter).toBe(false);
        expect(WARN_HERD.arena).toBe(ROLE_ARENA);
    });

    it('parks the hunter far behind the forager while the field is empty, and the scene starts where it appears', () => {
        const plan = WARN_HERD.plan(fork(createRng(1), 'drill:warn-herd'), 400, createPreStep5Config(ROLE_ARENA));
        const [hunter, forager, scout] = /** @type {any[]} */ (plan.stage.agents);
        expect([hunter.role, forager.role, scout.role]).toEqual(['stalker', 'herd', 'subject']);
        expect([hunter.spec, forager.spec, scout.spec]).toEqual([SPEC.PREDATOR, SPEC.FORAGER, SPEC.SCOUT]);
        const dist = (/** @type {any} */ a, /** @type {any} */ b) => Math.hypot(a.x - b.x, a.y - b.y);
        expect(dist(hunter, forager)).toBeCloseTo(PARKED_GAP + 445, 0);
        expect(plan.maxTicks).toBe(QUIET_TICKS + 500);
    });

    it('stages the forager side-on to the hunter and the scout facing it, as the scene of playWarning', () => {
        const plan = warnPlan(createPreStep5Config(ROLE_ARENA), { angle: 0, side: 1 });
        const [, forager, scout] = /** @type {any[]} */ (plan.stage.agents);
        const hunter = { x: forager.x - 445, y: forager.y };
        const dist = (/** @type {any} */ a, /** @type {any} */ b) => Math.hypot(a.x - b.x, a.y - b.y);
        expect(dist(hunter, scout)).toBeCloseTo(445, 6);
        // the scene stands the scout 150 px to the side of the forager's line, as far from the hunter as the forager is
        expect(dist(scout, forager)).toBeCloseTo(Math.hypot(445 - Math.sqrt(445 ** 2 - 150 ** 2), 150), 0);
    });

    it('plays the scene of playWarning for the oracle scout, a quiet start later: the same hearing and first move', () => {
        const scene = playWarning(preStep5Arena(), { reaction: 2, threshold: 0.1, side: 150, goAt: 5 });
        for (const [angle, side] of /** @type {[number, 1 | -1][]} */ ([
            [0, 1],
            [2.2, -1],
        ])) {
            const { won, trace } = play(scoutReference(), { angle, side });
            expect(won).toBe(!scene.outcome.caught);
            // the hunter appears at tick QUIET_TICKS, and the scout sees it on the tick after
            const late = QUIET_TICKS + 1;
            expect(trace).toEqual({
                heardTick: scene.ticks.heardTick + late,
                startTick: scene.ticks.startTick + late,
                reason: null,
            });
        }
        expect(scene.outcome.caught).toBe(false);
    });

    it('is lost by a scout that never calls: the forager does not move and is killed', () => {
        const { won, trace } = play(mute, { angle: 0, side: 1 });
        expect(won).toBe(false);
        expect(trace).toEqual({ heardTick: -1, startTick: -1, reason: 'no-warning' });
    });

    it('is lost by a scout that holds ALARM on: it calls with no hunter there, and says so', () => {
        const { won, trace } = play(spammer, { angle: 0, side: 1 });
        expect(won).toBe(false);
        expect(trace.reason).toBe('false-alarm');
        expect(trace.startTick).toBe(-1);
    });

    it('is lost by a scout that calls once in the quiet and never again', () => {
        const first = {
            ...mute,
            act: (/** @type {any} */ w) => (w.tick === 3 ? lateCaller(0)(w) : lateCaller(9999)(w)),
        };
        expect(play(first, { angle: 0, side: 1 }).trace.reason).toBe('false-alarm');
    });

    it('is lost by a scout whose warning comes too late to save the forager, and says so', () => {
        const slow = { ...mute, act: lateCaller(QUIET_TICKS + 62) };
        const { won, trace } = play(slow, { angle: 0, side: 1 });
        expect(won).toBe(false);
        expect(trace.reason).toBe('caught');
        expect(trace.heardTick).toBeGreaterThan(0);
    });

    it('is won by the reference and not by every random brain, and replays from its seed', () => {
        const a = drillSubject(WARN_HERD, scoutReference(), { trials: 4, seed: 3, config: preStep5() });
        expect(a.wins).toBe(4);
        expect(drillSubject(WARN_HERD, scoutReference(), { trials: 4, seed: 3, config: preStep5() })).toEqual(a);
        const wins = randomBrains(WARN_HERD, { config: preStep5() }).map(
            (brain) => drillSubject(WARN_HERD, brain, { trials: 4, config: preStep5() }).wins,
        );
        expect(wins.reduce((sum, w) => sum + w, 0)).toBeLessThan(16);
    });

    it('is won by a scout that holds ALARM on in no trial, and by one that never calls in none', () => {
        expect(drillSubject(WARN_HERD, spammer, { trials: 6, seed: 3, config: preStep5() }).wins).toBe(0);
        expect(drillSubject(WARN_HERD, mute, { trials: 6, seed: 3, config: preStep5() }).wins).toBe(0);
    });
});

describe('lostReason', () => {
    it('names a false alarm first, then a caught forager that heard, then no warning', () => {
        expect(lostReason({ alarm: true, falseAlarm: true })).toBe('false-alarm');
        expect(lostReason({ alarm: true, falseAlarm: false })).toBe('caught');
        expect(lostReason({ alarm: false, falseAlarm: false })).toBe('no-warning');
    });
});

/**
 * @param {number} reaction the ticks from seeing the hunter to calling
 * @returns {(world: Record<string, any>) => void} a scout that calls alarm `reaction` ticks after the hunter is in view
 */
function lateCaller(reaction) {
    return (world) => {
        const row = 2 * OUTPUT_COUNT;
        world.outputs.fill(0, row, row + OUTPUT_COUNT);
        if (world.tick >= reaction) {
            world.outputs[row + OUTPUT_INDEX.ALARM] = 1;
        }
    };
}
