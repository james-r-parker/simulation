import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { CHASE_FLAG, createChaseTally, tallyChase } from '../../js/evo/chase-outcome.js';
import {
    createScentScene,
    notePreySight,
    noteScavengeMeal,
    scentChaseFlags,
    scentMetrics,
    tickScent,
} from '../../js/evo/scene-scent.js';

function world(tick = 100000) {
    return {
        alive: new Uint8Array([1]),
        x: new Float32Array([0]),
        y: new Float32Array([0]),
        tick,
        spec: new Uint8Array([0]),
        lanes: { visionRange: new Float64Array([100]) },
    };
}

describe('scene-scent', () => {
    it('flags a renewed prey sighting after a gap inside the window', () => {
        const scene = createScentScene({ maxAgents: 1 });
        const current = world();
        notePreySight(scene, current, 0);
        current.tick += 2;
        notePreySight(scene, current, 0);
        expect(scentChaseFlags(scene, 0)).toBe(CHASE_FLAG.REACQUIRED);
    });

    it('does not flag a sighting after the reacquisition window', () => {
        const scene = createScentScene({ maxAgents: 1 });
        const current = world();
        notePreySight(scene, current, 0);
        current.tick += 121;
        notePreySight(scene, current, 0);
        expect(scentChaseFlags(scene, 0)).toBe(0);
    });

    it('skips history writes for dead slots', () => {
        const scene = createScentScene({ maxAgents: 2 });
        const current = world();
        current.alive = new Uint8Array([1, 0]);
        current.x = new Float32Array([5, 9]);
        current.y = new Float32Array([3, 9]);
        tickScent(scene, current);
        expect(scene.historyTick[0]).toBe(current.tick);
        expect(scene.historyTick[120]).toBe(-1);
    });

    it('accepts a renewed prey sighting exactly at the reacquisition window', () => {
        const scene = createScentScene({ maxAgents: 1 });
        const current = world();
        notePreySight(scene, current, 0);
        current.tick += 120;
        notePreySight(scene, current, 0);
        expect(scentChaseFlags(scene, 0)).toBe(CHASE_FLAG.REACQUIRED);
    });

    it('measures carcass meals approached from beyond vision range', () => {
        const scene = createScentScene({ maxAgents: 1 });
        const current = world();
        scene.mealSince = current.tick;
        for (const x of [400, 300, 200, 100, 0]) {
            current.x[0] = x;
            tickScent(scene, current);
            current.tick += 1;
        }
        noteScavengeMeal(scene, current, 0);
        expect(scentMetrics(scene, createChaseTally())['eval.scavenge_approach_share']).toEqual({ value: 1 });
    });

    it('does not count a meal approached only within sight or while moving away', () => {
        const scene = createScentScene({ maxAgents: 1 });
        const current = world();
        scene.mealSince = current.tick;
        for (const x of [80, 60, 40, 20, 0]) {
            current.x[0] = x;
            tickScent(scene, current);
            current.tick += 1;
        }
        noteScavengeMeal(scene, current, 0);
        current.x[0] = 300;
        scene.mealSince = current.tick;
        for (const x of [300, 250, 200, 150, 180]) {
            current.x[0] = x;
            tickScent(scene, current);
            current.tick += 1;
        }
        noteScavengeMeal(scene, current, 0);
        expect(scentMetrics(scene, createChaseTally())['eval.scavenge_approach_share']).toEqual({ value: 0 });
    });

    it('ignores movement that predates the carcass', () => {
        const scene = createScentScene({ maxAgents: 1 });
        const current = world();
        for (const x of [400, 300, 200, 100, 0]) {
            current.x[0] = x;
            tickScent(scene, current);
            current.tick += 1;
        }
        scene.mealSince = current.tick;
        noteScavengeMeal(scene, current, 0);
        expect(scentMetrics(scene, createChaseTally())['eval.scavenge_approach_share']).toEqual({ value: 0 });
    });

    it('ignores scavenge meals during burn-in', () => {
        const scene = createScentScene({ maxAgents: 1 });
        noteScavengeMeal(scene, world(BURN_IN_TICKS - 1), 0);
        expect(scene.carcassMeals).toBe(0);
    });

    it('keeps the metric null without chases or carcass meals', () => {
        const scene = createScentScene({ maxAgents: 1 });
        const metrics = scentMetrics(scene, createChaseTally());
        expect(metrics['eval.chase_reacquire_share']?.value).toBeNull();
        expect(metrics['eval.scavenge_approach_share']?.value).toBeNull();
    });

    it('counts chase flags over the shared chase records', () => {
        const scene = createScentScene({ maxAgents: 1 });
        const tally = createChaseTally();
        tallyChase(tally, { outcome: 0, flags: CHASE_FLAG.REACQUIRED });
        tallyChase(tally, { outcome: 1 });
        expect(scentMetrics(scene, tally)['eval.chase_reacquire_share']).toEqual({ value: 0.5 });
    });
});
