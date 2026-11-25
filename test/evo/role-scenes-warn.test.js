import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { ARENA_CENTRE, stageArena } from '../../js/evo/chase-arena.js';
import { preStep5Arena } from '../helpers/pre-step5.js';
import { fleerBrain, stalkerBrain } from '../../js/evo/chase-oracles.js';
import { playWarning } from '../../js/evo/role-scenes-warn.js';

const COURSER = JSON.parse(readFileSync('evals/fair-chase/courser.json', 'utf8'));
const OPTIONS = { reaction: 2, threshold: 0.1, side: 150, goAt: 16 };

/** @param {number[]} spec slot specs (0 hunter, 1 forager, 2 scout) @returns {ReturnType<typeof stageArena>} */
function arena(spec) {
    const config = preStep5Arena();
    const { x, y } = ARENA_CENTRE;
    const specs = /** @type {Record<string, any>} */ (config.specialisations);
    const names = ['predator', 'forager', 'scout'];
    return stageArena(
        config,
        spec.map((s, i) => ({ spec: specs[names[s]].index, x: x + 100 * i, y, angle: 0 })),
    );
}
const out = (/** @type {any} */ world, /** @type {number} */ slot, /** @type {string} */ name) =>
    world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX[name]];

describe('the oracle brains of the warning', () => {
    it('the fleer stands until the alarm is heard, then moves reaction ticks later with THRUST and no BITE', () => {
        const { world } = arena([0, 1]);
        const brain = fleerBrain({ forager: 1, hunter: 0, reaction: 2, threshold: 0.1 });
        brain(world);
        expect(brain.state).toEqual({ heardTick: -1, startTick: -1 });
        expect(out(world, 1, 'THRUST')).toBe(0);
        world.heard[1 * 6] = 0.5;
        world.tick = 9;
        brain(world);
        expect(brain.state).toEqual({ heardTick: 9, startTick: 11 });
        expect(out(world, 1, 'THRUST')).toBe(0);
        world.tick = 11;
        brain(world);
        expect([out(world, 1, 'THRUST'), out(world, 1, 'BITE')]).toEqual([1, 0]);
    });

    it('the stalker creeps at the prey without the sprint until goAt, then sprints at it', () => {
        const { world } = arena([0, 1]);
        const brain = stalkerBrain({ hunter: 0, prey: 1, goAt: 5 });
        world.tick = 4;
        brain(world);
        expect([out(world, 0, 'THRUST'), out(world, 0, 'SPRINT'), out(world, 0, 'BITE')]).toEqual([1, 0, 1]);
        world.tick = 5;
        brain(world);
        expect(out(world, 0, 'SPRINT')).toBe(1);
    });
});

describe('playWarning', () => {
    const scene = playWarning(preStep5Arena(), OPTIONS);

    it('has the scout call 2 ticks after it sees the hunter, the forager hear 1 later and move 2 after that', () => {
        expect(scene.ticks.alarmTick).toBe(2);
        expect(scene.ticks.heardTick).toBe(3);
        expect(scene.ticks.startTick).toBe(5);
    });

    it('stages the hunter 445 px from the forager and has it 40 px closer when the forager moves', () => {
        expect(scene.ticks.gapAtStart).toBeCloseTo(405, 0);
    });

    it('lets the forager turn and gain on a hunter that creeps until tick 16, and escape at the defaults', () => {
        expect(scene.ticks.gapAtRun).toBeGreaterThan(317);
        expect(scene.outcome.caught).toBe(false);
        expect(scene.ticks.killTick).toBeNull();
    });

    it('kills the forager of the courser arm, where the hunter closes on it, and reads the same twice', () => {
        const caught = playWarning(preStep5Arena(COURSER), {
            ...OPTIONS,
            goAt: 16,
        });
        expect(caught.outcome.caught).toBe(true);
        expect(caught.ticks.killTick).toBeGreaterThan(0);
        expect(playWarning(preStep5Arena(), OPTIONS)).toEqual(scene);
    });

    it('reads the gap at runAt, and a hunter that sprints from the forager first move is closer then than one that creeps', () => {
        const sprinting = playWarning(preStep5Arena(), { ...OPTIONS, goAt: 5, runAt: 16 });
        expect(sprinting.ticks.gapAtStart).toBeCloseTo(405, 0);
        expect(sprinting.ticks.gapAtRun).toBeLessThan(scene.ticks.gapAtRun ?? 0);
        expect(sprinting.ticks.gapAtRun).toBeGreaterThan(289);
    });

    it('never hears a call from a scout beyond its radius, so the forager never moves', () => {
        const far = playWarning(preStep5Arena(), { ...OPTIONS, side: 350, goAt: 60 });
        expect(far.ticks.heardTick).toBe(-1);
        expect(far.ticks.startTick).toBe(-1);
    });
});
