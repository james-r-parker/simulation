import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import {
    createDirector,
    DIRECTOR_IDLE_MS,
    DIRECTOR_SEED_XOR,
    LINGER_EASE_IN_S,
    MAX_SNAPSHOT_HISTORY,
    stepDirector,
} from '../../../js/app/director/director.js';
import { EFFECT_BITS } from '../../../js/app/director/scoring.js';
import { SHOT_STATE } from '../../../js/app/director/shots.js';
import {
    CANVAS,
    EARLIER_CHASE,
    INFO,
    LAYOUT,
    makeChasePair,
    SAMPLE_AGENTS,
    WORLD,
} from './helpers/director-fixtures.js';

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

        // no camera on the first step: the first wide shot starts where it frames, with no move to wait out
        let snap = stepDirector(director, { tick: 0, snapshot: SAMPLE_AGENTS, info: INFO, layout: LAYOUT });
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

        const packKillAtCut = [
            { tick: 2340, kind: LAYOUT.effectKinds.DIED, x: 5000, y: 3000, a: 1, b: 2, c: packKillC },
        ];
        snap = stepDirector(director, {
            tick: 2340,
            snapshot: SAMPLE_AGENTS,
            effects: packKillAtCut,
            info: INFO,
            layout: LAYOUT,
            camera,
        });
        expect(snap.state).toBe(SHOT_STATE.GLIDE);
        expect(snap.caption).toBe('Pack kill');
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({ level: 'info', event: 'DirectorShot', kind: 'pack-kill', x: 5000, y: 3000 });
        expect(speeds).toEqual([4, 1]);
        // the glide is a calm move, as long as its caps need; the rest of the timeline follows it
        const shift = Math.round((snap.shot?.durationS ?? 0) * 60) - 120;
        expect(snap.shot?.durationS).toBeGreaterThan(0);

        snap = stepDirector(director, {
            tick: 2460 + shift,
            snapshot: SAMPLE_AGENTS,
            effects: packKillAtCut,
            info: INFO,
            layout: LAYOUT,
            camera,
        });
        expect(snap.state).toBe(SHOT_STATE.LINGER);

        const packKillLate = [
            { tick: 2640 + shift, kind: LAYOUT.effectKinds.DIED, x: 5000, y: 3000, a: 1, b: 2, c: packKillC },
        ];
        snap = stepDirector(director, {
            tick: 2700 + shift,
            snapshot: SAMPLE_AGENTS,
            effects: packKillLate,
            info: INFO,
            layout: LAYOUT,
            camera,
        });
        expect(snap.state).toBe(SHOT_STATE.LINGER);

        // the moment goes quiet: two quiet seconds later the shot pulls back, and the pullback move runs at x1
        for (const tick of [2820 + shift, 5040 + shift]) {
            snap = stepDirector(director, {
                tick,
                snapshot: SAMPLE_AGENTS,
                effects: [],
                info: INFO,
                layout: LAYOUT,
                camera,
            });
        }
        expect(snap.state).toBe(SHOT_STATE.PULLBACK);
        expect(snap.caption).toBe('');
        expect(speeds).toEqual([4, 1]);

        snap = stepDirector(director, {
            tick: 9000 + shift,
            snapshot: SAMPLE_AGENTS,
            effects: [],
            info: INFO,
            layout: LAYOUT,
            camera,
        });
        expect(snap.state).toBe(SHOT_STATE.WIDE);
    });

    it('extends linger by 4 s at a time up to 40 s while score >= 45 and tracks moving focus', () => {
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

        stepDirector(director, { timeS: 0, snapshot: SAMPLE_AGENTS, info: INFO, layout: LAYOUT });
        // the first wide holds 30 s, so the first cut is after that
        let snap = stepAt(31, 0);
        expect(snap.state).toBe(SHOT_STATE.GLIDE);
        expect(snap.caption).toBe('Chase - predator after forager');

        // the glide is a calm move as long as its caps need; the linger begins when it lands
        const lingerAt = 31 + (snap.shot?.durationS ?? 0);
        snap = stepAt(lingerAt, 20);
        expect(snap.state).toBe(SHOT_STATE.LINGER);
        expect(snap.shot?.durationS).toBe(16);

        snap = stepAt(lingerAt + 16, 100);
        expect(snap.shot?.durationS).toBe(20);
        for (const [after, offset] of [
            [20, 150],
            [24, 200],
            [28, 250],
            [32, 300],
        ]) {
            snap = stepAt(lingerAt + after, offset);
        }
        expect(snap.shot?.durationS).toBe(36);
        snap = stepAt(lingerAt + 36, 350);
        expect(snap.shot?.durationS).toBe(40);

        snap = stepAt(lingerAt + 40, 400);
        expect(snap.state).toBe(SHOT_STATE.PULLBACK);
    });

    it('brings the linger spring up from rest, so the camera does not lurch to a moment that moved', () => {
        const camera = createCameraController({ canvas: CANVAS, world: WORLD });
        const director = createDirector({ seed: 99, canvas: CANVAS, world: WORLD, log: () => {} });
        const stepAt = (/** @type {number} */ timeS, xOffset = 0) =>
            stepDirector(director, {
                timeS,
                dtMs: 100,
                snapshot: makeChasePair(xOffset),
                earlierSnapshot: EARLIER_CHASE,
                info: INFO,
                layout: LAYOUT,
                camera,
            });
        stepDirector(director, { timeS: 0, snapshot: SAMPLE_AGENTS, info: INFO, layout: LAYOUT });
        const glide = stepAt(31, 0);
        const landS = 31 + (glide.shot?.durationS ?? 0);
        stepAt(landS, 0);
        const landedX = camera.x;
        stepAt(landS + 0.5, 2000);
        // without the ramp one 100 ms frame would close 27% of the gap, 540 units
        expect(Math.abs(camera.x - landedX)).toBeLessThan(30);
        for (let t = landS + 1; t <= landS + LINGER_EASE_IN_S + 4; t += 0.5) {
            stepAt(t, 2000);
        }
        expect(camera.x).toBeGreaterThan(landedX);
    });

    it('tracks live chase and escape focus in linger when candidate score drops below threshold', () => {
        const director = createDirector({ seed: 12, canvas: CANVAS, world: WORLD, log: () => {} });
        stepDirector(director, { timeS: 0, snapshot: SAMPLE_AGENTS, info: INFO, layout: LAYOUT });

        const escapeEffects = [
            {
                tick: 2340,
                kind: LAYOUT.effectKinds.ESCAPED,
                x: 3000,
                y: 2000,
                a: 1,
                b: 2,
                c: EFFECT_BITS.ESCAPED_RESPONDED,
            },
        ];
        let snap = stepDirector(director, {
            tick: 2340,
            snapshot: SAMPLE_AGENTS,
            effects: escapeEffects,
            info: INFO,
            layout: LAYOUT,
        });
        expect(snap.state).toBe(SHOT_STATE.GLIDE);
        const landTick = 2340 + Math.ceil((snap.shot?.durationS ?? 0) * 60);

        const movedVictim = [
            { genomeId: 1, lineageId: 10, spec: 0, x: 3450, y: 2150, angle: 0, size: 12, speed: 4, flags: 0 },
        ];
        snap = stepDirector(director, {
            tick: landTick,
            snapshot: movedVictim,
            effects: [],
            info: INFO,
            layout: LAYOUT,
        });
        expect(snap.state).toBe(SHOT_STATE.LINGER);
        expect(snap.pose?.x).toBe(3450);

        snap = stepDirector(director, { tick: landTick + 30, snapshot: [], effects: [], info: INFO, layout: LAYOUT });
        expect(snap.pose?.x).toBe(3000);

        director.resetSeed(12);
        director.noteInput();
        stepDirector(director, { timeS: 0, snapshot: SAMPLE_AGENTS, info: INFO, layout: LAYOUT });
        const activeChase = makeChasePair(0);
        const chaseShot = stepDirector(director, {
            timeS: 31,
            snapshot: activeChase,
            earlierSnapshot: EARLIER_CHASE,
            info: INFO,
            layout: LAYOUT,
        });
        const chaseLandS = 31 + (chaseShot.shot?.durationS ?? 0);
        const brokenChaseStillAlive = [
            { genomeId: 10, lineageId: 1, spec: 1, x: 4500, y: 3200, angle: Math.PI, size: 18, speed: 4, flags: 0 },
            { genomeId: 11, lineageId: 2, spec: 0, x: 4700, y: 3400, angle: 0, size: 12, speed: 4, flags: 0 },
        ];
        snap = stepDirector(director, {
            timeS: chaseLandS,
            snapshot: brokenChaseStillAlive,
            earlierSnapshot: activeChase,
            info: INFO,
            layout: LAYOUT,
        });
        expect(snap.pose?.x).toBe(4600);

        snap = stepDirector(director, {
            timeS: chaseLandS + 0.5,
            snapshot: [],
            earlierSnapshot: [],
            info: INFO,
            layout: LAYOUT,
        });
        expect(snap.pose?.x).toBe(4200);
    });

    it('produces identical choices for the same seed and holds a subject through the hold', () => {
        /** @param {number} seed */
        const runSequence = (seed) => {
            const d = createDirector({ seed, canvas: CANVAS, world: WORLD, log: () => {} });
            const states = [];
            for (let t = 0; t <= 100; t += 0.5) {
                const ticker =
                    t === 31
                        ? [{ tick: Math.round(t * 60), kind: 'new-leader', lineageId: 10 }]
                        : t === 90
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
        expect(first.find((s) => s.t === 31)?.state).toBe(SHOT_STATE.GLIDE);
        // 59 s on, the shot has not gone back to a wide shot: the linger holds the subject through the hold
        expect(first.find((s) => s.t === 60)?.state).not.toBe(SHOT_STATE.GLIDE);
    });

    it('re-plans wide after its random 30..60 s duration when no moment fires, and bounds snapshot history', () => {
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
            timeS: 200,
            idleMs: 0,
            snapshot: SAMPLE_AGENTS,
            info: INFO,
            layout: LAYOUT,
        });
        expect(firstStart).toBeGreaterThanOrEqual(30);
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
