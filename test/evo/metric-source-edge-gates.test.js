// Source answers for the split-gate share detectors of the low-density edge (low-density-edge.md, T6): a scripted world of real steps,
// the real sense phase that writes `mateSeenAt`, observer reads and computeMetrics.
//
// Five mature prey stand still at the checkpoint (T) with 5 alive, so it is an edge checkpoint. Female F at (200, 200) looks
// east at male M1, 200 away: in view (visionRange 300) but out of reach (about size + size + mateRange 100), so the sense
// does not note M1 and F is mate-scarce. Female G at (700, 700) has male M2 60 away. Female H at (100, 800) has nobody in
// view and a line that has split 3 times in a row. F and M1 split at once (the shark rule, no mate in reach), so they are on
// cooldown and leave the eligible prey. G and M2 see a mate in reach and H is held by `clonal`.

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

    it('script the sense they say: only a mate in reach is noted, so F and M1 split and G and M2 are seen', () => {
        const [f, g, h] = females;
        expect(world.tick).toBe(T);
        expect(world.mateSeenAt[f]).toBeLessThan(T - 1);
        expect(world.cooldown[f]).toBeGreaterThan(0);
        expect(world.mateSeenAt[g]).toBe(T - 1);
        expect(world.mateSeenAt[h]).toBeLessThan(T - 1);
        expect(run.observer.scenes.edge.gates.checkpoints).toBe(1);
    });

    it('eval.edge_split_blocked_share.* hold the prey that saw a mate by seen and H by clonal', () => {
        // F and M1 are on cooldown after their split, so the eligible prey are G, M2 and H.
        expect(m['eval.edge_split_blocked_share.seen']).toEqual({ value: 2 / 3 });
        expect(m['eval.edge_split_blocked_share.clonal']).toEqual({ value: 1 / 3 });
        expect(m['eval.edge_split_blocked_share.energy']).toEqual({ value: 0 });
        expect(m['eval.edge_split_blocked_share.merit']).toEqual({ value: 0 });
        expect(m['eval.edge_split_blocked_share.proof']).toEqual({ value: 0 });
        expect(m['eval.edge_split_blocked_share.other']).toEqual({ value: 0 });
    });
});
