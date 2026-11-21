import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { SPEC } from '../../js/sim/specs.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { ARENA_CENTRE, arenaConfig, stageArena } from '../../js/evo/chase-arena.js';
import { layerArena } from '../../js/evo/drill-body-rules.js';
import {
    DEFEND_CALLER,
    DEFEND_ROW,
    defendPlan,
    defenderReference,
    lostReason,
} from '../../js/evo/drill-role-defend.js';
import { ROLE_ARENA } from '../../js/evo/drill-role-staging.js';
import { drillSubject, randomBrains } from '../../js/evo/drill.js';
import { playTrial } from '../../js/evo/memory-probe-run.js';
import { noteMeeting, playDefence } from '../../js/evo/role-scenes-defence.js';

/** The shove on and the damping the row's search found, so the defence is reachable (`--search` on `defender:predator`). */
const REACHABLE = { defenderRepelEnergy: 40, defenderRepelImpulse: 4, damping: 0.7125 };
const SCENE = { reaction: 2, threshold: 0.1, side: 150 };

/**
 * @param {Record<string, any>} over config overrides
 * @param {{angle: number, side: 1 | -1}} at the plan's heading and side
 * @returns {{won: boolean, trace: Record<string, any>}} the reference's trial
 */
function play(over, at) {
    const config = layerArena(over, ROLE_ARENA);
    const plan = defendPlan(createConfig(config), at);
    const won = playTrial({ plan, subject: defenderReference(), controlSpec: { name: 'intact' }, seed: 1, config });
    return { won, trace: /** @type {any} */ (plan.trace)(won) };
}

describe('the defend-caller drill', () => {
    it('is the defender drill of the row defender:predator, in the role arena', () => {
        expect(DEFEND_CALLER).toMatchObject({ name: 'defend-caller', spec: SPEC.DEFENDER, row: DEFEND_ROW });
        expect(DEFEND_CALLER.needsHunter).toBe(false);
        expect(DEFEND_CALLER.arena).toBe(ROLE_ARENA);
    });

    it('stages the hunter, the caller and the defender in the scene, turned and mirrored from the drill stream', () => {
        const stage = (/** @type {number} */ seed) =>
            DEFEND_CALLER.plan(fork(createRng(seed), 'drill:defend-caller'), 300, createConfig(ROLE_ARENA)).stage
                .agents;
        const [hunter, caller, defender] = /** @type {any[]} */ (stage(1));
        expect([hunter.role, caller.role, defender.role]).toEqual(['stalker', 'herd', 'subject']);
        expect([hunter.spec, caller.spec, defender.spec]).toEqual([SPEC.PREDATOR, SPEC.FORAGER, SPEC.DEFENDER]);
        const gap = Math.hypot(caller.x - hunter.x, caller.y - hunter.y);
        expect(gap).toBeCloseTo(345, 0);
        expect(Math.hypot(defender.x - caller.x, defender.y - caller.y)).toBeCloseTo(150, 6);
        expect(JSON.stringify(stage(2))).not.toBe(JSON.stringify(stage(1)));
    });

    it('plays the scene of playDefence tick for tick at the defaults: no defender power, the caller dies at tick 27', () => {
        const scene = playDefence(arenaConfig(), SCENE);
        for (const [angle, side] of /** @type {[number, 1 | -1][]} */ ([
            [0, 1],
            [1.1, -1],
        ])) {
            const { won, trace } = play({}, { angle, side });
            expect(won).toBe(false);
            expect(trace).toEqual({
                touchTick: null,
                shoveTick: null,
                killTick: scene.ticks.killTick,
                reason: 'never-reached',
            });
        }
        expect(scene.ticks.killTick).toBe(27);
    });

    it('plays the scene of playDefence tick for tick when the defence is reachable: touch, shove and kill', () => {
        const scene = playDefence(arenaConfig(REACHABLE), SCENE);
        for (const [angle, side] of /** @type {[number, 1 | -1][]} */ ([
            [0, 1],
            [1.1, -1],
        ])) {
            const { won, trace } = play(REACHABLE, { angle, side });
            expect(won).toBe(true);
            expect(trace).toEqual({
                touchTick: scene.ticks.interceptTick,
                shoveTick: scene.ticks.repelTick,
                killTick: scene.ticks.killTick,
                reason: null,
            });
        }
        expect(scene.outcome.defenderArrivedFirst).toBe(true);
    });

    it('is lost by a defender that touches the hunter too late, and by one that never arrives', () => {
        expect(lostReason({ interceptTick: null, repelTick: null, killTick: 27 })).toBe('never-reached');
        expect(lostReason({ interceptTick: 30, repelTick: null, killTick: 27 })).toBe('late');
    });

    it('counts a caller the hunter does not kill as a win, whoever saved it', () => {
        const stay = { name: 'stay', id: 0, spec: SPEC.DEFENDER, weights: null, act: () => {} };
        const config = layerArena({}, ROLE_ARENA);
        const plan = defendPlan(createConfig(config), { angle: 0, side: 1 });
        expect(playTrial({ plan, subject: stay, controlSpec: { name: 'intact' }, seed: 1, config })).toBe(false);
        const harmless = defendPlan(createConfig(config), { angle: 0, side: 1 });
        harmless.stage.agents[0].spec = SPEC.FORAGER;
        expect(playTrial({ plan: harmless, subject: stay, controlSpec: { name: 'intact' }, seed: 1, config })).toBe(
            true,
        );
    });

    it('is won by no random brain, and replays from its seed', () => {
        for (const brain of randomBrains(DEFEND_CALLER, { config: REACHABLE })) {
            expect(drillSubject(DEFEND_CALLER, brain, { trials: 2, config: REACHABLE }).wins).toBe(0);
        }
        const a = drillSubject(DEFEND_CALLER, defenderReference(), { trials: 3, seed: 5, config: REACHABLE });
        expect(drillSubject(DEFEND_CALLER, defenderReference(), { trials: 3, seed: 5, config: REACHABLE })).toEqual(a);
        expect(a.wins).toBe(3);
    });

    it('plans without a config from the role arena', () => {
        const plan = DEFEND_CALLER.plan(fork(createRng(1), 'drill:defend-caller'), 300);
        expect(plan.stage.agents).toHaveLength(3);
    });
});

describe('noteMeeting, the defender and the hunter in the drill', () => {
    /**
     * @param {{holds: boolean, shoveOn: boolean, facing: number}} at whether the defender holds BITE, whether the shove is on
     *   and its heading (0 faces the hunter)
     * @returns {{interceptTick: number | null, repelTick: number | null}} the readings after one tick
     */
    function meet({ holds, shoveOn, facing }) {
        const { x, y } = ARENA_CENTRE;
        const { world } = stageArena(arenaConfig(), [
            { spec: SPEC.PREDATOR, x, y, angle: 0 },
            { spec: SPEC.FORAGER, x: x + 900, y, angle: 0 },
            { spec: SPEC.DEFENDER, x: x + 20, y, angle: Math.PI + facing },
        ]);
        world.outputs[2 * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = holds ? 1 : 0;
        const ticks = { interceptTick: null, repelTick: null };
        noteMeeting(ticks, world, { n: 4, shove: shoveOn });
        return ticks;
    }

    it('notes the touch and, with the shove on, a defender that holds BITE with the hunter in its jaws', () => {
        expect(meet({ holds: true, shoveOn: true, facing: 0 })).toEqual({ interceptTick: 4, repelTick: 4 });
    });

    it('notes the touch but no shove when the shove is off, BITE is not held or the hunter is not in the jaws', () => {
        expect(meet({ holds: true, shoveOn: false, facing: 0 })).toEqual({ interceptTick: 4, repelTick: null });
        expect(meet({ holds: false, shoveOn: true, facing: 0 })).toEqual({ interceptTick: 4, repelTick: null });
        expect(meet({ holds: true, shoveOn: true, facing: Math.PI })).toEqual({ interceptTick: 4, repelTick: null });
    });
});
