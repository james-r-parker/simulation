import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { SCAN, SCAN_SIZE } from '../../js/evo/ray-summary.js';
import { createSprintScene, sprintMetrics, tickSprint } from '../../js/evo/scene-sprint.js';

const SPRINT_NAMES = [
    'eval.chase_sprint_lift',
    'eval.flee_sprint_lift',
    'eval.sprint_cost_share',
    'eval.sprint_share.hunter',
    'eval.sprint_share.prey',
];

function fixture() {
    const outputs = new Float32Array(2 * OUTPUT_COUNT);
    const scan = new Float64Array(2 * SCAN_SIZE).fill(-1);
    outputs[OUTPUT_INDEX.SPRINT] = 1;
    outputs[OUTPUT_COUNT + OUTPUT_INDEX.SPRINT] = 1;
    scan[SCAN.THREAT] = 40;
    scan[SCAN_SIZE + SCAN.THREAT] = 40;
    const world = {
        tick: BURN_IN_TICKS,
        alive: new Uint8Array([1, 1]),
        ageTicks: new Uint32Array([5, 5]),
        huntBySpec: new Uint8Array([0, 1]),
        spec: new Uint8Array([1, 0]),
        outputs,
        ledger: new Float64Array([0, 2]),
    };
    const observer = {
        intent: { scan },
        scenes: { approach: { phase: new Uint8Array([1, 0]) } },
    };
    const scene = createSprintScene({ juvenileTicks: 100, juvenileBurn: 0.5, sprintCost: 0.1 });
    return { observer, scene, world };
}

describe('scene-sprint', () => {
    it('emits the five planned detector names', () => {
        const emitted = Object.keys(sprintMetrics(createSprintScene({}))).sort();
        expect(emitted).toEqual(SPRINT_NAMES);
    });

    it('measures role shares, chase and threat lifts, and the observer sprint cost estimate', () => {
        const { observer, scene, world } = fixture();
        tickSprint(scene, observer, world);
        const metrics = sprintMetrics(scene);
        expect(metrics['eval.sprint_share.hunter']?.value).toBe(1);
        expect(metrics['eval.sprint_share.prey']?.value).toBe(1);
        expect(metrics['eval.chase_sprint_lift']?.value).toBeNull();
        expect(metrics['eval.flee_sprint_lift']?.value).toBeNull();
        expect(metrics['eval.sprint_cost_share']?.value).toBeCloseTo(0.075, 8);

        world.tick += 1;
        world.ledger[1] += 2;
        observer.scenes.approach.phase[0] = 0;
        observer.intent.scan[SCAN_SIZE + SCAN.THREAT] = -1;
        tickSprint(scene, observer, world);
        expect(sprintMetrics(scene)['eval.chase_sprint_lift']?.value).toBe(1);
        expect(sprintMetrics(scene)['eval.flee_sprint_lift']?.value).toBe(1);
    });

    it('does not count burn-in ticks or invent a zero share for missing roles', () => {
        const { observer, scene, world } = fixture();
        world.tick = BURN_IN_TICKS - 1;
        tickSprint(scene, observer, world);
        expect(scene.hunterTicks).toBe(0);
        world.tick = BURN_IN_TICKS;
        world.alive[1] = 0;
        tickSprint(scene, observer, world);
        expect(sprintMetrics(scene)['eval.sprint_share.prey']?.value).toBeNull();
    });

    it('keeps the sprint cost numerator nominal when actual energy removal is clipped', () => {
        const { observer, scene, world } = fixture();
        world.ledger[1] = 0.01;
        tickSprint(scene, observer, world);
        expect(sprintMetrics(scene)['eval.sprint_cost_share']?.value).toBeCloseTo(15, 8);
    });
});
