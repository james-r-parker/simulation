import { describe, expect, it } from 'vitest';
import { ARENA_CENTRE, stageArena } from '../../js/evo/chase-arena.js';
import { preStep5Arena } from '../helpers/pre-step5.js';
import { evaderBrain, pursuerBrain, steer } from '../../js/evo/chase-oracles.js';
import { OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { createBody } from '../../js/evo/role-budget-body.js';
import { HUNTER_PERFECT, hunterOut, preyOut, steerOut } from '../../js/evo/role-budget-play.js';
import { roleParams } from '../../js/evo/role-budget-params.js';

const config = preStep5Arena({ sprintStoreEnabled: true, sprintDrain: 0.01 });
const hunterP = roleParams(config, 'predator');
const preyP = roleParams(config, 'forager');
/** @type {import('../../js/evo/role-budget-play.js').PreyPlay} */
const PREY = { sprint: 'rationed', jink: 120, breakAngle: Math.PI / 2, awareGap: Infinity };

/** The two bodies in the sim's arena and in the budget's records, the same start. */
/** @param {{gap: number, bearing: number, hunterAngle?: number, preyAngle?: number, hv?: number}} start */
function pair({ gap, bearing, hunterAngle = 0, preyAngle = bearing, hv = 0 }) {
    const at = (/** @type {any} */ r) => ({
        x: ARENA_CENTRE.x + r * Math.cos(bearing),
        y: ARENA_CENTRE.y + r * Math.sin(bearing),
    });
    const { world } = stageArena(config, [
        { spec: 1, ...ARENA_CENTRE, angle: hunterAngle },
        { spec: 0, ...at(gap), angle: preyAngle },
    ]);
    world.vx[0] = hv * Math.cos(hunterAngle);
    world.vy[0] = hv * Math.sin(hunterAngle);
    const h = createBody(hunterP, { x: 0, y: 0, angle: hunterAngle, speed: hv });
    const p = createBody(preyP, { x: gap * Math.cos(bearing), y: gap * Math.sin(bearing), angle: preyAngle });
    return { world, h, p };
}

describe('steerOut', () => {
    it('is the steer rule of chase-oracles: the sine over the rate, clamped, and a full turn to the near side when behind', () => {
        const { world, h } = pair({ gap: 200, bearing: 0 });
        for (const aim of [
            { x: 100, y: 5 },
            { x: 100, y: -300 },
            { x: -50, y: 40 },
            { x: -50, y: -40 },
            { x: -50, y: 0 },
            { x: 0, y: 0 },
        ]) {
            expect(steerOut(h, aim)).toBeCloseTo(steer(world, 0, aim), 12);
        }
    });
});

describe('hunterOut and preyOut against the oracle brains', () => {
    it('hold what pursuerBrain and evaderBrain hold, from the same state, over the bearings and the gaps', () => {
        for (const bearing of [0, 1, -2.5, Math.PI]) {
            for (const gap of [60, 130, 250, 350, 380, 450]) {
                const { world, h, p } = pair({ gap, bearing, hunterAngle: 0.3, hv: 5 });
                const hunt = pursuerBrain({ pursuer: 0, evader: 1, sprint: true });
                const flee = evaderBrain({ pursuer: 0, evader: 1, sprint: true });
                hunt(world);
                flee(world);
                const out = world.outputs;
                const ho = hunterOut(h, p, { ...HUNTER_PERFECT, sprint: 'view' }, 0);
                const po = preyOut(h, p, PREY);
                expect(ho.turn).toBeCloseTo(out[OUTPUT_INDEX.TURN], 5);
                expect(ho.sprint > 0).toBe(out[OUTPUT_INDEX.SPRINT] > 0);
                expect(po.turn).toBeCloseTo(out[stride() + OUTPUT_INDEX.TURN], 5);
                expect(po.sprint > 0).toBe(out[stride() + OUTPUT_INDEX.SPRINT] > 0);
            }
        }
    });

    it('lets a spent store end the sprint of the oracle, not of a hunter that holds it to the end', () => {
        const { h, p } = pair({ gap: 200, bearing: 0 });
        h.level = 0.2;
        p.level = 0.2;
        expect(hunterOut(h, p, { ...HUNTER_PERFECT, sprint: 'view' }, 0).sprint).toBe(0);
        expect(hunterOut(h, p, HUNTER_PERFECT, 0).sprint).toBe(1);
        expect(preyOut(h, p, PREY).sprint).toBe(0);
        expect(preyOut(h, p, { ...PREY, sprint: 'always' }).sprint).toBe(1);
        expect(preyOut(h, p, { ...PREY, sprint: 'never' }).sprint).toBe(0);
    });
});

describe('the hunter play', () => {
    it('cruises straight and blind for `wait` ticks, starts the sprint at `runAt`, never sprints on `never`', () => {
        const { h, p } = pair({ gap: 200, bearing: 1 });
        expect(hunterOut(h, p, { ...HUNTER_PERFECT, wait: 3 }, 2)).toEqual({ turn: 0, sprint: 0 });
        expect(hunterOut(h, p, { ...HUNTER_PERFECT, wait: 3 }, 3).sprint).toBe(1);
        expect(hunterOut(h, p, { ...HUNTER_PERFECT, runAt: 5 }, 4).sprint).toBe(0);
        expect(hunterOut(h, p, { ...HUNTER_PERFECT, runAt: 5 }, 5).sprint).toBe(1);
        expect(hunterOut(h, p, { ...HUNTER_PERFECT, sprint: 'never' }, 0).sprint).toBe(0);
        expect(hunterOut(h, p, { ...HUNTER_PERFECT, effort: 0.5 }, 0).sprint).toBe(0.5);
    });

    it('cruises blind while the prey is outside its seeGap', () => {
        const { h, p } = pair({ gap: 200, bearing: 1 });
        expect(hunterOut(h, p, { ...HUNTER_PERFECT, seeGap: 150 }, 0)).toEqual({ turn: 0, sprint: 0 });
        expect(hunterOut(h, p, { ...HUNTER_PERFECT, seeGap: 250 }, 0).sprint).toBe(1);
    });

    it('sprints on `view` only with the prey inside its vision when the store is on', () => {
        const near = pair({ gap: 350, bearing: 0 });
        const far = pair({ gap: 450, bearing: 0 });
        /** @type {import('../../js/evo/role-budget-play.js').HunterPlay} */
        const play = { ...HUNTER_PERFECT, sprint: 'view' };
        expect(hunterOut(near.h, near.p, play, 0).sprint).toBe(1);
        expect(hunterOut(far.h, far.p, play, 0).sprint).toBe(0);
        const off = roleParams(preStep5Arena(), 'predator');
        const h = createBody(off, { x: 0, y: 0, angle: 0 });
        expect(hunterOut(h, far.p, play, 0).sprint).toBe(1);
    });
});

describe('the prey play', () => {
    it('stands still until the hunter is inside the awareness gap, then flees', () => {
        const { h, p } = pair({ gap: 300, bearing: 0, preyAngle: 0 });
        expect(preyOut(h, p, { ...PREY, awareGap: 250 })).toEqual({ turn: 0, sprint: 0, thrust: 0 });
        expect(preyOut(h, p, { ...PREY, awareGap: 350 }).sprint).toBe(1);
        expect(preyOut(h, p, { ...PREY, awareGap: 350 }).thrust).toBeUndefined();
    });

    it('breaks across the hunter at the jink range, to the side it stands on, and runs straight at jink 0', () => {
        const near = pair({ gap: 100, bearing: 0.4, hv: 6 });
        const straight = preyOut(near.h, near.p, { ...PREY, jink: 0 });
        const broke = preyOut(near.h, near.p, PREY);
        expect(Math.sign(broke.turn)).toBe(1);
        expect(Math.abs(broke.turn)).toBeGreaterThan(Math.abs(straight.turn));
    });

    it('breaks from a hunter at rest along the hunter heading, and counts a prey on the line as the positive side', () => {
        const { h, p } = pair({ gap: 100, bearing: 0, preyAngle: 0 });
        const out = preyOut(h, p, PREY);
        expect(out.turn).toBe(1);
    });
});

/** The output row stride of the sim's world (`OUTPUT_COUNT`). */
function stride() {
    return stageArena(config, [{ spec: 0, ...ARENA_CENTRE, angle: 0 }]).world.outputs.length / 8;
}
