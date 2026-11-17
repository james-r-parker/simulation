import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import {
    AMBUSH_STILL_TICKS,
    createStillnessScene,
    noteStillnessChase,
    noteStillnessDeath,
    stillnessMetrics,
    tickStillness,
} from '../../js/evo/scene-stillness.js';

function fixture(maxAgents = 2) {
    const scene = createStillnessScene({ maxAgents, maxVelocity: 10 });
    const observer = {
        intent: {
            hunterSpec: new Uint8Array(maxAgents),
            lastThreat: new Float64Array(maxAgents).fill(-1),
        },
        scenes: { approach: { openedTick: new Float64Array(maxAgents) } },
    };
    const world = {
        alive: new Uint8Array(maxAgents).fill(1),
        spec: new Uint8Array(maxAgents),
        vx: new Float64Array(maxAgents),
        vy: new Float64Array(maxAgents),
        tick: BURN_IN_TICKS,
        config: { maxVelocity: 10 },
    };
    scene.approachOpenedTick = observer.scenes.approach.openedTick;
    if (maxAgents > 1) {
        world.spec[1] = 1;
        observer.intent.hunterSpec[1] = 1;
    }
    return { observer, scene, world };
}

describe('scene-stillness', () => {
    it('compares each prey life under current threat rays with its calm ticks', () => {
        const { observer, scene, world } = fixture();
        observer.intent.lastThreat[0] = world.tick;
        tickStillness(scene, observer, world);
        world.tick += 1;
        world.vx[0] = 2;
        tickStillness(scene, observer, world);
        const metrics = stillnessMetrics(scene);
        expect(metrics['eval.freeze_under_threat']?.value).toBe(1);
        expect(metrics['eval.freeze_survival_gain']?.value).toBeNull();
    });

    it('ends a contiguous current-ray episode on ray loss or death', () => {
        const { observer, scene, world } = fixture(3);
        world.spec[1] = 0;
        world.alive[2] = 0;
        observer.intent.lastThreat[0] = world.tick;
        observer.intent.lastThreat[1] = world.tick;
        world.vx[1] = 2;
        tickStillness(scene, observer, world);
        world.tick += 1;
        observer.intent.lastThreat[0] = -1;
        observer.intent.lastThreat[1] = world.tick;
        tickStillness(scene, observer, world);
        noteStillnessDeath(scene, 1, world.tick);
        expect(stillnessMetrics(scene)['eval.freeze_survival_gain']?.value).toBe(1);
    });

    it('counts a caught approach as an ambush only after 60 consecutive still ticks', () => {
        const { observer, scene, world } = fixture();
        world.spec[0] = 1;
        for (let i = 0; i < AMBUSH_STILL_TICKS; i++) {
            world.tick = BURN_IN_TICKS + i;
            observer.scenes.approach.openedTick[0] = i === AMBUSH_STILL_TICKS - 1 ? world.tick : -1;
            tickStillness(scene, observer, world);
        }
        noteStillnessChase(scene, { slot: 0, outcome: 0 });
        scene.ambushAtOpen[0] = 0;
        noteStillnessChase(scene, { slot: 0, outcome: 0 });
        noteStillnessChase(scene, { slot: 0, outcome: 1 });
        expect(stillnessMetrics(scene)['eval.ambush_kill_share']?.value).toBe(0.5);
    });
});
