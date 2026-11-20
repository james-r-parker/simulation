import { describe, expect, it } from 'vitest';
import { createAppState } from '../../../js/app/actions.js';
import { createCameraController } from '../../../js/app/camera.js';
import { createDriver } from '../../../js/app/director/driver.js';
import { createDirectorFeed } from '../../../js/app/director/feed.js';
import { maxSustainedSpeed, paceFor, QUIET_SPEED } from '../../../js/app/director/pace.js';
import { createTvMode } from '../../../js/app/tv-mode.js';

describe('maxSustainedSpeed', () => {
    it('is the largest ladder speed whose tick budget is at least 1.05 x the worker cost', () => {
        expect(maxSustainedSpeed(0)).toBe(16);
        expect(maxSustainedSpeed(0.5)).toBe(16);
        expect(maxSustainedSpeed(1)).toBe(8);
        expect(maxSustainedSpeed(2)).toBe(4);
        expect(maxSustainedSpeed(4)).toBe(2);
        expect(maxSustainedSpeed(7.9)).toBe(2);
        expect(maxSustainedSpeed(15.5)).toBe(1);
        expect(maxSustainedSpeed(16)).toBe(0.5);
        expect(maxSustainedSpeed(1000)).toBe(0.25);
    });
});

describe('paceFor', () => {
    it('raises a quiet wide shot to x4, or the viewer speed when higher, within what the worker sustains', () => {
        expect(paceFor({ state: 'wide', quiet: true }, 1, 0.5)).toBe(QUIET_SPEED);
        expect(paceFor({ state: 'wide', quiet: true }, 8, 0.5)).toBe(8);
        expect(paceFor({ state: 'wide', quiet: true }, 1, 4)).toBe(2);
    });

    it('gives x1 back as soon as a moment scores, and keeps every close shot and the pullback at x1', () => {
        expect(paceFor({ state: 'wide', quiet: false }, 1, 0.5)).toBe(1);
        for (const state of ['glide', 'linger', 'pullback']) {
            expect(paceFor({ state, quiet: true }, 4, 0.5)).toBe(1);
        }
    });

    it('never speeds the viewer up past their own slower choice', () => {
        expect(paceFor({ state: 'glide', quiet: false }, 0.5, 0.5)).toBe(0.5);
        expect(paceFor({ state: 'wide', quiet: false }, 0.25, 0.5)).toBe(0.25);
    });
});

describe('TV mode with the driver and pace', () => {
    const READY = {
        seed: 1,
        info: {
            worldWidth: 14400,
            worldHeight: 8100,
            ticksPerSecond: 60,
            biteArc: 1,
            maxVelocity: 8,
            specs: [{ index: 0, name: 'forager', canHunt: false }],
        },
        layout: { flags: {}, effectKinds: {}, deathCauses: {} },
    };

    it('asks the worker for x4 over a quiet world and restores the viewer speed on leaving', () => {
        const speeds = /** @type {number[]} */ ([]);
        const client = {
            latest: [{ genomeId: 1, lineageId: 1, spec: 0, x: 2000, y: 1000, angle: 0, size: 10, speed: 1, flags: 0 }],
            stats: { workerMsPerTick: 0.5 },
            select() {},
            setSpeed: (/** @type {number} */ n) => speeds.push(n),
        };
        const camera = createCameraController({
            canvas: { width: 1920, height: 1080 },
            world: { width: 14400, height: 8100 },
        });
        const state = createAppState();
        const driver = createDriver({
            camera,
            state,
            getClient: () => client,
            feed: createDirectorFeed(),
            log: () => {},
        });
        driver.onReady(READY);
        const tv = createTvMode({
            driver,
            state,
            camera,
            iface: { setTv() {}, idleMs: () => 0, resetIdle() {}, tvIdleMinutes: () => 5 },
            log: () => {},
        });
        tv.enter('key');
        driver.step({ nowMs: 0, dtMs: 16, tick: 0, ready: READY, top: [] });
        expect(speeds).toEqual([240]);
        expect(state.autoSpeed).toBe(240);
        tv.noteInput({ type: 'pointerdown' });
        expect(speeds).toEqual([240, 60]);
        expect(state.autoSpeed).toBe(0);
        expect(state.requestedTicksPerSecond).toBe(60);
    });
});
