import { describe, expect, it } from 'vitest';
import { createRng, fork } from '../../js/sim/rng.js';
import { SOCIAL_DRILLS } from '../../js/evo/drill-scenarios-social.js';
import { DRILLS } from '../../js/evo/drill-scenarios.js';
import { CENTRE_X, CENTRE_Y, PREY_VIEW_SHARE } from '../../js/evo/memory-probe-scenarios.js';

const byName = (/** @type {string} */ name) => /** @type {any} */ (SOCIAL_DRILLS.find((d) => d.name === name));
const stream = (/** @type {string} */ name, seed = 1) => fork(createRng(seed), `drill:${name}`);
const DEG = 180 / Math.PI;
const wrap = (/** @type {number} */ a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * @param {{x: number, y: number}} to the point
 * @param {number} heading the subject's heading
 * @returns {number} the point's bearing from the arena's centre, off the heading, in degrees
 */
function bearingOff(to, heading) {
    return Math.abs(wrap(Math.atan2(to.y - CENTRE_Y, to.x - CENTRE_X) - heading)) * DEG;
}

describe('SOCIAL_DRILLS', () => {
    it('are listed by DRILLS after the seven, each with its own scene', () => {
        expect(DRILLS.slice(7, 7 + SOCIAL_DRILLS.length)).toEqual([...SOCIAL_DRILLS]);
        expect(SOCIAL_DRILLS.every((d) => d.scene.length > 0)).toBe(true);
    });

    it('stage the same trial from the same stream and another from another seed', () => {
        for (const drill of SOCIAL_DRILLS) {
            const a = drill.plan(stream(drill.name), 300).stage;
            expect(drill.plan(stream(drill.name), 300).stage).toEqual(a);
            expect(drill.plan(stream(drill.name, 2), 300).stage).not.toEqual(a);
        }
    });

    it('stage every agent inside the arena', () => {
        for (const drill of SOCIAL_DRILLS) {
            const rng = stream(drill.name);
            for (let t = 0; t < 20; t++) {
                for (const p of drill.plan(rng, 350).stage.agents) {
                    expect(p.x).toBeGreaterThan(0);
                    expect(p.x).toBeLessThan(3000);
                    expect(p.y).toBeGreaterThan(0);
                    expect(p.y).toBeLessThan(4000);
                }
            }
        }
    });
});

describe('prey-crossing', () => {
    it('stages one forager at 0.6 of the view whose heading is 60 to 120 degrees off the predator heading', () => {
        const drill = byName('prey-crossing');
        const rng = stream('prey-crossing');
        for (let t = 0; t < 30; t++) {
            const { agents } = drill.plan(rng, 300).stage;
            expect(agents).toHaveLength(2);
            expect(agents[0]).toMatchObject({ role: 'subject', spec: 1 });
            expect(agents[1]).toMatchObject({ role: 'prey', spec: 0 });
            expect(Math.hypot(agents[1].x - CENTRE_X, agents[1].y - CENTRE_Y)).toBeCloseTo(PREY_VIEW_SHARE * 300, 6);
            const off = Math.abs(wrap(agents[1].angle - agents[0].angle)) * DEG;
            expect(off).toBeGreaterThanOrEqual(60 - 1e-6);
            expect(off).toBeLessThanOrEqual(120 + 1e-6);
        }
    });

    it('is won by a kill and lost by a prey that died of something else', () => {
        const plan = byName('prey-crossing').plan(stream('prey-crossing'), 300);
        const world = (/** @type {number} */ preyAlive, /** @type {number} */ kills) =>
            /** @type {any} */ ({ alive: Uint8Array.of(1, preyAlive), deliberateKills: Uint32Array.of(kills, 0) });
        expect([plan.won(world(0, 1)), plan.won(world(0, 0)), plan.won(world(1, 0))]).toEqual([true, false, false]);
    });
});

describe('hunter-flank', () => {
    it('stages the hunter 500 px away, 90 to 150 degrees off the forager heading and facing it', () => {
        const drill = byName('hunter-flank');
        const rng = stream('hunter-flank');
        for (let t = 0; t < 30; t++) {
            const { agents } = drill.plan(rng, 300).stage;
            expect(agents[0]).toMatchObject({ role: 'subject', spec: 0 });
            expect(agents[1]).toMatchObject({ role: 'hunter', spec: 1 });
            expect(Math.hypot(agents[1].x - CENTRE_X, agents[1].y - CENTRE_Y)).toBeCloseTo(500, 6);
            const off = bearingOff(agents[1], agents[0].angle);
            expect(off).toBeGreaterThanOrEqual(90 - 1e-6);
            expect(off).toBeLessThanOrEqual(150 + 1e-6);
            const toSubject = Math.atan2(CENTRE_Y - agents[1].y, CENTRE_X - agents[1].x);
            expect(Math.abs(wrap(agents[1].angle - toSubject))).toBeLessThan(1e-6);
        }
    });

    it('is won by a subject that is alive and lost by one that is not', () => {
        const plan = byName('hunter-flank').plan(stream('hunter-flank'), 300);
        const world = (/** @type {number} */ alive) => /** @type {any} */ ({ alive: Uint8Array.of(alive, 1) });
        expect([plan.won(world(1)), plan.won(world(0)), plan.done(world(0), /** @type {any} */ ({}))]).toEqual([
            true,
            false,
            true,
        ]);
    });
});

describe('kin-spared', () => {
    it('stages a sibling that shares a parent with the subject inside its jaws, and a forager ahead on the other side', () => {
        const drill = byName('kin-spared');
        const rng = stream('kin-spared');
        for (let t = 0; t < 30; t++) {
            const { agents } = drill.plan(rng, 400).stage;
            expect(agents.map((/** @type {any} */ a) => a.role)).toEqual(['subject', 'prey', 'sibling']);
            expect(agents[2].parents[0]).not.toBe(0);
            expect(agents[2].parents).toEqual(agents[0].parents);
            expect(agents[1].parents).toBeUndefined();
            expect(Math.hypot(agents[2].x - CENTRE_X, agents[2].y - CENTRE_Y)).toBeCloseTo(40, 6);
            expect(bearingOff(agents[2], agents[0].angle)).toBeCloseTo(45, 6);
            expect(Math.hypot(agents[1].x - CENTRE_X, agents[1].y - CENTRE_Y)).toBeCloseTo(PREY_VIEW_SHARE * 400, 6);
            expect(bearingOff(agents[1], agents[0].angle)).toBeLessThanOrEqual(45 + 1e-6);
            const side = (/** @type {any} */ p) =>
                Math.sign(wrap(Math.atan2(p.y - CENTRE_Y, p.x - CENTRE_X) - agents[0].angle));
            expect(side(agents[1])).toBe(-side(agents[2]));
        }
    });

    it('is staged with a trace that reports the sibling in the jaws', () => {
        const plan = byName('kin-spared').plan(stream('kin-spared'), 400);
        expect(plan.trace(false)).toMatchObject({ kinJawTicks: 0, kinBiteTicks: 0 });
    });
});

describe('pack-converge', () => {
    it('stages three sibling hunters abreast and one prey ahead that one bite cannot kill, with the probe arena rules', () => {
        const drill = byName('pack-converge');
        const { agents } = drill.plan(stream('pack-converge'), 400).stage;
        expect(agents.map((/** @type {any} */ a) => a.role)).toEqual(['subject', 'subject', 'subject', 'prey']);
        expect(new Set(agents.slice(0, 3).map((/** @type {any} */ a) => a.parents[0])).size).toBe(1);
        expect(agents[0].parents[0]).not.toBe(0);
        expect(agents[3].energy).toBe(2000);
        expect(Math.hypot(agents[3].x - CENTRE_X, agents[3].y - CENTRE_Y)).toBeCloseTo(PREY_VIEW_SHARE * 400, 6);
        expect(drill.arena).toEqual({ wallDamage: 0 });
        expect(drill.needsHunter).toBe(true);
    });

    it('has a solo arm of one hunter and a kin-blind arm of three on the same bearings as the trio', () => {
        const drill = byName('pack-converge');
        expect(drill.arms.map((/** @type {any} */ a) => [a.name, a.controlSpec])).toEqual([
            ['solo', { name: 'solo' }],
            ['kin-blind', { name: 'kin-blind', kinBlind: true }],
        ]);
        const trio = drill.plan(stream('pack-converge'), 400).stage.agents;
        const [solo, blind] = drill.arms.map(
            (/** @type {any} */ arm) => arm.plan(stream('pack-converge'), 400).stage.agents,
        );
        expect(solo).toHaveLength(2);
        expect(blind).toEqual(trio);
        expect(solo[1]).toEqual(trio[3]);
        expect(solo[0].angle).toBe(trio[0].angle);
    });

    it('is won when the prey (the slot after the hunters) is dead', () => {
        const plan = byName('pack-converge').plan(stream('pack-converge'), 400);
        const world = (/** @type {number} */ prey) => /** @type {any} */ ({ alive: Uint8Array.of(1, 1, 1, prey) });
        expect([plan.won(world(0)), plan.won(world(1)), plan.done(world(0), /** @type {any} */ ({}))]).toEqual([
            true,
            false,
            true,
        ]);
    });
});
