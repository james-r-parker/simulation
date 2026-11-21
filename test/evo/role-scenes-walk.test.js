import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { playDefenderSmoke } from '../../js/evo/role-scenes-smoke.js';
import { walkerBrain } from '../../js/evo/role-scenes-walk.js';
import { roleParams } from '../../js/evo/role-budget-params.js';

const STANDING = -Math.PI / 2;

describe('playDefenderSmoke with a walking defender', () => {
    const WALK = { reaction: 2, threshold: 0.1, standing: STANDING, walk: { side: 150 } };

    it('hears at the same tick, walks, stops facing the caller and releases once still, far later than a defender standing there', () => {
        const run = playDefenderSmoke(arenaConfig(), WALK);
        expect(run.ticks.heardTick).toBe(3);
        expect(run.ticks.startTick).toBe(5);
        expect(run.ticks.releaseTick).toBeGreaterThan(40);
    });

    it('the cloud lies behind where the defender stopped, which is not the spot it walked to', () => {
        const run = playDefenderSmoke(arenaConfig(), WALK);
        expect(run.outcome.cloud.y).toBeGreaterThan(10);
        expect(run.outcome.cloud.x).not.toBeCloseTo(178, 0);
    });

    it('replays bit for bit', () => {
        expect(playDefenderSmoke(arenaConfig(), WALK)).toEqual(playDefenderSmoke(arenaConfig(), WALK));
    });
});

describe('walkerBrain', () => {
    it('stands until it hears the alarm, and records the hearing and the first move', () => {
        const p = roleParams(arenaConfig(), 'defender');
        const brain = walkerBrain({ defender: 0, to: { x: 100, y: 0 }, p, reaction: 2, threshold: 0.1 });
        const world = {
            tick: 7,
            outputs: new Float32Array(OUTPUT_COUNT).fill(1),
            heard: new Float32Array(8),
            angle: [0],
            x: [0],
            y: [0],
            vx: [0],
            vy: [0],
            size: [p.size],
        };
        brain(world);
        expect(brain.state).toEqual({ heardTick: -1, startTick: -1, releaseTick: -1 });
        expect(world.outputs.every((v) => v === 0)).toBe(true);
        world.heard[0] = 1;
        brain(world);
        expect(brain.state.heardTick).toBe(7);
        expect(brain.state.startTick).toBe(9);
        expect(world.outputs[OUTPUT_INDEX.THRUST]).toBe(0);
    });
});
