// Source answers for the share detectors of the low-density edge (low-density-edge.md, T6): a scripted world of real steps,
// the real sense phase that writes `mateSeenAt`, observer reads and computeMetrics.
//
// Five mature prey stand still at the checkpoint (T) with 5 alive, so it is an edge checkpoint. Female F at (200, 200) looks
// east at male M1, 200 away: in view (visionRange 300) and out of reach (about size + size + mateRange 100). Female G at
// (700, 700) has male M2 60 away. Female H at (100, 800) has nobody in view and a line that has split 3 times in a row.
// So the ready females are F, G and H; F saw a mate and has none within reach (1 of 3). Every prey but H sees a mate, so the
// `seen` gate holds 4 of the 5; H passes it and the `clonal` gate holds it.

import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { SEX } from '../../js/sim/sex.js';
import { FORAGER, huntRun } from './helpers/hunt-scene.js';

const T = Math.ceil(BURN_IN_TICKS / 1000) * 1000;

/**
 * @param {any} world the world
 * @param {number} slot the agent
 * @param {{x: number, y: number, sex: number}} at its place and sex
 * @returns {void}
 */
function stand(world, slot, { x, y, sex }) {
    world.x[slot] = x;
    world.y[slot] = y;
    world.vx[slot] = 0;
    world.vy[slot] = 0;
    world.angle[slot] = 0;
    world.sex[slot] = sex;
    world.ageTicks[slot] = 100;
    world.cooldown[slot] = 0;
    world.energy[slot] = 1500;
}

/** @returns {{run: ReturnType<typeof huntRun>['run'], world: any, females: number[]}} the run after the checkpoint */
function scriptedRun() {
    const { run, world, spawn } = huntRun({
        runTicks: T + 1000,
        over: { maxAgents: 40, splitMateScarceTicks: 100, splitClonalMax: 3, mateRange: 100, maxFood: 4 },
    });
    const [f, m1, g, m2, h] = Array.from({ length: 5 }, () => spawn(FORAGER));
    run.jump(T - 1);
    stand(world, f, { x: 200, y: 200, sex: SEX.FEMALE });
    stand(world, m1, { x: 400, y: 200, sex: SEX.MALE });
    stand(world, g, { x: 700, y: 700, sex: SEX.FEMALE });
    stand(world, m2, { x: 760, y: 700, sex: SEX.MALE });
    stand(world, h, { x: 100, y: 800, sex: SEX.FEMALE });
    world.clonalDepth[h] = 3;
    run.tick();
    return { run, world, females: [f, g, h] };
}

describe('the share detectors in a scripted world', () => {
    const { run, world, females } = scriptedRun();
    const m = run.metrics();

    it('script the sense they say: the females in view of a mate wrote the tick before the checkpoint', () => {
        const [f, g, h] = females;
        expect(world.tick).toBe(T);
        expect(world.mateSeenAt[f]).toBe(T - 1);
        expect(world.mateSeenAt[g]).toBe(T - 1);
        expect(world.mateSeenAt[h]).toBeLessThan(T - 1);
        expect(run.observer.scenes.edge.gates.checkpoints).toBe(1);
    });

    it('eval.edge_mate_unreached_share counts the female who saw a mate she cannot reach', () => {
        expect(m['eval.edge_mate_unreached_share']).toEqual({ value: 1 / 3 });
    });

    it('eval.edge_split_blocked_share.* hold the prey that saw a mate by seen and H by clonal', () => {
        expect(m['eval.edge_split_blocked_share.seen']).toEqual({ value: 4 / 5 });
        expect(m['eval.edge_split_blocked_share.clonal']).toEqual({ value: 1 / 5 });
        expect(m['eval.edge_split_blocked_share.energy']).toEqual({ value: 0 });
        expect(m['eval.edge_split_blocked_share.merit']).toEqual({ value: 0 });
        expect(m['eval.edge_split_blocked_share.proof']).toEqual({ value: 0 });
        expect(m['eval.edge_split_blocked_share.other']).toEqual({ value: 0 });
    });
});
