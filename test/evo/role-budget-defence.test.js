import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { defenceTimeline } from '../../js/evo/role-budget-defence.js';
import { roleParams } from '../../js/evo/role-budget-params.js';

const BASE = { reaction: 2, threshold: 0.1, side: 150 };
/** A slow world with the shove on: the defender can arrive before the kill. */
const SLOW = {
    maxVelocity: 4.5,
    defenderRepelEnergy: 40,
    defenderRepelImpulse: 4,
    defenderRepelCost: 2,
    specialisations: { predator: { sprintBoost: 0.5 } },
};

/** @param {Record<string, any>} [overrides] config overrides @returns {import('../../js/evo/role-budget-params.js').RoleParams[]} */
const bodies = (overrides = {}) => {
    const config = arenaConfig(overrides);
    return ['predator', 'forager', 'defender'].map((name) => roleParams(config, name));
};
const play = (/** @type {Record<string, any>} */ config, /** @type {Record<string, any>} */ options = {}) => {
    const [hunter, caller, defender] = bodies(config);
    return defenceTimeline(hunter, caller, defender, { ...BASE, ...options });
};

describe('defenceTimeline', () => {
    it('with no defender, the hunter kills the standing forager at contact plus bitesToKill - 1', () => {
        const run = play({}, { absent: true });
        expect(run.contactTick).toBe(23);
        expect(run.bites).toBe(5);
        expect(run.killTick).toBe(27);
        expect(run.heardTick).toBe(-1);
        expect(run.interceptTick).toBeNull();
    });

    it('fires the alarm reaction ticks after the caller sees the hunter, and the defender hears it one tick later', () => {
        const run = play({});
        expect(run.alarmTick).toBe(2);
        expect(run.heardTick).toBe(3);
        expect(run.startTick).toBe(5);
        expect(play({}, { reaction: 0 }).startTick).toBe(1);
    });

    it('cuts the bite to alarmBiteShare while the seen alarm runs, so the kill needs more bites', () => {
        const full = play({}, { absent: true });
        const cut = play({ alarmBiteShare: 0.5 }, { absent: true });
        expect(cut.bites).toBeGreaterThan(full.bites);
        expect(cut.killTick).toBeGreaterThan(/** @type {number} */ (full.killTick));
    });

    it('never hears a call from beyond callRadius, nor one that has faded below the threshold', () => {
        expect(play({}, { side: 300 }).heardTick).toBe(-1);
        expect(play(SLOW, { side: 40, delays: { hear: 54 } }).heardTick).toBe(-1);
        expect(play(SLOW, { side: 40, delays: { hear: 40 } }).heardTick).toBe(43);
    });

    it('a delay at a step moves the defender later, never earlier', () => {
        const none = play(SLOW, { side: 40 });
        for (const step of ['hear', 'turn', 'run']) {
            const late = play(SLOW, { side: 40, delays: { [step]: 8 } });
            expect(late.interceptTick ?? Infinity).toBeGreaterThanOrEqual(none.interceptTick ?? Infinity);
        }
    });

    it('lands the shove on a hunter in its jaws: the hunter loses energy and the kill comes later', () => {
        const alone = play(SLOW, { side: 40, absent: true });
        const run = play(SLOW, { side: 40 });
        expect(run.interceptTick).not.toBeNull();
        expect(run.repelTick).not.toBeNull();
        expect(run.repels).toBeGreaterThan(0);
        expect(run.killTick === null || run.killTick > /** @type {number} */ (alone.killTick)).toBe(true);
    });

    it('lands no shove with the shove off, though the defender still touches the hunter', () => {
        const run = play({ ...SLOW, defenderRepelEnergy: 0, defenderRepelImpulse: 0 }, { side: 40 });
        expect(run.interceptTick).not.toBeNull();
        expect(run.repelTick).toBeNull();
        expect(run.repels).toBe(0);
    });

    it('records the positions of the hunter and the defender each tick when asked', () => {
        /** @type {number[][]} */
        const trace = [];
        play({}, { trace });
        expect(trace[0]).toEqual([0, expect.any(Number), 0, expect.any(Number), 150]);
        expect(trace.length).toBe(27);
    });

    it('a hunter that starts from rest reaches the caller later than one that was creeping', () => {
        const creeping = play({}, { absent: true });
        const rest = play({}, { absent: true, hunterStart: 'rest' });
        expect(/** @type {number} */ (rest.contactTick)).toBeGreaterThan(/** @type {number} */ (creeping.contactTick));
    });

    it('charges strikeMissCost each tick the hunter has nothing in its jaws, as the chase does', () => {
        const free = play({ strikeMissCost: 0 }, { absent: true });
        const paid = play({ strikeMissCost: 2 }, { absent: true });
        expect(paid.hunterEnergy).toBeLessThan(free.hunterEnergy);
    });

    it('a hunter bites the defender dead when it touches it, and lies up predatorRestTicks before it goes on to the caller', () => {
        const run = play(SLOW, { side: 150 });
        const killed = /** @type {number} */ (run.defenderKillTick);
        expect(killed).toBe(111);
        expect(run.killTick).toBe(201);
        const unrested = play({ ...SLOW, predatorRestTicks: 0 }, { side: 150 });
        expect(/** @type {number} */ (run.killTick) - /** @type {number} */ (unrested.killTick)).toBeGreaterThanOrEqual(
            50,
        );
    });

    it('kills no defender it never touches, and none when there is none', () => {
        expect(play({}).defenderKillTick).toBeNull();
        expect(play(SLOW, { absent: true }).defenderKillTick).toBeNull();
    });

    it('a shove that staggers the hunter closes its bite and slows it, so the guard on its line lives', () => {
        const between = { posture: /** @type {const} */ ('between'), side: 87 };
        const free = play(SLOW, between);
        const staggered = play({ ...SLOW, staggerThrust: 0.5 }, between);
        expect(free.defenderKillTick).not.toBeNull();
        expect(
            staggered.defenderKillTick === null ||
                staggered.defenderKillTick > /** @type {number} */ (free.defenderKillTick),
        ).toBe(true);
    });
});
