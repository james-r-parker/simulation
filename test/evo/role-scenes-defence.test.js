import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { ARENA_CENTRE, stageArena } from '../../js/evo/chase-arena.js';
import { preStep5Arena } from '../helpers/pre-step5.js';
import { callerBrain, defenderBrain, smokerBrain } from '../../js/evo/chase-oracles.js';
import { playDefence, runScene, touching } from '../../js/evo/role-scenes-defence.js';

const OPTIONS = { reaction: 2, threshold: 0.1, side: 150 };
/** A slow world with the shove on: the defender can arrive before the kill. */
const SLOW = {
    maxVelocity: 4.5,
    defenderRepelEnergy: 40,
    defenderRepelImpulse: 4,
    defenderRepelCost: 2,
    specialisations: { predator: { sprintBoost: 0.5 } },
};

/** @param {Record<string, any>} config @param {number[]} spec slot specs @returns {ReturnType<typeof stageArena>} */
function arena(config, spec) {
    const { x, y } = ARENA_CENTRE;
    const specs = /** @type {Record<string, any>} */ (config.specialisations);
    const names = ['predator', 'forager', 'defender'];
    return stageArena(
        config,
        spec.map((s, i) => ({ spec: specs[names[s]].index, x: x + 100 * i, y, angle: 0 })),
    );
}
const out = (/** @type {any} */ world, /** @type {number} */ slot, /** @type {string} */ name) =>
    world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX[name]];

describe('the oracle brains of the defence', () => {
    const config = preStep5Arena();

    it('the caller stands, and holds ALARM from reaction ticks after it sees the hunter', () => {
        const { world } = arena(config, [0, 1]);
        const brain = callerBrain({ caller: 1, hunter: 0, seeGap: 99, reaction: 2 });
        brain(world);
        expect([out(world, 1, 'ALARM'), out(world, 1, 'THRUST')]).toEqual([0, 0]);
        const near = arena(config, [0, 1]);
        const see = callerBrain({ caller: 1, hunter: 0, seeGap: 100, reaction: 2 });
        near.world.tick = 5;
        see(near.world);
        expect(out(near.world, 1, 'ALARM')).toBe(0);
        near.world.tick = 6;
        see(near.world);
        expect(out(near.world, 1, 'ALARM')).toBe(0);
        near.world.tick = 7;
        see(near.world);
        expect(out(near.world, 1, 'ALARM')).toBe(1);
        expect(out(near.world, 1, 'THRUST')).toBe(0);
    });

    it('the defender stands until the alarm is heard, then moves reaction ticks later holding BITE and THRUST', () => {
        const { world } = arena(config, [0, 1, 2]);
        const brain = defenderBrain({ defender: 2, hunter: 0, reaction: 2, threshold: 0.1 });
        brain(world);
        expect(brain.state).toEqual({ heardTick: -1, startTick: -1 });
        expect(out(world, 2, 'THRUST')).toBe(0);
        world.heard[2 * 6] = 0.5;
        world.tick = 9;
        brain(world);
        expect(brain.state).toEqual({ heardTick: 9, startTick: 11 });
        expect(out(world, 2, 'THRUST')).toBe(0);
        world.tick = 11;
        brain(world);
        expect([out(world, 2, 'THRUST'), out(world, 2, 'BITE')]).toEqual([1, 1]);
    });

    it('the smoker holds SMOKE for the release tick only, then runs sideways at full sprint', () => {
        const { world } = arena(config, [0, 1]);
        const brain = smokerBrain({ prey: 1, release: 3 });
        world.tick = 2;
        brain(world);
        expect([out(world, 1, 'SMOKE'), out(world, 1, 'SPRINT')]).toEqual([0, 0]);
        world.tick = 3;
        brain(world);
        expect([out(world, 1, 'SMOKE'), out(world, 1, 'SPRINT')]).toEqual([1, 1]);
        world.tick = 4;
        brain(world);
        expect([out(world, 1, 'SMOKE'), out(world, 1, 'SPRINT')]).toEqual([0, 1]);
    });
});

describe('runScene and touching', () => {
    it('steps until the observer says stop, and counts bodies touching when their centres are within their sizes', () => {
        const config = preStep5Arena();
        const staged = arena(config, [0, 1]);
        const seen = /** @type {number[]} */ ([]);
        runScene(staged, {
            brains: [],
            observe: (_, n) => {
                seen.push(n);
                return n === 3;
            },
        });
        expect(seen).toEqual([1, 2, 3]);
        expect(touching(staged.world, 0, 1)).toBe(false);
        staged.world.x[1] = staged.world.x[0] + 70;
        expect(touching(staged.world, 0, 1)).toBe(true);
    });
});

describe('playDefence', () => {
    it('at the defaults the caller dies at tick 27 whether or not the defender hears, and it never touches the hunter', () => {
        const run = playDefence(preStep5Arena(), OPTIONS);
        expect(run.ticks).toMatchObject({ alarmTick: 2, heardTick: 3, startTick: 5, contactTick: 23, killTick: 27 });
        expect(run.ticks.interceptTick).toBeNull();
        expect(run.outcome).toEqual({ killed: true, defenderArrivedFirst: false, bites: 5 });
        const alone = playDefence(preStep5Arena(), { ...OPTIONS, absent: true });
        expect(alone.ticks.killTick).toBe(27);
        expect(alone.ticks.heardTick).toBe(-1);
    });

    it('in a slow world with the shove on, the defender touches the hunter and shoves it before the kill', () => {
        const run = playDefence(preStep5Arena(SLOW), { ...OPTIONS, side: 40 });
        expect(run.ticks.interceptTick).not.toBeNull();
        expect(run.ticks.repelTick).toBe(run.ticks.interceptTick);
        expect(run.outcome.defenderArrivedFirst).toBe(true);
    });

    it('with the shove off the defender touches the hunter and lands no shove', () => {
        const off = preStep5Arena({ ...SLOW, defenderRepelEnergy: 0, defenderRepelImpulse: 0 });
        const run = playDefence(off, { ...OPTIONS, side: 40 });
        expect(run.ticks.interceptTick).not.toBeNull();
        expect(run.ticks.repelTick).toBeNull();
    });

    it('replays bit for bit from the same config', () => {
        const config = preStep5Arena(SLOW);
        expect(playDefence(config, { ...OPTIONS, side: 40 })).toEqual(playDefence(config, { ...OPTIONS, side: 40 }));
    });
});
