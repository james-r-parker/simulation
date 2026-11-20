import { describe, expect, it } from 'vitest';
import { createAppState } from '../../js/app/actions.js';
import { createCameraController } from '../../js/app/camera.js';
import { createFrameLoop } from '../../js/app/frame-loop.js';
import { createFrameStats, frameReport } from '../../js/app/frame-stats.js';
import { AGENT_FIELD, HEADER_WORDS } from '../../js/app/interpolate.js';
import { createRequest, readRequest, SLOT } from '../../js/app/pack/frame-slots.js';
import { LATE_REPORT_MS } from '../../js/app/pack/pack-feed.js';
import { createEffectsPlayer } from '../../js/app/renderer/effects-player.js';
import { createFamilySlots } from '../../js/app/family-slots.js';
import { packRig } from './helpers/pack-rig.js';
import { smallReady } from './helpers/ready.js';

/**
 * @returns {ReturnType<typeof packRig>} a synchronous pack worker over a small world's snapshot
 */
function fakePack() {
    return packRig(smallReady(40));
}

/**
 * @param {Record<string, any> | null} client the fake client
 * @param {ReturnType<typeof packRig> | null} [pack] the pack worker; one is made when the client is not null
 * @returns {{deps: any, drawn: any[], levels: number[], loop: ReturnType<typeof createFrameLoop>,
 *   pack: ReturnType<typeof packRig>}} a loop over fakes
 */
function setup(client, pack = null) {
    const rig = pack ?? fakePack();
    const drawn = /** @type {any[]} */ ([]);
    const levels = /** @type {number[]} */ ([]);
    const deps = {
        getClient: () => client,
        scene: {
            draw: (/** @type {any} */ frame) => drawn.push({ ...frame }) > 0,
            setQualityLevel: (/** @type {number} */ level) => levels.push(level),
        },
        camera: createCameraController({
            canvas: { width: 1920, height: 1080 },
            world: { width: 14400, height: 8100 },
        }),
        state: createAppState(),
        slots: createFamilySlots(),
        refs: { haze: null, player: null, stores: null },
        stats: createFrameStats(1024),
        gpuTimer: null,
        clock: () => 0,
        hidden: () => false,
        getPack: rig.getPack,
    };
    const loop = createFrameLoop(deps);
    loop.reset();
    return { deps, drawn, levels, loop, pack: rig };
}

/**
 * @returns {{client: Record<string, any>, pack: ReturnType<typeof packRig>}} the pack rig and its fake client
 */
function fakeWorld() {
    const pack = fakePack();
    return { client: pack.client, pack };
}

describe('createFrameLoop', () => {
    it('draws the snapshot with the selection and the leading lineage', () => {
        const { client, pack } = fakeWorld();
        client.stats = { season: 2, seasonProgress: 0.45, lineages: { top: [{ id: 4 }] } };
        const { deps, drawn, loop } = setup(client, pack);
        const after = /** @type {number[]} */ ([]);
        deps.afterDraw = (/** @type {any} */ f) => after.push(f.selectedId);
        deps.state.selectedId = 9;
        pack.step(loop, 1000);
        pack.step(loop, 1016);
        expect(drawn).toHaveLength(2);
        expect(after).toEqual([9, 9]);
        expect(drawn[0].agents.count).toBe(0);
        expect(drawn[1].agents.count).toBe(client.latest.u32[1]);
        expect(drawn[1]).toMatchObject({
            selectedId: 9,
            leadLineageId: 4,
            alpha: 1,
            nowMs: 1016,
            season: 2,
            seasonProgress: 0.45,
            tick: client.latest.tick,
        });
        expect(drawn[1].snapshot).toBe(client.latest);
        expect(drawn[1].packed).toBe(pack.w.slots.current);
        expect(drawn[1].packedSeq).toBe(pack.w.slots.taken.seq);
        expect(drawn[0].packed).toBeNull();
    });

    it('hands the lens state and the family colour slots to the layers, and the lens bits to the worker', () => {
        const { client, pack } = fakeWorld();
        const { deps, loop } = setup(client, pack);
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
        const request = createRequest();
        readRequest(pack.w.slots, request);
        expect(request.lens).toBe(4 | 8 | 16);
    });

    it('draws nothing before there is a scene or a client', () => {
        const noScene = setup(fakeWorld().client);
        noScene.deps.scene = null;
        noScene.loop.frame(1000);
        expect(noScene.drawn).toEqual([]);
        const noClient = setup(null);
        noClient.loop.frame(1000);
        expect(noClient.drawn).toEqual([]);
    });

    it('shows no agents before the first snapshot, and before the pack worker started', () => {
        const { client, pack } = fakeWorld();
        client.latest = null;
        const { drawn, loop } = setup(client, pack);
        loop.frame(1000);
        expect(drawn[0].agents.count).toBe(0);
        const { client: other } = fakeWorld();
        const unstarted = setup(other);
        unstarted.deps.getPack = () => null;
        unstarted.loop.frame(1000);
        unstarted.loop.frame(1016);
        expect(unstarted.drawn[1].agents.count).toBe(0);
        expect(unstarted.drawn[1].packed).toBeNull();
    });

    it('gives a new field to the haze and returns its buffer once', () => {
        const { client, pack } = fakeWorld();
        client.field = { f32: new Float32Array(3) };
        const pushed = /** @type {any[]} */ ([]);
        const { deps, loop } = setup(client, pack);
        deps.refs.haze = { pushField: (/** @type {any} */ f32, /** @type {number} */ now) => pushed.push([f32, now]) };
        loop.frame(1000);
        loop.frame(1016);
        expect(pushed).toHaveLength(1);
        expect(pushed[0][1]).toBe(1000);
        expect(client.released).toBe(1);
    });

    it('starts the effects frame and diffs flag edges even with no effect queue', () => {
        const { client, pack } = fakeWorld();
        const { info, layout } = smallReady(0);
        const player = createEffectsPlayer({ layout, info });
        client.effects = null;
        const { deps, loop } = setup(client, pack);
        deps.refs.player = player;
        pack.step(loop, 1000);
        pack.step(loop, 1016);
        expect(player.edges.tick).toBeGreaterThanOrEqual(0);
        expect(player.fx.budget.lastTick).not.toBeNaN();
    });

    it('plays the queued effects the drawn frame has reached, on the drawn frame tick', () => {
        const { client, pack } = fakeWorld();
        const { info, layout } = smallReady(0);
        const player = createEffectsPlayer({ layout, info });
        const buffer = new ArrayBuffer(4 * 8 * 4);
        const u32 = new Uint32Array(buffer);
        u32.set([layout.effectKinds.BORN, client.latest.tick - 1, 0, 0, 1, 1, 1, 1]);
        client.effects = { u32, f32: new Float32Array(buffer), words: 8, start: 0, count: 1 };
        const { deps, loop } = setup(client, pack);
        deps.refs.player = player;
        loop.frame(1000);
        expect(client.effects.count).toBe(1);
        pack.answer();
        loop.frame(1016);
        expect(client.effects.count).toBe(0);
        expect(player.fx.pool.spawned + player.fx.budget.culled[2]).toBeGreaterThan(0);
    });

    it('records intervals but not the first frame, and not while hidden', () => {
        const { deps, loop } = setup(fakeWorld().client);
        loop.frame(1000);
        loop.frame(1016);
        loop.frame(1033);
        deps.hidden = () => true;
        loop.frame(1050);
        expect(frameReport(deps.stats).frames).toBe(2);
    });

    it('keeps follow through pack startup and hands off after its subject is gone', () => {
        const { client, pack } = fakeWorld();
        const genome = client.latest.u32[HEADER_WORDS + AGENT_FIELD.GENOME];
        const { deps, loop } = setup(client, pack);
        deps.state.followId = genome;
        pack.step(loop, 1000);
        expect(deps.state.followId).toBe(genome);
        pack.step(loop, 1016);
        expect(deps.camera.following).toBe(true);
        expect(deps.state.followId).toBe(genome);
        deps.state.followId = 999999;
        loop.frame(1033);
        expect(deps.state.followId).toBe(999999);
        for (let t = 1133; t <= 1833; t += 100) {
            pack.step(loop, t);
        }
        expect(deps.state.followId).not.toBe(999999);
        expect(deps.state.followId).not.toBe(0);
        expect(loop.followAgent(deps.state.followId)).toBe(deps.state.followId);
    });

    it('does not count a suspended hidden-tab interval toward a pending death handoff', () => {
        const { client, pack } = fakeWorld();
        const { deps, loop } = setup(client, pack);
        pack.step(loop, 1000);
        pack.step(loop, 1016);
        deps.state.followId = 999999;
        for (let t = 1116; t <= 1616; t += 100) {
            pack.step(loop, t);
        }
        expect(deps.state.followId).toBe(999999);
        deps.hidden = () => true;
        // RAF is suspended while hidden; there is no hidden frame callback.
        deps.hidden = () => false;
        pack.step(loop, 10000);
        expect(deps.state.followId).toBe(999999);
        pack.step(loop, 10050);
        expect(deps.state.followId).not.toBe(999999);
        expect(deps.state.followId).not.toBe(0);
    });

    it('starts a new world with fresh agents and an empty playhead', () => {
        const { client, pack } = fakeWorld();
        const { drawn, loop } = setup(client, pack);
        pack.step(loop, 1000);
        pack.step(loop, 1016);
        const before = loop.agents();
        expect(before.count).toBeGreaterThan(0);
        loop.reset();
        expect(loop.agents()).not.toBe(before);
        expect(loop.agents().count).toBe(0);
        loop.frame(1033);
        expect(drawn.at(-1).agents).toBe(loop.agents());
        expect(loop.lateFrames()).toBe(0);
    });
});

describe('the pack worker exchange', () => {
    it('asks for the playhead one frame ahead: the request carries the clock shifted by the frame interval', () => {
        const { client, pack } = fakeWorld();
        const { loop } = setup(client, pack);
        const request = createRequest();
        loop.frame(1000);
        readRequest(pack.w.slots, request);
        expect(request.nowMs).toBe(1000);
        expect(request.latestSeq).toBe(client.latest.seq);
        expect(request.prevSeq).toBe(0);
        loop.frame(1016);
        readRequest(pack.w.slots, request);
        expect(request.nowMs).toBe(1032);
        expect(request.seq).toBe(2);
        loop.frame(1016 + 400);
        readRequest(pack.w.slots, request);
        expect(request.nowMs).toBe(1416 + 100);
    });

    it('carries the camera zoom, the palette and the family slots in the request', () => {
        const { client, pack } = fakeWorld();
        const { deps, loop } = setup(client, pack);
        deps.slots.palette = 'high-contrast';
        deps.slots.ids[2] = 77;
        loop.frame(1000);
        const request = createRequest();
        readRequest(pack.w.slots, request);
        expect(request.zoom).toBe(deps.camera.zoom);
        expect(request.palette).toBe(2);
        expect(request.family[2]).toBe(77);
    });

    it('redraws the last slot when the worker published nothing new, and counts the frame late', () => {
        const { client, pack } = fakeWorld();
        const { drawn, loop } = setup(client, pack);
        pack.step(loop, 1000);
        pack.step(loop, 1016);
        expect(loop.lateFrames()).toBe(0);
        loop.frame(1033);
        expect(loop.lateFrames()).toBe(0);
        loop.frame(1050);
        loop.frame(1066);
        expect(loop.lateFrames()).toBe(2);
        expect(drawn.at(-1).agents).toBe(drawn.at(-2).agents);
        expect(drawn.at(-1).packedSeq).toBe(drawn.at(-2).packedSeq);
        pack.answer();
        loop.frame(1083);
        expect(loop.lateFrames()).toBe(2);
        expect(drawn.at(-1).packedSeq).toBeGreaterThan(drawn.at(-2).packedSeq);
    });

    it('logs PackFrameLate at most once per 5 s, with the late frames since the last report', () => {
        const { client, pack } = fakeWorld();
        const { deps, loop } = setup(client, pack);
        const logs = /** @type {any[]} */ ([]);
        deps.log = (/** @type {string} */ level, /** @type {string} */ event, /** @type {any} */ fields) =>
            logs.push({ level, event, ...fields });
        pack.step(loop, 1000);
        pack.step(loop, 1016);
        loop.frame(1033);
        loop.frame(1050);
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({ level: 'warn', event: 'PackFrameLate', late: 1 });
        loop.frame(1066);
        loop.frame(1066 + LATE_REPORT_MS - 100);
        expect(logs).toHaveLength(1);
        loop.frame(1066 + LATE_REPORT_MS + 100);
        expect(logs).toHaveLength(2);
        expect(logs[1].late).toBeGreaterThan(1);
    });

    it('takes the snapshots the drawn frame was packed from, not a newer one that arrived since', () => {
        const { client, pack } = fakeWorld();
        const { drawn, loop } = setup(client, pack);
        pack.step(loop, 1000);
        const first = client.latest;
        pack.step(loop, 1016);
        // a newer snapshot arrives: the slot drawn next is still the one packed from `first`
        client.prev = first;
        client.latest = { ...first, seq: first.seq + 1 };
        loop.frame(1033);
        expect(drawn.at(-1).snapshot).toBe(first);
        expect(drawn.at(-1).prevSnapshot).toBe(client.prev);
        // when neither held snapshot is the packed one the newest is used
        client.prev = null;
        client.latest = { ...first, seq: first.seq + 5 };
        loop.frame(1050);
        expect(drawn.at(-1).snapshot).toBe(client.latest);
    });

    it('counts the agents of the slot it drew, and the rows its meshes will copy', () => {
        const { client, pack } = fakeWorld();
        const { drawn, loop } = setup(client, pack);
        pack.step(loop, 1000);
        pack.step(loop, 1016);
        const slot = drawn.at(-1).packed;
        const rows = slot.head
            .slice(SLOT.BUCKETS, SLOT.BUCKETS + pack.w.slots.buckets)
            .reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0);
        expect(rows).toBe(drawn.at(-1).agents.count);
    });
});
