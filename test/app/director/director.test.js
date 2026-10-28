import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import {
    createDirector,
    DIRECTOR_IDLE_MS,
    DIRECTOR_SEED_XOR,
    MAX_SNAPSHOT_HISTORY,
    stepDirector,
} from '../../../js/app/director/director.js';
import { EFFECT_BITS } from '../../../js/app/director/scoring.js';
import { SHOT_STATE } from '../../../js/app/director/shots.js';

const CANVAS = Object.freeze({ width: 3840, height: 2160 });
const WORLD = Object.freeze({ width: 14400, height: 8100 });
const INFO = Object.freeze({
    worldWidth: 14400,
    worldHeight: 8100,
    ticksPerSecond: 60,
    biteArc: Math.PI / 3,
    maxVelocity: 8,
    specs: [
        { index: 0, name: 'forager', canHunt: false },
        { index: 1, name: 'predator', canHunt: true },
    ],
});
const LAYOUT = Object.freeze({
    flags: { HUNTING: 1 << 16 },
    effectKinds: { BORN: 1, DIED: 2, BITE: 3, ALARM: 4, PACK_CALL: 5, SMOKE: 6, ESCAPED: 7 },
    deathCauses: { EATEN: 1 },
});

const SAMPLE_AGENTS = Object.freeze([
    { genomeId: 1, lineageId: 10, spec: 0, x: 3000, y: 2000, angle: 0, size: 12, speed: 4, flags: 0 },
    { genomeId: 2, lineageId: 20, spec: 1, x: 7000, y: 4000, angle: 0, size: 18, speed: 5, flags: 0 },
]);

/**
 * Builds a gap-closing chase pair at `xOffset`.
 * @param {number} [xOffset] horizontal offset for the current snapshot
 * @returns {import('../../../js/app/director/moments.js').AgentRecord[]} hunter-prey pair
 */
function makeChasePair(xOffset = 0) {
    return [
        {
            genomeId: 10,
            lineageId: 1,
            spec: 1,
            x: 4100 + xOffset,
            y: 3000,
            angle: 0,
            size: 18,
            speed: 9,
            flags: 1 << 16,
        },
        {
            genomeId: 11,
            lineageId: 2,
            spec: 0,
            x: 4300 + xOffset,
            y: 3000,
            angle: 0,
            size: 12,
            speed: 9,
            flags: 0,
        },
    ];
}

const EARLIER_CHASE = Object.freeze([
    { genomeId: 10, lineageId: 1, spec: 1, x: 4000, y: 3000, angle: 0, size: 18, speed: 9, flags: 1 << 16 },
    { genomeId: 11, lineageId: 2, spec: 0, x: 4300, y: 3000, angle: 0, size: 12, speed: 9, flags: 0 },
]);

describe('js/app/director/director', () => {
    it('stays inactive before 10 s idle, activates at 10 s and returns control at once on input', () => {
        expect(DIRECTOR_SEED_XOR).toBe(0x9e3779b9);
        const selections = /** @type {number[]} */ ([]);
        const speeds = /** @type {number[]} */ ([]);
        const director = createDirector({
            seed: 42,
            canvas: CANVAS,
            world: WORLD,
            viewerSpeed: 2,
            log: () => {},
            onSelect: (id) => selections.push(id),
            onSpeed: (s) => speeds.push(s),
            speedForState: (shotState, s0) => (shotState === SHOT_STATE.WIDE ? Math.max(s0, 4) : 1),
        });

        expect(director.isEnabled()).toBe(true);
        expect(director.isActive()).toBe(false);

        const beforeIdle = stepDirector(director, {
            timeS: 0,
            idleMs: DIRECTOR_IDLE_MS - 1,
            snapshot: SAMPLE_AGENTS,
            info: INFO,
            layout: LAYOUT,
            viewerSpeed: 2,
        });
        expect(beforeIdle.active).toBe(false);
        expect(beforeIdle.state).toBeNull();
        expect(speeds).toEqual([]);

        const active = stepDirector(director, {
            timeS: 1,
            idleMs: DIRECTOR_IDLE_MS,
            snapshot: SAMPLE_AGENTS,
            info: INFO,
            layout: LAYOUT,
        });
        expect(active.active).toBe(true);
        expect(active.state).toBe(SHOT_STATE.WIDE);
        expect(selections).toEqual([0]);
        expect(speeds).toEqual([4]);

        stepDirector(director, {
            timeS: 1.5,
            idleMs: DIRECTOR_IDLE_MS + 500,
            snapshot: SAMPLE_AGENTS,
            info: INFO,
            layout: LAYOUT,
        });
        expect(speeds).toEqual([4]);

        director.noteInput();
        expect(director.isActive()).toBe(false);
        expect(speeds).toEqual([4, 2]);

        const afterInput = stepDirector(director, {
            timeS: 2,
            idleMs: 100,
            snapshot: SAMPLE_AGENTS,
            info: INFO,
            layout: LAYOUT,
        });
        expect(afterInput.active).toBe(false);
    });

    it('transitions through wide -> glide -> linger -> pullback -> wide and logs DirectorShot', () => {
        const logs = /** @type {any[]} */ ([]);
        const speeds = /** @type {number[]} */ ([]);
        const camera = createCameraController({ canvas: CANVAS, world: WORLD });
        const director = createDirector({
            seed: 7,
            canvas: CANVAS,
            world: WORLD,
            viewerSpeed: 2,
            log: (level, event, fields) => logs.push({ level, event, ...fields }),
            onSpeed: (s) => speeds.push(s),
            speedForState: (shotState, s0) =>
                shotState === SHOT_STATE.WIDE || shotState === SHOT_STATE.PULLBACK ? Math.max(s0, 4) : 1,
        });

        let snap = stepDirector(director, { tick: 0, snapshot: SAMPLE_AGENTS, info: INFO, layout: LAYOUT, camera });
        expect(snap.state).toBe(SHOT_STATE.WIDE);
        expect(snap.caption).toBe('');

        const packKillC =
            (LAYOUT.deathCauses.EATEN << EFFECT_BITS.CAUSE_SHIFT) | EFFECT_BITS.DIED_PACK | EFFECT_BITS.DIED_DELIBERATE;
        const packKillAt3s = [{ tick: 180, kind: LAYOUT.effectKinds.DIED, x: 5000, y: 3000, a: 1, b: 2, c: packKillC }];
        snap = stepDirector(director, {
            tick: 180,
            snapshot: SAMPLE_AGENTS,
            effects: packKillAt3s,
            info: INFO,
            layout: LAYOUT,
            camera,
        });
        expect(snap.state).toBe(SHOT_STATE.WIDE);

        const packKillAt9s = [{ tick: 540, kind: LAYOUT.effectKinds.DIED, x: 5000, y: 3000, a: 1, b: 2, c: packKillC }];
        snap = stepDirector(director, {
            tick: 540,
            snapshot: SAMPLE_AGENTS,
            effects: packKillAt9s,
            info: INFO,
            layout: LAYOUT,
            camera,
        });
        expect(snap.state).toBe(SHOT_STATE.GLIDE);
        expect(snap.caption).toBe('Pack kill');
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({ level: 'info', event: 'DirectorShot', kind: 'pack-kill', x: 5000, y: 3000 });
        expect(speeds).toEqual([4, 1]);

        snap = stepDirector(director, {
            tick: 660,
            snapshot: SAMPLE_AGENTS,
            effects: packKillAt9s,
            info: INFO,
            layout: LAYOUT,
            camera,
        });
        expect(snap.state).toBe(SHOT_STATE.LINGER);

        snap = stepDirector(director, {
            tick: 900,
            snapshot: SAMPLE_AGENTS,
            effects: packKillAt9s,
            info: INFO,
            layout: LAYOUT,
            camera,
        });
        expect(snap.state).toBe(SHOT_STATE.LINGER);

        snap = stepDirector(director, {
            tick: 1020,
            snapshot: SAMPLE_AGENTS,
            effects: [],
            info: INFO,
            layout: LAYOUT,
            camera,
        });
        expect(snap.state).toBe(SHOT_STATE.PULLBACK);
        expect(snap.caption).toBe('');
        expect(speeds).toEqual([4, 1, 4]);

        snap = stepDirector(director, {
            tick: 1260,
            snapshot: SAMPLE_AGENTS,
            effects: [],
            info: INFO,
            layout: LAYOUT,
            camera,
        });
        expect(snap.state).toBe(SHOT_STATE.WIDE);
    });

    it('extends linger by 4 s at a time up to 20 s while score >= 45 and tracks moving focus', () => {
        const camera = createCameraController({ canvas: CANVAS, world: WORLD });
        const director = createDirector({ seed: 99, canvas: CANVAS, world: WORLD, log: () => {} });
        const stepAt = (/** @type {number} */ timeS, xOffset = 0) =>
            stepDirector(director, {
                timeS,
                snapshot: makeChasePair(xOffset),
                earlierSnapshot: EARLIER_CHASE,
                info: INFO,
                layout: LAYOUT,
                camera,
            });

        stepDirector(director, { timeS: 0, snapshot: SAMPLE_AGENTS, info: INFO, layout: LAYOUT, camera });
        let snap = stepAt(9, 0);
        expect(snap.state).toBe(SHOT_STATE.GLIDE);
        expect(snap.caption).toBe('Chase - predator after forager');

        snap = stepAt(12, 20);
        expect(snap.state).toBe(SHOT_STATE.LINGER);
        expect(snap.shot?.durationS).toBe(8);

        snap = stepAt(20, 100);
        expect(snap.shot?.durationS).toBe(12);
        stepAt(24, 150);
        snap = stepAt(28, 200);
        expect(snap.shot?.durationS).toBe(20);

        snap = stepAt(32, 250);
        expect(snap.state).toBe(SHOT_STATE.PULLBACK);
    });

    it('tracks live chase and escape focus in linger when candidate score drops below threshold', () => {
        const director = createDirector({ seed: 12, canvas: CANVAS, world: WORLD, log: () => {} });
        stepDirector(director, { timeS: 0, snapshot: SAMPLE_AGENTS, info: INFO, layout: LAYOUT });

        const escapeEffects = [
            {
                tick: 540,
                kind: LAYOUT.effectKinds.ESCAPED,
                x: 3000,
                y: 2000,
                a: 1,
                b: 2,
                c: EFFECT_BITS.ESCAPED_RESPONDED,
            },
        ];
        let snap = stepDirector(director, {
            tick: 540,
            snapshot: SAMPLE_AGENTS,
            effects: escapeEffects,
            info: INFO,
            layout: LAYOUT,
        });
        expect(snap.state).toBe(SHOT_STATE.GLIDE);

        const movedVictim = [
            { genomeId: 1, lineageId: 10, spec: 0, x: 3450, y: 2150, angle: 0, size: 12, speed: 4, flags: 0 },
        ];
        snap = stepDirector(director, { tick: 720, snapshot: movedVictim, effects: [], info: INFO, layout: LAYOUT });
        expect(snap.state).toBe(SHOT_STATE.LINGER);
        expect(snap.pose?.x).toBe(3450);

        snap = stepDirector(director, { tick: 750, snapshot: [], effects: [], info: INFO, layout: LAYOUT });
        expect(snap.pose?.x).toBe(3000);

        director.resetSeed(12);
        director.noteInput();
        stepDirector(director, { timeS: 0, snapshot: SAMPLE_AGENTS, info: INFO, layout: LAYOUT });
        const activeChase = makeChasePair(0);
        stepDirector(director, {
            timeS: 9,
            snapshot: activeChase,
            earlierSnapshot: EARLIER_CHASE,
            info: INFO,
            layout: LAYOUT,
        });
        const brokenChaseStillAlive = [
            { genomeId: 10, lineageId: 1, spec: 1, x: 4500, y: 3200, angle: Math.PI, size: 18, speed: 4, flags: 0 },
            { genomeId: 11, lineageId: 2, spec: 0, x: 4700, y: 3400, angle: 0, size: 12, speed: 4, flags: 0 },
        ];
        snap = stepDirector(director, {
            timeS: 12,
            snapshot: brokenChaseStillAlive,
            earlierSnapshot: activeChase,
            info: INFO,
            layout: LAYOUT,
        });
        expect(snap.pose?.x).toBe(4600);

        snap = stepDirector(director, { timeS: 12.5, snapshot: [], earlierSnapshot: [], info: INFO, layout: LAYOUT });
        expect(snap.pose?.x).toBe(4200);
    });

    it('produces identical choices for the same seed and applies the 0.6 repeat penalty within 30 s', () => {
        /** @param {number} seed */
        const runSequence = (seed) => {
            const d = createDirector({ seed, canvas: CANVAS, world: WORLD, log: () => {} });
            const states = [];
            for (let t = 0; t <= 45; t += 0.5) {
                const ticker =
                    t === 9
                        ? [{ tick: Math.round(t * 60), kind: 'new-leader', lineageId: 10 }]
                        : t === 30
                          ? [{ tick: Math.round(t * 60), kind: 'new-leader', lineageId: 20 }]
                          : [];
                const res = stepDirector(d, { timeS: t, snapshot: SAMPLE_AGENTS, ticker, info: INFO, layout: LAYOUT });
                states.push({ t, state: res.state, zoom: res.pose?.zoom, caption: res.caption });
            }
            return states;
        };

        const first = runSequence(12345);
        const second = runSequence(12345);
        expect(first).toEqual(second);
        expect(first.find((s) => s.t === 9)?.state).toBe(SHOT_STATE.GLIDE);
        expect(first.find((s) => s.t === 30)?.state).toBe(SHOT_STATE.WIDE);
    });

    it('re-plans wide after its random 20..40 s duration when no moment fires, and bounds snapshot history', () => {
        const disabledInit = createDirector({ seed: 1, canvas: CANVAS, world: WORLD, enabled: false });
        expect(disabledInit.isEnabled()).toBe(false);
        const director = createDirector({ seed: 5, canvas: CANVAS, world: WORLD, log: () => {} });
        director.startNow();
        director.setViewerSpeed(1);
        director.resize({ width: 2560, height: 1440 }, { width: 14400, height: 8100 });
        director.resize({ width: 3840, height: 2160 });

        let firstStart = 0;
        for (let i = 0; i <= MAX_SNAPSHOT_HISTORY + 60; i++) {
            const res = stepDirector(director, {
                timeS: i * 0.5,
                idleMs: 0,
                snapshot: SAMPLE_AGENTS,
                info: INFO,
                layout: LAYOUT,
            });
            if (i === 0) {
                firstStart = res.shot?.durationS ?? 0;
            }
        }
        const afterReplan = stepDirector(director, {
            timeS: 45,
            idleMs: 0,
            snapshot: SAMPLE_AGENTS,
            info: INFO,
            layout: LAYOUT,
        });
        expect(firstStart).toBeGreaterThanOrEqual(20);
        expect(afterReplan.shot?.startTimeS).toBeGreaterThan(0);

        stepDirector(director, { timeS: 0, idleMs: 0, snapshot: SAMPLE_AGENTS, info: INFO, layout: LAYOUT });
        stepDirector(director, { timeS: 0.1, idleMs: 0, snapshot: SAMPLE_AGENTS, info: INFO, layout: LAYOUT });
        stepDirector(director, {
            idleMs: 0,
            snapshot: SAMPLE_AGENTS,
            info: { ...INFO, ticksPerSecond: undefined },
            layout: LAYOUT,
        });

        director.setEnabled(false);
        expect(director.isEnabled()).toBe(false);
        expect(director.isActive()).toBe(false);
        director.setEnabled(true);
        expect(director.isEnabled()).toBe(true);
    });
});
