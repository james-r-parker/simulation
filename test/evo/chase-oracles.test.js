import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import {
    EVADER_SPRINT_JINKS,
    JINK_RANGE,
    evaderBrain,
    pursuerBrain,
    steer,
    storeAboveFloor,
    wrap,
} from '../../js/evo/chase-oracles.js';
import { arenaConfig, stageArena } from '../../js/evo/chase-arena.js';

const FORAGER = 0;
const PREDATOR = 1;

/**
 * @param {{x: number, y: number, angle?: number}} evader where the evader stands
 * @returns {Record<string, any>} a world with the pursuer at (4000, 4000) heading +x and the evader as given
 */
function pair(evader) {
    return stageArena(arenaConfig(), [
        { spec: PREDATOR, x: 4000, y: 4000, angle: 0 },
        { spec: FORAGER, angle: 0, ...evader },
    ]).world;
}
const out = (/** @type {Record<string, any>} */ w, /** @type {number} */ slot, /** @type {number} */ o) =>
    w.outputs[slot * OUTPUT_COUNT + o];

describe('wrap', () => {
    it('wraps into [-PI, PI)', () => {
        expect(wrap(3 * Math.PI)).toBeCloseTo(-Math.PI, 9);
        expect(wrap(-0.5)).toBeCloseTo(-0.5, 9);
        expect(wrap(2 * Math.PI + 0.25)).toBeCloseTo(0.25, 9);
    });
});

describe('pursuerBrain', () => {
    it('turns towards an evader on its positive side, thrusts, sprints and bites', () => {
        const w = pair({ x: 4100, y: 4100 });
        pursuerBrain({ pursuer: 0, evader: 1, sprint: true })(w);
        expect(out(w, 0, OUTPUT_INDEX.TURN)).toBeGreaterThan(0);
        expect([OUTPUT_INDEX.THRUST, OUTPUT_INDEX.SPRINT, OUTPUT_INDEX.BITE].map((o) => out(w, 0, o))).toEqual([
            1, 1, 1,
        ]);
        const other = pair({ x: 4100, y: 3900 });
        pursuerBrain({ pursuer: 0, evader: 1, sprint: false })(other);
        expect(out(other, 0, OUTPUT_INDEX.TURN)).toBeLessThan(0);
        expect(out(other, 0, OUTPUT_INDEX.SPRINT)).toBe(0);
    });
});

describe('evaderBrain', () => {
    it('runs directly away outside the jink range and never bites', () => {
        const facing = pair({ x: 4000 + 2 * JINK_RANGE, y: 4000, angle: Math.PI });
        evaderBrain({ pursuer: 0, evader: 1, sprint: true })(facing);
        expect(Math.abs(out(facing, 1, OUTPUT_INDEX.TURN))).toBe(1); // facing the pursuer, it turns about
        expect(out(facing, 1, OUTPUT_INDEX.BITE)).toBe(0);
        const away = pair({ x: 4000 + 2 * JINK_RANGE, y: 4000, angle: 0 });
        evaderBrain({ pursuer: 0, evader: 1, sprint: true })(away);
        expect(out(away, 1, OUTPUT_INDEX.TURN)).toBeCloseTo(0, 6);
    });

    it('breaks square across the pursuer on the side it stands once inside the range', () => {
        const upper = pair({ x: 4040, y: 4030, angle: 0 });
        evaderBrain({ pursuer: 0, evader: 1, sprint: true })(upper);
        expect(out(upper, 1, OUTPUT_INDEX.TURN)).toBe(1); // the pursuer heads +x and the evader is at +y
        const lower = pair({ x: 4040, y: 3970, angle: 0 });
        evaderBrain({ pursuer: 0, evader: 1, sprint: true })(lower);
        expect(out(lower, 1, OUTPUT_INDEX.TURN)).toBe(-1);
    });

    it('a jink range of 0 never breaks', () => {
        const w = pair({ x: 4040, y: 4030, angle: Math.atan2(30, 40) });
        evaderBrain({ pursuer: 0, evader: 1, sprint: true, jinkRange: 0 })(w);
        expect(out(w, 1, OUTPUT_INDEX.TURN)).toBeCloseTo(0, 5);
        evaderBrain({ pursuer: 0, evader: 1, sprint: true })(w);
        expect(out(w, 1, OUTPUT_INDEX.TURN)).toBe(1);
    });

    it('bends along a wall when given a wall margin, and runs into it without one', () => {
        const edge = arenaConfig().worldWidth - 10;
        const w = pair({ x: edge, y: 4400, angle: 0 });
        evaderBrain({ pursuer: 0, evader: 1, sprint: true })(w);
        const without = out(w, 1, OUTPUT_INDEX.TURN);
        evaderBrain({ pursuer: 0, evader: 1, sprint: true, wallMargin: 600 })(w);
        expect(out(w, 1, OUTPUT_INDEX.TURN)).toBeGreaterThan(without + 0.5);
    });

    it('breaks to the positive side when the pursuer is dead ahead', () => {
        const ahead = pair({ x: 4040, y: 4000, angle: 0 });
        evaderBrain({ pursuer: 0, evader: 1, sprint: true })(ahead);
        expect(out(ahead, 1, OUTPUT_INDEX.TURN)).toBe(1);
    });

    it("breaks across the pursuer's velocity, not its facing, once the pursuer is moving", () => {
        const w = pair({ x: 4040, y: 4030, angle: 0 });
        w.vx[0] = 0;
        w.vy[0] = 5;
        evaderBrain({ pursuer: 0, evader: 1, sprint: true })(w);
        expect(out(w, 1, OUTPUT_INDEX.TURN)).toBeCloseTo(0, 6);
    });

    it('stays finite when the evader stands on the pursuer and bends along a wall', () => {
        const w = pair({ x: 4000, y: 4000, angle: 0 });
        evaderBrain({ pursuer: 0, evader: 1, sprint: true, jinkRange: 0, wallMargin: 600 })(w);
        expect(Number.isFinite(out(w, 1, OUTPUT_INDEX.TURN))).toBe(true);
    });
});

describe('steer', () => {
    it('is 0 for a zero aim and a full turn for an aim exactly behind', () => {
        const w = pair({ x: 4100, y: 4000 });
        expect(steer(w, 0, { x: 0, y: 0 })).toBe(0);
        expect(steer(w, 0, { x: -50, y: 0 })).toBe(1);
        expect(steer(w, 0, { x: -50, y: -1 })).toBe(-1);
    });

    it('scales with the turn lane of the body: a body that turns twice as fast steers half as hard', () => {
        const w = pair({ x: 4100, y: 4000 });
        const aim = { x: 1000, y: 10 };
        const slow = steer(w, 0, aim);
        w.lanes.maxTurn[0] *= 2;
        expect(steer(w, 0, aim)).toBeCloseTo(slow / 2, 12);
    });
});

describe('the oracles with the sprint store on', () => {
    /**
     * @param {{x: number, y: number}} evader where the evader stands
     * @returns {Record<string, any>} the pair in an arena with the store on, both stores full
     */
    const stored = (evader) =>
        stageArena(arenaConfig({ sprintStoreEnabled: true }), [
            { spec: PREDATOR, x: 4000, y: 4000, angle: 0 },
            { spec: FORAGER, angle: 0, ...evader },
        ]).world;
    const sprinting = (/** @type {Record<string, any>} */ w) => {
        pursuerBrain({ pursuer: 0, evader: 1, sprint: true })(w);
        evaderBrain({ pursuer: 0, evader: 1, sprint: true })(w);
        return [out(w, 0, OUTPUT_INDEX.SPRINT), out(w, 1, OUTPUT_INDEX.SPRINT)];
    };

    it('sprint while their stores are above the floor, and stop under it', () => {
        const w = stored({ x: 4200, y: 4000 });
        expect(sprinting(w)).toEqual([1, 1]);
        const floor = w.lanes.sprintFloor[0];
        w.sprintStore.level[0] = floor;
        w.sprintStore.level[1] = floor / 2;
        expect([storeAboveFloor(w, 0), storeAboveFloor(w, 1)]).toEqual([false, false]);
        expect(sprinting(w)).toEqual([0, 0]);
    });

    it('the pursuer sprints only with the evader in view, the evader only with the pursuer near', () => {
        const view = stored({ x: 4000, y: 4000 }).lanes.visionRange[0];
        const far = stored({ x: 4000 + view + 10, y: 4000 });
        expect(sprinting(far)).toEqual([0, 0]);
        const mid = stored({ x: 4000 + EVADER_SPRINT_JINKS * JINK_RANGE + 10, y: 4000 });
        expect(sprinting(mid)).toEqual([1, 0]);
    });

    it('the pursuer sprints at an evader inside its vision lane, and not outside it', () => {
        const w = stored({ x: 4400, y: 4000 });
        const sprints = () => {
            pursuerBrain({ pursuer: 0, evader: 1, sprint: true })(w);
            return out(w, 0, OUTPUT_INDEX.SPRINT);
        };
        w.lanes.visionRange[0] = 500;
        expect(sprints()).toBe(1);
        w.lanes.visionRange[0] = 300;
        expect(sprints()).toBe(0);
    });

    it('sprint as asked whatever the distance with the store off', () => {
        const w = pair({ x: 4000 + 2000, y: 4000 });
        expect(storeAboveFloor(w, 0)).toBe(true);
        expect(sprinting(w)).toEqual([1, 1]);
    });
});
