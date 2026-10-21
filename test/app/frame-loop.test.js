import { describe, expect, it } from 'vitest';
import { createAppState } from '../../js/app/actions.js';
import { createCameraController } from '../../js/app/camera.js';
import { createFrameLoop } from '../../js/app/frame-loop.js';
import { createFrameStats, frameReport } from '../../js/app/frame-stats.js';
import { AGENT_FIELD, HEADER_WORDS } from '../../js/app/interpolate.js';
import { createEffectsPlayer } from '../../js/app/renderer/effects-player.js';
import { createRingPool } from '../../js/app/renderer/rings.js';
import { createSparkPool } from '../../js/app/renderer/sparks.js';
import { createQuality } from '../../js/app/renderer/quality.js';
import { createFamilySlots } from '../../js/app/family-slots.js';
import { smallReady } from './helpers/ready.js';

/**
 * @param {{tick?: number}} [options] the snapshot's tick
 * @returns {Record<string, any>} a fake worker client holding one snapshot of a small world
 */
function fakeClient({ tick } = {}) {
    const { info, snapshot } = smallReady(40);
    const client = {
        info,
        prev: null,
        latest: { ...snapshot, tick: tick ?? snapshot.tick },
        effects: null,
        field: /** @type {any} */ (null),
        stats: /** @type {any} */ (null),
        released: 0,
        releaseField() {
            client.released += 1;
            client.field = null;
        },
    };
    return client;
}

/**
 * @param {Record<string, any> | null} client the fake client
 * @returns {{deps: any, drawn: any[], levels: number[], loop: ReturnType<typeof createFrameLoop>}} a loop over fakes
 */
function setup(client) {
    const drawn = /** @type {any[]} */ ([]);
    const levels = /** @type {number[]} */ ([]);
    const deps = {
        getClient: () => client,
        scene: {
            draw: (/** @type {any} */ frame) => drawn.push({ ...frame }) > 0,
            setQualityLevel: (/** @type {number} */ level) => levels.push(level),
            quality: createQuality(),
        },
        camera: createCameraController({
            canvas: { width: 1920, height: 1080 },
            world: { width: 14400, height: 8100 },
        }),
        state: createAppState(),
        slots: createFamilySlots(),
        refs: { haze: null, player: null },
        stats: createFrameStats(1024),
        gpuTimer: null,
        clock: () => 0,
        hidden: () => false,
    };
    const loop = createFrameLoop(deps);
    loop.reset(client?.info.maxAgents ?? 1);
    return { deps, drawn, levels, loop };
}

describe('createFrameLoop', () => {
    it('draws the snapshot with the selection and the leading lineage', () => {
        const client = fakeClient();
        client.stats = { lineages: { top: [{ id: 4 }] } };
        const { deps, drawn, loop } = setup(client);
        deps.state.selectedId = 9;
        loop.frame(1000);
        expect(drawn).toHaveLength(1);
        expect(drawn[0].agents.count).toBe(client.latest.u32[1]);
        expect(drawn[0]).toMatchObject({ selectedId: 9, leadLineageId: 4, alpha: 1, nowMs: 1000 });
        expect(drawn[0].snapshot).toBe(client.latest);
    });

    it('hands the lens state and the family colour slots to the layers', () => {
        const client = fakeClient();
        const { deps, loop } = setup(client);
        const seen = /** @type {any[]} */ ([]);
        deps.scene.draw = (/** @type {any} */ f) => {
            seen.push({ lenses: { ...f.lenses }, family: f.family });
            return true;
        };
        deps.state.lenses[2] = true;
        deps.state.lenses[3] = true;
        loop.frame(1000);
        expect(seen[0].lenses).toEqual({
            temperature: false,
            scent: false,
            territory: true,
            vision: true,
            calls: true,
        });
        expect(seen[0].family).toBe(deps.slots);
    });

    it('draws nothing before there is a scene or a client', () => {
        const noScene = setup(fakeClient());
        noScene.deps.scene = null;
        noScene.loop.frame(1000);
        expect(noScene.drawn).toEqual([]);
        const noClient = setup(null);
        noClient.loop.frame(1000);
        expect(noClient.drawn).toEqual([]);
    });

    it('shows no agents before the first snapshot', () => {
        const client = fakeClient();
        client.latest = null;
        const { drawn, loop } = setup(client);
        loop.frame(1000);
        expect(drawn[0].agents.count).toBe(0);
    });

    it('gives a new field to the haze and returns its buffer once', () => {
        const client = fakeClient();
        client.field = { f32: new Float32Array(3) };
        const pushed = /** @type {any[]} */ ([]);
        const { deps, loop } = setup(client);
        deps.refs.haze = { pushField: (/** @type {any} */ f32, /** @type {number} */ now) => pushed.push([f32, now]) };
        loop.frame(1000);
        loop.frame(1016);
        expect(pushed).toHaveLength(1);
        expect(pushed[0][1]).toBe(1000);
        expect(client.released).toBe(1);
    });

    it('plays the queued effects the playhead has reached', () => {
        const client = fakeClient();
        const { info, layout } = smallReady(0);
        const rings = createRingPool();
        const player = createEffectsPlayer({ rings, sparks: createSparkPool(1), layout, info });
        const buffer = new ArrayBuffer(4 * 8 * 4);
        const u32 = new Uint32Array(buffer);
        u32.set([layout.effectKinds.BORN, client.latest.tick - 1, 0, 0, 1, 1, 1, 1]);
        client.effects = { u32, f32: new Float32Array(buffer), words: 8, start: 0, count: 1 };
        const { deps, loop } = setup(client);
        deps.refs.player = player;
        loop.frame(1000);
        expect(client.effects.count).toBe(0);
        expect(rings.next).toBe(1);
    });

    it('records intervals but not the first frame, and not while hidden', () => {
        const { deps, loop } = setup(fakeClient());
        loop.frame(1000);
        loop.frame(1016);
        loop.frame(1033);
        deps.hidden = () => true;
        loop.frame(1050);
        expect(frameReport(deps.stats).frames).toBe(2);
    });

    it('follows a live agent with the camera and drops a follow whose agent is gone', () => {
        const client = fakeClient();
        const genome = client.latest.u32[HEADER_WORDS + AGENT_FIELD.GENOME];
        const { deps, loop } = setup(client);
        deps.state.followId = genome;
        loop.frame(1000);
        expect(deps.camera.following).toBe(true);
        expect(deps.state.followId).toBe(genome);
        deps.state.followId = 999999;
        loop.frame(1016);
        expect(deps.state.followId).toBe(0);
    });

    it('moves the quality level down after sustained slow frames and starts a fresh window', () => {
        const { deps, levels, loop } = setup(fakeClient());
        let now = 1000;
        for (let i = 0; i < 1200 && levels.length === 0; i++) {
            now += i % 5 === 0 ? 50 : 10;
            loop.frame(now);
        }
        expect(levels).toEqual([1]);
        expect(deps.scene.quality.level).toBe(1);
        expect(deps.scene.quality.changed).toBe(true);
    });

    it('starts a new world with fresh agents and an empty playhead', () => {
        const client = fakeClient();
        const { drawn, loop } = setup(client);
        loop.frame(1000);
        const before = loop.agents();
        loop.reset(client.info.maxAgents);
        expect(loop.agents()).not.toBe(before);
        loop.frame(1016);
        expect(drawn.at(-1).agents).toBe(loop.agents());
    });
});
