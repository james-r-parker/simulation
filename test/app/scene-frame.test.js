import { describe, expect, it } from 'vitest';
import {
    CHECK_MS,
    createFrameSignals,
    ENDED_MS,
    FRAME_EVENT,
    noteBite,
    noteSceneFrame,
    resetFrameSignals,
    STACK_ENTER,
} from '../../js/app/scene-frame.js';
import { createInterpolated } from '../../js/app/interpolate.js';

const INFO = {
    maxAgents: 16,
    maxVelocity: 10,
    specs: [
        { index: 0, name: 'forager', canHunt: false },
        { index: 1, name: 'predator', canHunt: true },
    ],
    terrain: { wallX: 500, refuges: [{ x: 100, y: 100, radius: 50 }] },
};

/**
 * @param {{x: number, y: number, genome: number, spec?: number, slot?: number}[]} list the agents
 * @returns {import('../../js/app/interpolate.js').Interpolated} a frame of them
 */
function frameOf(list) {
    const agents = createInterpolated(16);
    agents.count = list.length;
    list.forEach((a, i) => {
        agents.x[i] = a.x;
        agents.y[i] = a.y;
        agents.genomeId[i] = a.genome;
        agents.spec[i] = a.spec ?? 0;
        agents.slot[i] = a.slot ?? i;
    });
    return agents;
}

/** @returns {{f: ReturnType<typeof createFrameSignals>, heard: number[][], emit: (...a: number[]) => void}} signals and a listener */
function setup() {
    const f = createFrameSignals();
    resetFrameSignals(f, INFO);
    const heard = /** @type {number[][]} */ ([]);
    return { f, heard, emit: (...a) => void heard.push(a) };
}

/** @param {number[]} hunters the hunters' indices @returns {{count: number, hunter: Int32Array}} a pursuit table */
const table = (hunters) => ({ count: hunters.length, hunter: Int32Array.from(hunters) });

describe('pursuits', () => {
    it('reports a pursuit once when its hunter first appears in the table', () => {
        const { f, heard, emit } = setup();
        const agents = frameOf([{ x: 5, y: 6, genome: 70, spec: 1 }]);
        for (const nowMs of [0, 16, 32]) {
            noteSceneFrame(f, { agents, pursuits: table([0]), nowMs, tick: nowMs }, emit);
        }
        expect(heard).toEqual([[FRAME_EVENT.CHASE, 70, 5, 6]]);
    });

    it('reports an abort when a pursuit ends without the hunter having bitten, after the grace', () => {
        const { f, heard, emit } = setup();
        const agents = frameOf([{ x: 5, y: 6, genome: 70, spec: 1 }]);
        noteSceneFrame(f, { agents, pursuits: table([0]), nowMs: 0, tick: 0 }, emit);
        noteSceneFrame(f, { agents, pursuits: table([0]), nowMs: 100, tick: 100 }, emit);
        noteSceneFrame(f, { agents, pursuits: table([]), nowMs: 100 + ENDED_MS, tick: 100 + ENDED_MS }, emit);
        expect(heard).toHaveLength(1);
        noteSceneFrame(f, { agents, pursuits: table([]), nowMs: 100 + ENDED_MS + 1, tick: 100 + ENDED_MS + 1 }, emit);
        expect(heard.at(-1)).toEqual([FRAME_EVENT.ABORT, 70, NaN, NaN]);
        expect(f.longest).toEqual({ ticks: 100, genome: 70 });
    });

    it('does not call a pursuit an abort when the hunter bit, and keeps the longest pursuit', () => {
        const { f, heard, emit } = setup();
        const agents = frameOf([
            { x: 1, y: 1, genome: 70, spec: 1 },
            { x: 2, y: 2, genome: 71, spec: 1 },
        ]);
        noteSceneFrame(f, { agents, pursuits: table([0, 1]), nowMs: 0, tick: 0 }, emit);
        noteSceneFrame(f, { agents, pursuits: table([0, 1]), nowMs: 4000, tick: 4000 }, emit);
        noteBite(f, 70);
        noteSceneFrame(
            f,
            { agents, pursuits: table([1]), nowMs: 4000 + ENDED_MS + 1, tick: 4000 + ENDED_MS + 1 },
            emit,
        );
        noteSceneFrame(f, { agents, pursuits: table([]), nowMs: 9000, tick: 9000 }, emit);
        const events = heard.map((h) => [h[0], h[1]]);
        expect(events).toEqual([
            [FRAME_EVENT.CHASE, 70],
            [FRAME_EVENT.CHASE, 71],
            [FRAME_EVENT.ABORT, 71],
        ]);
        expect(f.longest).toEqual({ ticks: 4000 + ENDED_MS + 1, genome: 71 });
    });

    it('skips a hunter when every slot is taken, and ignores a frame without a table', () => {
        const { f, heard, emit } = setup();
        const many = frameOf(Array.from({ length: 16 }, (_, i) => ({ x: i, y: 0, genome: 100 + i, spec: 1 })));
        f.epGenome.fill(9);
        noteSceneFrame(f, { agents: many, pursuits: table([0, 1]), nowMs: 0, tick: 0 }, emit);
        noteSceneFrame(f, { agents: many, pursuits: null, nowMs: 1, tick: 1 }, emit);
        expect(heard).toEqual([]);
    });
});

describe('refuges', () => {
    const inside = (/** @type {number} */ n, spec = 0) =>
        Array.from({ length: n }, (_, i) => ({ x: 100 + i, y: 100, genome: 10 + i, spec }));

    it('reports a refuge when prey stack into it, once until it empties', () => {
        const { f, heard, emit } = setup();
        const stacked = frameOf(inside(STACK_ENTER));
        noteSceneFrame(f, { agents: stacked, pursuits: null, nowMs: 0, tick: 0 }, emit);
        noteSceneFrame(f, { agents: stacked, pursuits: null, nowMs: CHECK_MS, tick: CHECK_MS }, emit);
        expect(heard).toEqual([[FRAME_EVENT.REFUGE, 10, 100, 100]]);
        const mid = frameOf(inside(2));
        noteSceneFrame(f, { agents: mid, pursuits: null, nowMs: CHECK_MS * 2, tick: CHECK_MS * 2 }, emit);
        noteSceneFrame(f, { agents: stacked, pursuits: null, nowMs: CHECK_MS * 3, tick: CHECK_MS * 3 }, emit);
        expect(heard).toHaveLength(1);
        noteSceneFrame(
            f,
            { agents: frameOf(inside(1)), pursuits: null, nowMs: CHECK_MS * 4, tick: CHECK_MS * 4 },
            emit,
        );
        noteSceneFrame(f, { agents: stacked, pursuits: null, nowMs: CHECK_MS * 5, tick: CHECK_MS * 5 }, emit);
        expect(heard).toHaveLength(2);
    });

    it('does not count hunters, and scans only every CHECK_MS', () => {
        const { f, heard, emit } = setup();
        noteSceneFrame(f, { agents: frameOf(inside(5, 1)), pursuits: null, nowMs: 0, tick: 0 }, emit);
        expect(heard).toEqual([]);
        noteSceneFrame(f, { agents: frameOf(inside(5)), pursuits: null, nowMs: 10, tick: 10 }, emit);
        expect(heard).toEqual([]);
        noteSceneFrame(f, { agents: frameOf(inside(5)), pursuits: null, nowMs: CHECK_MS, tick: CHECK_MS }, emit);
        expect(heard).toHaveLength(1);
    });
});

describe('the wall', () => {
    it('reports a blob that changes side, and not a new blob in the same slot', () => {
        const { f, heard, emit } = setup();
        const at = (/** @type {number} */ x, /** @type {number} */ genome) => frameOf([{ x, y: 7, genome, slot: 3 }]);
        noteSceneFrame(f, { agents: at(400, 20), pursuits: null, nowMs: 0, tick: 0 }, emit);
        noteSceneFrame(f, { agents: at(450, 20), pursuits: null, nowMs: CHECK_MS, tick: CHECK_MS }, emit);
        expect(heard).toEqual([]);
        noteSceneFrame(f, { agents: at(550, 20), pursuits: null, nowMs: CHECK_MS * 2, tick: CHECK_MS * 2 }, emit);
        expect(heard).toEqual([[FRAME_EVENT.CROSS, 20, 550, 7]]);
        noteSceneFrame(f, { agents: at(450, 21), pursuits: null, nowMs: CHECK_MS * 3, tick: CHECK_MS * 3 }, emit);
        expect(heard).toHaveLength(1);
    });

    it('reports nothing in a world without a wall', () => {
        const f = createFrameSignals();
        resetFrameSignals(f, { ...INFO, terrain: undefined });
        const heard = /** @type {number[][]} */ ([]);
        noteSceneFrame(f, { agents: frameOf([{ x: 1, y: 1, genome: 5 }]), pursuits: null, nowMs: 0, tick: 0 }, (...a) =>
            heard.push(a),
        );
        noteSceneFrame(
            f,
            { agents: frameOf([{ x: 900, y: 1, genome: 5 }]), pursuits: null, nowMs: CHECK_MS, tick: CHECK_MS },
            (...a) => heard.push(a),
        );
        expect(heard).toEqual([]);
        expect(f.refuges).toEqual([]);
    });
});

describe('resetFrameSignals', () => {
    it('forgets the pursuits and the longest, and reads the terrain and the hunting specs', () => {
        const { f, emit } = setup();
        noteSceneFrame(
            f,
            { agents: frameOf([{ x: 1, y: 1, genome: 70, spec: 1 }]), pursuits: table([0]), nowMs: 0, tick: 0 },
            emit,
        );
        f.longest.ticks = 5;
        resetFrameSignals(f, INFO);
        expect(f.epGenome.every((g) => g === 0)).toBe(true);
        expect(f.longest).toEqual({ ticks: 0, genome: 0 });
        expect([f.wallX, f.refuges.length, f.prevGenome.length, Array.from(f.canHunt)]).toEqual([500, 1, 16, [0, 1]]);
    });

    it('copes with an info that has no terrain or agent count', () => {
        const f = createFrameSignals();
        resetFrameSignals(f, {});
        expect([f.wallX, f.prevGenome.length]).toEqual([NaN, 0]);
    });
});
