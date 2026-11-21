import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { SPEC } from '../../js/sim/specs.js';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { layerArena } from '../../js/evo/drill-body-rules.js';
import {
    CLEAR_HERD,
    CLEAR_HERD_BY_SPEC,
    HERD_ARENA,
    HERD_SPECS,
    SCENE_TICKS,
    clearHerdOf,
    herdPlan,
    placeHerd,
} from '../../js/evo/drill-role-herd.js';
import { drillSubject, randomBrains } from '../../js/evo/drill.js';
import { playTrial } from '../../js/evo/memory-probe-run.js';
import { playStampede } from '../../js/evo/role-scenes-herd.js';
import { stageWorld } from '../../js/evo/pool-discrimination-stage.js';

const CONFIG = layerArena({}, HERD_ARENA);
const mute = { name: 'mute', id: 0, spec: SPEC.FORAGER, weights: null, act: () => {} };

/**
 * @param {import('../../js/evo/memory-probe-run.js').Subject} subject the body
 * @param {{spec: string, sign: 1 | -1, side: 1 | -1}} at the plan's spec, herd side and body side
 * @returns {{won: boolean, trace: Record<string, any>}} the trial
 */
function play(subject, at) {
    const plan = herdPlan(createConfig(CONFIG), at);
    const won = playTrial({ plan, subject, controlSpec: { name: 'intact' }, seed: 1, config: CONFIG });
    return { won, trace: /** @type {any} */ (plan.trace)(won) };
}

describe('the clear-herd drills', () => {
    it('are the four specs that do not hunt, each on its own row of the budget, the forager`s being clear-herd', () => {
        expect(HERD_SPECS.map((s) => CLEAR_HERD_BY_SPEC[s].name)).toEqual([
            'clear-herd',
            'clear-herd-reproducer',
            'clear-herd-scout',
            'clear-herd-defender',
        ]);
        expect(HERD_SPECS.map((s) => CLEAR_HERD_BY_SPEC[s].row)).toEqual([
            'forager:herd',
            'reproducer:herd',
            'scout:herd',
            'defender:herd',
        ]);
        expect(HERD_SPECS.map((s) => CLEAR_HERD_BY_SPEC[s].spec)).toEqual([
            SPEC.FORAGER,
            SPEC.REPRODUCER,
            SPEC.SCOUT,
            SPEC.DEFENDER,
        ]);
        expect(CLEAR_HERD).toBe(CLEAR_HERD_BY_SPEC.forager);
        expect(CLEAR_HERD).toMatchObject({ scene: 'A real chase', needsHunter: false, arena: HERD_ARENA });
        expect(CLEAR_HERD.goals).toEqual([['see', 'turn', 'run']]);
    });

    it('stage one body and, after staging, a herd on a ring that comes at it along the flee axis', () => {
        const plan = clearHerdOf('scout').plan(fork(createRng(1), 'drill:clear-herd-scout'), 300, createConfig(CONFIG));
        expect(plan.stage.agents).toHaveLength(1);
        expect(plan.stage.agents[0]).toMatchObject({ role: 'subject', spec: SPEC.SCOUT });
        const { world } = stageWorld({
            ...plan.stage,
            agents: /** @type {any} */ (plan.stage.agents),
            seed: 1,
            config: CONFIG,
        });
        placeHerd(world, { sign: 1, seeGap: 400 });
        expect(world.groupAlarm[0]).toBe(world.config.herdStampedeTicks);
        expect([world.groupFleeX[0], world.groupFleeY[0]]).toEqual([1, 0]);
        const front = Math.max(...Array.from({ length: world.config.herdSize }, (_, a) => world.herdX[a]));
        expect(front).toBeCloseTo(4000 - 400, 0);
        placeHerd(world, { sign: -1, seeGap: 400 });
        expect(world.groupFleeX[0]).toBe(-1);
        expect(Math.min(...Array.from({ length: world.config.herdSize }, (_, a) => world.herdX[a]))).toBeCloseTo(
            4000 + 400,
            0,
        );
    });

    it('tramples a body that stands within a tick of the arrival the scene of playStampede gives, and says so', () => {
        for (const spec of ['forager', 'defender']) {
            const scene = playStampede(arenaConfig(), { spec, facing: 'away', run: false });
            for (const [sign, side] of /** @type {[1 | -1, 1 | -1][]} */ ([
                [1, 1],
                [-1, -1],
            ])) {
                const { won, trace } = play({ ...mute, spec: HERD_SPECS.indexOf(spec) }, { spec, sign, side });
                expect(won).toBe(false);
                expect(trace.reason).toBe('trampled');
                // the mirrored scene rounds a position a tick apart from the scene's
                expect(Math.abs(trace.trampleTick - /** @type {number} */ (scene.ticks.arrival))).toBeLessThanOrEqual(
                    1,
                );
                expect(trace.tramples).toBeGreaterThan(1);
            }
        }
    });

    it('is won by the reference of each spec at either side, as the oracle of playStampede clears the scene', () => {
        for (const spec of HERD_SPECS) {
            for (const [sign, side] of /** @type {[1 | -1, 1 | -1][]} */ ([
                [1, 1],
                [-1, -1],
            ])) {
                const { won, trace } = play(CLEAR_HERD_BY_SPEC[spec].reference(), { spec, sign, side });
                expect(won).toBe(true);
                expect(trace).toEqual({ tramples: 0, trampleTick: null, reason: null });
            }
        }
    });

    it('is won by no random brain, and replays from its seed', () => {
        for (const brain of randomBrains(CLEAR_HERD)) {
            expect(drillSubject(CLEAR_HERD, brain, { trials: 3 }).wins).toBe(0);
        }
        const a = drillSubject(CLEAR_HERD, CLEAR_HERD.reference(), { trials: 4, seed: 5 });
        expect(drillSubject(CLEAR_HERD, CLEAR_HERD.reference(), { trials: 4, seed: 5 })).toEqual(a);
        expect(a.wins).toBe(4);
    });

    it('counts a body that dies as trampled, and stops there', () => {
        const plan = herdPlan(createConfig(CONFIG), { spec: 'forager', sign: 1, side: 1 });
        const world = /** @type {any} */ ({ energy: [1000], alive: [0], tick: 7 });
        expect(plan.done(world, /** @type {any} */ (null))).toBe(true);
        expect(plan.won(world)).toBe(false);
        expect(SCENE_TICKS).toBe(plan.maxTicks);
    });
});
