import { describe, expect, it } from 'vitest';
import { createAppState } from '../../../js/app/actions.js';
import { createCameraController } from '../../../js/app/camera.js';
import { createDriver, READ_MS } from '../../../js/app/director/driver.js';
import { createDirectorFeed } from '../../../js/app/director/feed.js';

const READY = {
    seed: 7,
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

/** @returns {any} a driver over fakes, and the things it touches */
function setup() {
    const sent = /** @type {any[]} */ ([]);
    const client = {
        latest: [{ genomeId: 1, lineageId: 1, spec: 0, x: 2000, y: 1000, angle: 0, size: 10, speed: 1, flags: 0 }],
        select: (/** @type {number} */ id) => sent.push(['select', id]),
        setSpeed: (/** @type {number} */ n) => sent.push(['setSpeed', n]),
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
    const at = (/** @type {number} */ nowMs) => ({ nowMs, dtMs: 16, tick: nowMs * 0.06, ready: READY, top: [] });
    return { driver, camera, state, sent, at };
}

describe('createDriver', () => {
    it('does not hold the camera until started', () => {
        const { driver, at } = setup();
        expect(driver.step(at(0))).toBe(false);
        expect(driver.running()).toBe(false);
    });

    it('holds the camera once started, clears the selection and starts in a wide shot', () => {
        const { driver, state, sent, at } = setup();
        state.selectedId = 5;
        driver.start();
        expect(driver.step(at(1000))).toBe(true);
        expect(state.selectedId).toBe(0);
        expect(sent).toContainEqual(['select', 0]);
        expect(driver.shotKind()).toBe('wide');
    });

    it('starts when the world is ready after start was called', () => {
        const { driver, at } = setup();
        driver.start();
        driver.onReady(READY);
        expect(driver.step(at(0))).toBe(true);
    });

    it('hands the camera back on stop and restores the viewer speed it had changed', () => {
        const { driver, state, at } = setup();
        driver.start();
        driver.step(at(1000));
        state.autoSpeed = 240;
        driver.stop();
        expect(driver.running()).toBe(false);
        expect(state.autoSpeed).toBe(0);
        expect(driver.step(at(2000))).toBe(false);
        expect(driver.caption()).toBe('');
    });

    it('re-reads the world at READ_MS, not every frame', () => {
        const { driver, at } = setup();
        driver.start();
        driver.step(at(0));
        expect(READ_MS).toBe(250);
        expect(driver.step(at(10))).toBe(true);
    });

    it('tells the director when the canvas changes size', () => {
        const { driver, camera, at } = setup();
        driver.start();
        driver.step(at(0));
        camera.canvas.width = 1280;
        camera.canvas.height = 720;
        expect(driver.step(at(10))).toBe(true);
    });

    it('hands over an era card once at each ten minute mark, from a wide shot', () => {
        const { driver, at } = setup();
        driver.start();
        driver.step({ ...at(0), tick: 0 });
        expect(driver.takeEra()).toBeNull();
        driver.step({ ...at(1000), tick: 36000 });
        expect(driver.takeEra()).toEqual({ tick: 36000, ticksPerSecond: 60 });
        expect(driver.takeEra()).toBeNull();
        driver.step({ ...at(2000), tick: 36100 });
        expect(driver.takeEra()).toBeNull();
    });
});
