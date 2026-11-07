import { describe, expect, it } from 'vitest';
import { createRng, fork } from '../../js/sim/rng.js';
import { FORAGER_CASES, FORAGER_BARS } from '../../js/evo/reflex-cases-forager.js';
import { DEG, SEQUENCE_TICKS } from '../../js/evo/reflex-stage.js';

const VIEW = 300;
const byName = (/** @type {string} */ name) => {
    const found = FORAGER_CASES.find((c) => c.name === name);
    if (found === undefined) {
        throw new Error(`no case ${name}`);
    }
    return found;
};
const plan = (/** @type {string} */ name, seed = 1) => byName(name).plan(fork(createRng(seed), `reflex:${name}`), VIEW);
const out = (/** @type {number} */ thrust, /** @type {number} */ turn) => ({ thrust, turn, sprint: 0, bite: 0 });

/**
 * @param {any} stage a staged tick
 * @param {{x: number, y: number}} item an item's centre
 * @returns {{bearing: number, distance: number}} the item's bearing in the subject's frame and its distance
 */
function frame(stage, item) {
    const subject = stage.agents[0];
    const dx = item.x - subject.x;
    const dy = item.y - subject.y;
    const raw = Math.atan2(dy, dx) - subject.angle;
    return { bearing: Math.atan2(Math.sin(raw), Math.cos(raw)), distance: Math.hypot(dx, dy) };
}

describe('FORAGER_CASES', () => {
    it('are the four forager cases, each for foragers', () => {
        expect(FORAGER_CASES.map((c) => c.name)).toEqual([
            'flee-threat',
            'approach-food',
            'pick-safe-food',
            'avoid-obstacle',
        ]);
        expect(FORAGER_CASES.every((c) => c.spec === 0 && c.scene.length > 0)).toBe(true);
    });

    it('plan the same trial for the same stream and a different one for another', () => {
        expect(plan('flee-threat', 4)).toEqual(plan('flee-threat', 4));
        expect(plan('flee-threat', 4)).not.toEqual(plan('flee-threat', 5));
    });
});

describe('flee-threat', () => {
    it('stages a hunter closing in the fan, mirrored, as a moving item', () => {
        const stagings = plan('flee-threat');
        expect(stagings.map((s) => s.mirror)).toEqual([1, -1]);
        expect(stagings[1].bearing).toBeCloseTo(-stagings[0].bearing, 12);
        for (const s of stagings) {
            expect(s.ticks).toHaveLength(SEQUENCE_TICKS);
            const distances = s.ticks.map((t) => {
                const f = frame(t, t.agents[1]);
                expect(f.bearing).toBeCloseTo(s.bearing, 6);
                return f.distance;
            });
            expect(distances.every((d, i) => i === 0 || d < distances[i - 1])).toBe(true);
            expect(distances[0] / VIEW).toBeCloseTo(0.5, 6);
            expect(distances[SEQUENCE_TICKS - 1] / VIEW).toBeCloseTo(0.3, 6);
            expect(s.ticks[0].agents[1].spec).toBe(1);
        }
    });

    it('passes thrust away from the threat, and thrust alone when it is behind', () => {
        const staging = { kind: 'threat', bearing: 90 * DEG, mirror: 1, ticks: [] };
        const check = byName('flee-threat').check;
        expect(check(out(1, -1), /** @type {any} */ (staging))).toBe(true);
        expect(check(out(1, 1), /** @type {any} */ (staging))).toBe(false);
        expect(check(out(1, 0), /** @type {any} */ (staging))).toBe(false);
        expect(check(out(0.1, -1), /** @type {any} */ (staging))).toBe(false);
        expect(check(out(1, 1), /** @type {any} */ ({ ...staging, bearing: -90 * DEG }))).toBe(true);
        const behind = { ...staging, bearing: 170 * DEG };
        expect(check(out(0.6, 0), /** @type {any} */ (behind))).toBe(true);
        expect(check(out(0.4, 0), /** @type {any} */ (behind))).toBe(false);
    });
});

describe('approach-food', () => {
    it('stages one food in view, wide of the heading or inside the ray-0 cone', () => {
        const kinds = new Set();
        for (let seed = 1; seed <= 40; seed++) {
            for (const s of plan('approach-food', seed)) {
                kinds.add(s.kind);
                const food = s.ticks[0].foods[0];
                const f = frame(s.ticks[0], food);
                expect(f.bearing).toBeCloseTo(s.bearing, 6);
                expect(f.distance).toBeGreaterThanOrEqual(0.4 * VIEW - 1e-6);
                expect(f.distance).toBeLessThanOrEqual(0.8 * VIEW + 1e-6);
                expect(s.ticks).toHaveLength(1);
                const size = Math.abs(s.bearing);
                expect(s.kind === 'ahead' ? size <= 5 * DEG + 1e-9 : size >= 15 * DEG - 1e-9).toBe(true);
                expect(size).toBeLessThanOrEqual(160 * DEG + 1e-9);
            }
        }
        expect([...kinds].sort()).toEqual(['ahead', 'wide']);
    });

    it('passes a turn towards the food, and straight thrust for food ahead', () => {
        const check = byName('approach-food').check;
        const wide = /** @type {any} */ ({ kind: 'wide', bearing: 60 * DEG });
        expect(check(out(0.4, 1), wide)).toBe(true);
        expect(check(out(0.4, -1), wide)).toBe(false);
        expect(check(out(0.4, 0), wide)).toBe(false);
        expect(check(out(0, 1), wide)).toBe(false);
        const ahead = /** @type {any} */ ({ kind: 'ahead', bearing: 2 * DEG });
        expect(check(out(0.4, 0.1), ahead)).toBe(true);
        expect(check(out(0.4, 1), ahead)).toBe(false);
        expect(check(out(0, 0), ahead)).toBe(false);
    });
});

describe('pick-safe-food', () => {
    it('stages a nearer toxic food and a farther safe one on the other side', () => {
        for (const s of plan('pick-safe-food', 2)) {
            const [toxic, safe] = s.ticks[0].foods;
            expect(toxic.toxicity).toBeGreaterThan(0);
            expect(safe.toxicity).toBe(0);
            const ft = frame(s.ticks[0], toxic);
            const fs = frame(s.ticks[0], safe);
            expect(ft.distance).toBeLessThan(fs.distance);
            expect(Math.sign(ft.bearing)).toBe(-Math.sign(fs.bearing));
            expect(fs.bearing).toBeCloseTo(s.bearing, 6);
        }
    });

    it('passes a turn to the safe side with thrust, and nothing else', () => {
        const check = byName('pick-safe-food').check;
        const s = /** @type {any} */ ({ kind: 'safe', bearing: -40 * DEG });
        expect(check(out(0.4, -1), s)).toBe(true);
        expect(check(out(0.4, 1), s)).toBe(false);
        expect(check(out(0, 0), s)).toBe(false);
        expect(check(out(1, 0), s)).toBe(false);
    });
});

describe('avoid-obstacle', () => {
    it('stages a wall, a rock ahead and a rock beside with food ahead, mirrored', () => {
        const stagings = plan('avoid-obstacle');
        expect(stagings.map((s) => s.kind)).toEqual([
            'wall',
            'rock-ahead',
            'rock-beside',
            'wall',
            'rock-ahead',
            'rock-beside',
        ]);
        const [wall, ahead, beside] = stagings;
        const subject = wall.ticks[0].agents[0];
        expect(subject.x).toBeCloseTo(0.3 * VIEW, 6);
        expect(Math.cos(subject.angle)).toBeLessThan(0);
        expect(ahead.ticks[0].rocks).toHaveLength(1);
        const rock = frame(ahead.ticks[0], ahead.ticks[0].rocks[0]);
        expect(rock.distance / VIEW).toBeCloseTo(0.3, 6);
        expect(Math.abs(rock.bearing)).toBeLessThanOrEqual(25 * DEG + 1e-9);
        const side = frame(beside.ticks[0], beside.ticks[0].rocks[0]);
        expect(Math.abs(side.bearing)).toBeGreaterThanOrEqual(60 * DEG - 1e-9);
        expect(Math.abs(side.bearing)).toBeLessThanOrEqual(90 * DEG + 1e-9);
        expect(frame(beside.ticks[0], beside.ticks[0].foods[0]).bearing).toBeCloseTo(0, 6);
        expect(stagings[3].bearing).toBeCloseTo(-wall.bearing, 12);
    });

    it('passes a turn away from a wall or rock ahead, or a stop; and passes a rock beside only straight on', () => {
        const check = byName('avoid-obstacle').check;
        const rock = /** @type {any} */ ({ kind: 'rock-ahead', bearing: 20 * DEG });
        expect(check(out(0.8, -0.5), rock)).toBe(true);
        expect(check(out(0.8, 0.5), rock)).toBe(false);
        expect(check(out(0.8, 0), rock)).toBe(false);
        expect(check(out(0, 0), rock)).toBe(true);
        const dead = /** @type {any} */ ({ kind: 'wall', bearing: DEG });
        expect(check(out(0.8, 0.5), dead)).toBe(true);
        expect(check(out(0.8, -0.5), dead)).toBe(true);
        const beside = /** @type {any} */ ({ kind: 'rock-beside', bearing: 70 * DEG });
        expect(check(out(0.5, 0.1), beside)).toBe(true);
        expect(check(out(0.5, 0.9), beside)).toBe(false);
        expect(check(out(0, 0), beside)).toBe(false);
    });
});

describe('FORAGER_BARS', () => {
    it('hold the starting values of the doc, calibrated', () => {
        expect(FORAGER_BARS.turn).toBe(0.15);
        expect(FORAGER_BARS.fleeBehindThrust).toBeGreaterThan(FORAGER_BARS.fleeThrust);
    });
});
