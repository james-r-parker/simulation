import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { SPEC } from '../../js/sim/specs.js';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { layerArena } from '../../js/evo/drill-body-rules.js';
import { WARN_HERD, WARN_ROW, scoutReference, warnPlan } from '../../js/evo/drill-role-warn.js';
import { ROLE_ARENA } from '../../js/evo/drill-role-staging.js';
import { drillSubject, randomBrains } from '../../js/evo/drill.js';
import { playTrial } from '../../js/evo/memory-probe-run.js';
import { playWarning } from '../../js/evo/role-scenes-warn.js';

const CONFIG = layerArena({}, ROLE_ARENA);
const mute = { name: 'mute', id: 0, spec: SPEC.SCOUT, weights: null, act: () => {} };

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

    it('stages the hunter, the forager side-on to it and the scout facing the hunter, as the scene of playWarning', () => {
        const plan = WARN_HERD.plan(fork(createRng(1), 'drill:warn-herd'), 400, createConfig(ROLE_ARENA));
        const [hunter, forager, scout] = /** @type {any[]} */ (plan.stage.agents);
        expect([hunter.role, forager.role, scout.role]).toEqual(['stalker', 'herd', 'subject']);
        expect([hunter.spec, forager.spec, scout.spec]).toEqual([SPEC.PREDATOR, SPEC.FORAGER, SPEC.SCOUT]);
        const dist = (/** @type {any} */ a, /** @type {any} */ b) => Math.hypot(a.x - b.x, a.y - b.y);
        expect(dist(hunter, forager)).toBeCloseTo(445, 0);
        expect(dist(hunter, scout)).toBeCloseTo(445, 6);
        // the scene stands the scout 150 px to the side of the forager's line, as far from the hunter as the forager is
        expect(dist(scout, forager)).toBeCloseTo(Math.hypot(445 - Math.sqrt(445 ** 2 - 150 ** 2), 150), 0);
    });

    it('plays the scene of playWarning for the oracle scout: the same alarm, hearing and first move, and a forager that lives', () => {
        const scene = playWarning(arenaConfig(), { reaction: 2, threshold: 0.1, side: 150, goAt: 5 });
        for (const [angle, side] of /** @type {[number, 1 | -1][]} */ ([
            [0, 1],
            [2.2, -1],
        ])) {
            const { won, trace } = play(scoutReference(), { angle, side });
            expect(won).toBe(!scene.outcome.caught);
            expect(trace).toEqual({ heardTick: scene.ticks.heardTick, startTick: scene.ticks.startTick, reason: null });
        }
        expect(scene.outcome.caught).toBe(false);
    });

    it('is lost by a scout that never calls: the forager does not move and is killed', () => {
        const { won, trace } = play(mute, { angle: 0, side: 1 });
        expect(won).toBe(false);
        expect(trace).toEqual({ heardTick: -1, startTick: -1, reason: 'no-warning' });
    });

    it('is lost by a scout whose warning comes too late to save the forager, and says so', () => {
        const slow = { ...mute, act: lateCaller(62) };
        const { won, trace } = play(slow, { angle: 0, side: 1 });
        expect(won).toBe(false);
        expect(trace.reason).toBe('caught');
        expect(trace.heardTick).toBeGreaterThan(0);
    });

    it('is won by the reference and not by every random brain, and replays from its seed', () => {
        const a = drillSubject(WARN_HERD, scoutReference(), { trials: 4, seed: 3 });
        expect(a.wins).toBe(4);
        expect(drillSubject(WARN_HERD, scoutReference(), { trials: 4, seed: 3 })).toEqual(a);
        const wins = randomBrains(WARN_HERD).map((brain) => drillSubject(WARN_HERD, brain, { trials: 4 }).wins);
        // a brain that holds ALARM on wins too: the scene has no quiet trial, so a spammer is not told from a scout
        expect(wins.reduce((sum, w) => sum + w, 0)).toBeLessThan(16);
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
