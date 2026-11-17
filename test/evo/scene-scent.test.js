import { describe, expect, it } from 'vitest';
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
        vision: new Float32Array([1]),
        visionBySpec: new Float32Array([100]),
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
