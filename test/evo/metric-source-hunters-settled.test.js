// Source tests, the settled hunter metrics (metric-noise.md D3): the real `step` on a scripted hunting world, read both
// whole-run and from `BURN_IN_TICKS`. Hunter D is a juvenile that starves before burn-in. Hunter A kills three foragers (one
// before burn-in, two after, one of those by chance) and starves at age 4000 after burn-in. Hunter B is born after burn-in and
// starves a juvenile. Only A and B, and the two kills after burn-in, are settled.

import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { starve } from './helpers/source-world.js';
import { FORAGER, PREDATOR, huntRun, killStep, park } from './helpers/hunt-scene.js';

/** @returns {{m: Record<string, any>, combat: Record<string, any>, before: number}} the metrics, the counters and the hunter ticks before burn-in */
function scriptedRun() {
    const { run, world, spawn } = huntRun({ runTicks: BURN_IN_TICKS + 400 });
    const d = spawn(PREDATOR, BORN_CAUSE.FLOOR);
    park(world, d, 100);
    run.tick((w) => starve(w, d, 10));
    run.jump(100);
    const a = spawn(PREDATOR, BORN_CAUSE.FLOOR);
    killStep(run, a, spawn(FORAGER), { age: 50 });
    const before = run.observer.combat.hunterAgentTicks;
    run.jump(BURN_IN_TICKS);
    killStep(run, a, spawn(FORAGER), { age: 100 });
    killStep(run, a, spawn(FORAGER), { deliberate: false });
    const b = spawn(PREDATOR, BORN_CAUSE.FLOOR);
    park(world, b, 100);
    run.tick((w) => starve(w, b, 10));
    run.tick((w) => starve(w, a, 4000));
    return { m: run.metrics(), combat: run.observer.combat, before };
}

const { m, combat, before } = scriptedRun();

describe('hunter_catches_per_1k_settled', () => {
    it('counts the two hunter kills after burn-in over the hunter ticks after burn-in, the whole-run metric all three', () => {
        expect(combat.huntKills).toBe(3);
        expect(combat.settledHuntKills).toBe(2);
        expect(combat.settledHunterAgentTicks).toBe(combat.hunterAgentTicks - before);
        expect(m['eval.hunter_catches_per_1k_settled'].value).toBeCloseTo(
            (2 * 1000) / combat.settledHunterAgentTicks,
            9,
        );
        expect(m['eval.hunter_catches_per_1k'].value).toBeCloseTo((3 * 1000) / combat.hunterAgentTicks, 9);
    });
});

describe('pursuit_kill_share_settled', () => {
    it('reads one deliberate kill of the two after burn-in, the whole run two of three', () => {
        expect(m['eval.pursuit_kill_share_settled']).toEqual({ value: 0.5 });
        expect(m['eval.pursuit_kill_share'].value).toBeCloseTo(2 / 3, 12);
    });
});

describe('hunter_kills_per_life_mean_settled and hunter_juvenile_death_share_settled', () => {
    it('leave out the hunter that died before burn-in: A and B after, kills 2 and 0, one juvenile of two', () => {
        expect(m['eval.hunter_kills_per_life_mean_settled']).toEqual({ value: 1 });
        expect(m['eval.hunter_kills_per_life_mean'].value).toBeCloseTo(2 / 3, 12);
        expect(m['eval.hunter_juvenile_death_share_settled']).toEqual({ value: 0.5 });
        expect(m['eval.hunter_juvenile_death_share'].value).toBeCloseTo(2 / 3, 12);
    });

    it('are null without a hunter life after burn-in', () => {
        const { run, world, spawn } = huntRun({ runTicks: BURN_IN_TICKS + 400 });
        const d = spawn(PREDATOR, BORN_CAUSE.FLOOR);
        park(world, d, 100);
        run.tick((w) => starve(w, d, 10));
        const quiet = run.metrics();
        expect(quiet['eval.hunter_kills_per_life_mean_settled'].value).toBeNull();
        expect(quiet['eval.hunter_juvenile_death_share_settled'].value).toBeNull();
        expect(quiet['eval.hunter_catches_per_1k_settled'].value).toBeNull();
        expect(quiet['eval.pursuit_kill_share_settled'].value).toBeNull();
    });
});
