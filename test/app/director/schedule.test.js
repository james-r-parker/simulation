import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import { createDirector, stepDirector } from '../../../js/app/director/director.js';
import { lingerOver } from '../../../js/app/director/linger.js';
import {
    ceilingReached,
    floorReached,
    SHOT_CEILING_S,
    SHOT_FLOOR_S,
    wideDue,
    WIDE_MAX_GAP_S,
} from '../../../js/app/director/schedule.js';
import { EFFECT_BITS } from '../../../js/app/director/scoring.js';

const CANVAS = Object.freeze({ width: 3840, height: 2160 });
const WORLD = Object.freeze({ width: 14400, height: 8100 });
const INFO = Object.freeze({
    worldWidth: 14400,
    worldHeight: 8100,
    ticksPerSecond: 60,
    biteArc: Math.PI / 3,
    maxVelocity: 8,
    specs: [{ index: 0, name: 'forager', canHunt: false }],
});
const LAYOUT = Object.freeze({
    flags: { HUNTING: 1 << 16 },
    effectKinds: { BORN: 1, DIED: 2, BITE: 3, ALARM: 4, PACK_CALL: 5, SMOKE: 6, ESCAPED: 7 },
    deathCauses: { EATEN: 1 },
});
const KILL_C = (1 << EFFECT_BITS.CAUSE_SHIFT) | EFFECT_BITS.DIED_DELIBERATE;
const AGENTS = [{ genomeId: 1, lineageId: 1, spec: 0, x: 3000, y: 2000, angle: 0, size: 12, speed: 4, flags: 0 }];

/**
 * Runs the director for `seconds` of simulated time with a deliberate kill every `everyS` seconds, and returns the
 * shots (glide start to pullback start) and the wide starts.
 * @param {{seconds: number, everyS: number, kills?: boolean}} options how long and how busy
 * @returns {{shots: {startS: number, endS: number}[], wides: number[], logs: any[]}} what it did
 */
function run({ seconds, everyS, kills = true }) {
    const logs = /** @type {any[]} */ ([]);
    const camera = createCameraController({ canvas: CANVAS, world: WORLD });
    const director = createDirector({
        seed: 3,
        canvas: CANVAS,
        world: WORLD,
        log: (_level, _event, fields) => logs.push(fields),
    });
    director.startNow();
    const shots = /** @type {{startS: number, endS: number}[]} */ ([]);
    const wides = /** @type {number[]} */ ([]);
    const effects = /** @type {any[]} */ ([]);
    let last = '';
    let open = -1;
    for (let t = 0; t <= seconds; t += 0.5) {
        const tick = Math.round(t * 60);
        if (kills && t % everyS === 0 && t > 0) {
            effects.push({
                tick,
                kind: LAYOUT.effectKinds.DIED,
                x: 2000 + t,
                y: 3000,
                a: 1,
                b: 2 + (t % 7),
                c: (t / everyS) % 2 === 0 ? KILL_C : KILL_C | EFFECT_BITS.DIED_PACK,
            });
        }
        const out = stepDirector(director, {
            tick,
            dtMs: 500,
            snapshot: AGENTS,
            effects: effects.filter((e) => tick - e.tick <= 600),
            info: INFO,
            layout: LAYOUT,
            camera,
        });
        const key = `${out.state}@${out.shot?.startTimeS}`;
        if (key !== last) {
            if (out.state === 'glide') {
                open = t;
            } else if (out.state === 'pullback' && open >= 0) {
                shots.push({ startS: open, endS: t });
                open = -1;
            } else if (out.state === 'wide') {
                wides.push(t);
            }
            last = key;
        }
    }
    return { shots, wides, logs };
}

describe('the shot schedule rules', () => {
    it('keeps every shot between the floor and the ceiling over a long busy run', () => {
        const { shots, logs } = run({ seconds: 3600, everyS: 7 });
        expect(shots.length).toBeGreaterThan(10);
        for (const { startS, endS } of shots) {
            expect(endS - startS).toBeGreaterThanOrEqual(SHOT_FLOOR_S);
            expect(endS - startS).toBeLessThanOrEqual(SHOT_CEILING_S);
        }
        expect(logs.length - shots.length).toBeLessThanOrEqual(1);
    });

    it('shows a wide shot at least every ten minutes, busy or quiet', () => {
        for (const kills of [true, false]) {
            const { wides } = run({ seconds: 2400, everyS: 5, kills });
            expect(wides.length).toBeGreaterThan(0);
            const marks = [0, ...wides, 2400];
            for (let i = 1; i < marks.length; i++) {
                expect(marks[i] - marks[i - 1]).toBeLessThanOrEqual(WIDE_MAX_GAP_S);
            }
        }
    });

    it('logs each shot with its kind, subject, score and length', () => {
        const { logs } = run({ seconds: 300, everyS: 7 });
        expect(logs.length).toBeGreaterThan(0);
        expect(logs[0]).toMatchObject({
            kind: expect.any(String),
            subject: expect.any(Number),
            score: expect.any(Number),
            ms: expect.any(Number),
        });
    });
});

describe('lingerOver', () => {
    const base = () => ({
        shot: { startTimeS: 100, durationS: 8 },
        shotStartS: 97,
        lastWideS: 90,
        lowScoreSinceS: /** @type {number | null} */ (null),
    });

    it('does not end a quiet moment before the floor, then ends it after two quiet seconds', () => {
        const state = base();
        expect(floorReached(SHOT_FLOOR_S - 0.1)).toBe(false);
        expect(lingerOver(state, { timeS: 98, score: 10 })).toBe(false);
        expect(lingerOver(state, { timeS: 100.5, score: 10 })).toBe(false);
        expect(lingerOver(state, { timeS: 103, score: 10 })).toBe(true);
    });

    it('extends a strong moment up to its cap and ends it at the planned time otherwise', () => {
        const state = base();
        expect(lingerOver(state, { timeS: 108, score: 80 })).toBe(false);
        expect(state.shot.durationS).toBe(12);
        expect(lingerOver(state, { timeS: 108, score: 35 })).toBe(false);
        expect(lingerOver({ ...base(), shot: { startTimeS: 100, durationS: 20 } }, { timeS: 120, score: 80 })).toBe(
            true,
        );
    });

    it('ends a shot at the ceiling and when a wide shot is overdue', () => {
        expect(ceilingReached(SHOT_CEILING_S)).toBe(true);
        expect(ceilingReached(SHOT_CEILING_S - 1)).toBe(false);
        expect(lingerOver({ ...base(), shotStartS: 0, lastWideS: 0 }, { timeS: SHOT_CEILING_S, score: 99 })).toBe(true);
        expect(wideDue(WIDE_MAX_GAP_S - 1, 0)).toBe(false);
        expect(wideDue(WIDE_MAX_GAP_S, 0)).toBe(true);
        expect(lingerOver({ ...base(), shotStartS: 590, lastWideS: 0 }, { timeS: 601, score: 99 })).toBe(true);
    });
});
