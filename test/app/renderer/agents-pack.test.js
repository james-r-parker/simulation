import { ENERGY_FLOOR, lineageColor } from '../../../js/app/renderer/colors.js';
import { describe, expect, it } from 'vitest';
import { AGENT_FIELD } from '../../../js/app/interpolate.js';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import {
    createAgentStore,
    FLASH_TICKS,
    flashOf,
    ITEM,
    JAW_RATE,
    motionOf,
    MESH_GAIN,
    packAgents,
    TURN_FULL,
} from '../../../js/app/renderer/agents-pack.js';
import { fitZoom, snapZoom } from '../../../js/app/camera.js';
import { assignSlots, createFamilySlots } from '../../../js/app/family-slots.js';
import { familyColor } from '../../../js/app/renderer/colors.js';
import { minPxTable } from '../../../js/app/display-size.js';
import { smallReady } from '../helpers/ready.js';
import { makeSnapshot } from '../helpers/snapshots.js';

/** Minimum drawn widths per mesh: the first mesh is a hunter. */
const MIN_PX = [16, 12, 12, 12, 12];
/** Family slots where lineage 7 holds the first colour. */
const SLOTS = createFamilySlots();
assignSlots(SLOTS, [{ id: 7 }]);
const BITS = { ATE_SHIFT: 0, BITTEN_SHIFT: 5, TIMER_MASK: 31, JAW_OPEN: 1 << 10, PREGNANT: 1 << 13 };

/**
 * @param {import('../helpers/snapshots.js').AgentSpec[]} agents agents
 * @returns {import('../../../js/app/interpolate.js').Interpolated} their blended form
 */
function interp(agents) {
    const out = createInterpolated(16);
    interpolateInto(null, makeSnapshot(1, agents), 1, out);
    return out;
}

describe('flashOf', () => {
    it('is 1 just after the event and 0 from FLASH_TICKS on', () => {
        expect(flashOf(0)).toBe(1);
        expect(flashOf(FLASH_TICKS / 2)).toBe(0.5);
        expect(flashOf(FLASH_TICKS)).toBe(0);
        expect(flashOf(30)).toBe(0);
    });
});

describe('packAgents', () => {
    const meshOfSpec = [0, 1, 2, 3, 4];

    it('puts each agent in its specialisation bucket with pose, lineage colour and state', () => {
        const agents = interp([
            {
                slot: 0,
                genomeId: 1,
                spec: 1,
                x: 10,
                y: 20,
                angle: 1.5,
                size: 30,
                energy: 0.5,
                lineageId: 7,
                temperature: 0.4,
            },
            { slot: 1, genomeId: 2, spec: 0, x: 11, y: 21 },
            { slot: 2, genomeId: 3, spec: 1, x: 12, y: 22 },
        ]);
        const store = createAgentStore(16, 5, meshOfSpec, MIN_PX);
        packAgents(agents, store, BITS, { dtMs: 16, zoom: 1, slots: SLOTS });
        expect(store.buckets.map((b) => b.count)).toEqual([1, 2, 0, 0, 0]);
        const b = store.buckets[1];
        expect(Array.from(b.pose.slice(0, ITEM))).toEqual([10, 20, 1.5, 30]);
        expect(Array.from(b.pose.slice(ITEM, 2 * ITEM))).toEqual([12, 22, 0, 20]);
        const rgb = familyColor(SLOTS, 7, 0.5);
        expect(Array.from(b.color.slice(0, 3))).toEqual(Array.from(Float32Array.from(rgb)));
        expect(b.color[3]).toBe(0.5);
        expect(b.state[0]).toBeCloseTo(0.4);
    });

    it('marks an agent of a family without a colour slot as neutral', () => {
        const store = createAgentStore(16, 5, meshOfSpec, MIN_PX);
        const agents = interp([
            { slot: 0, genomeId: 1, spec: 1, lineageId: 7 },
            { slot: 1, genomeId: 2, spec: 1, lineageId: 99 },
        ]);
        packAgents(agents, store, BITS, { dtMs: 16, zoom: 1, slots: SLOTS });
        const { extra } = store.buckets[1];
        expect([extra[1], extra[ITEM + 1]]).toEqual([0, 1]);
    });

    it('turns the timers and bits into flashes, a jaw and a pregnant mark', () => {
        const flags = (3 << BITS.ATE_SHIFT) | (30 << BITS.BITTEN_SHIFT) | BITS.PREGNANT;
        const agents = interp([{ slot: 0, genomeId: 1, spec: 2, flags }]);
        const store = createAgentStore(16, 5, meshOfSpec, MIN_PX);
        packAgents(agents, store, BITS, { dtMs: 16, zoom: 1, slots: SLOTS });
        const b = store.buckets[2];
        expect(b.state[1]).toBeCloseTo(flashOf(3));
        expect(b.state[2]).toBe(0);
        expect(b.extra[0]).toBe(1);
    });

    it('eases the jaw open and shut by frame time, per slot', () => {
        const open = interp([{ slot: 3, genomeId: 1, spec: 1, flags: BITS.JAW_OPEN }]);
        const shut = interp([{ slot: 3, genomeId: 1, spec: 1 }]);
        const store = createAgentStore(16, 5, meshOfSpec, MIN_PX);
        packAgents(open, store, BITS, { dtMs: 16, zoom: 1, slots: SLOTS });
        const first = store.buckets[1].state[3];
        expect(first).toBeGreaterThan(0.2);
        expect(first).toBeLessThan(0.5);
        for (let i = 0; i < 60; i++) {
            packAgents(open, store, BITS, { dtMs: 16, zoom: 1, slots: SLOTS });
        }
        expect(store.buckets[1].state[3]).toBeGreaterThan(0.99);
        packAgents(shut, store, BITS, { dtMs: 1000 / JAW_RATE, zoom: 1, slots: SLOTS });
        expect(store.buckets[1].state[3]).toBeLessThan(0.5);
    });

    it('skips an unknown specialisation and resets counts each call', () => {
        const store = createAgentStore(16, 5, meshOfSpec, MIN_PX);
        packAgents(interp([{ slot: 0, genomeId: 1, spec: 9 }]), store, BITS, { dtMs: 16, zoom: 1, slots: SLOTS });
        expect(store.buckets.every((b) => b.count === 0)).toBe(true);
        packAgents(interp([{ slot: 0, genomeId: 1, spec: 3 }]), store, BITS, { dtMs: 16, zoom: 1, slots: SLOTS });
        packAgents(interp([]), store, BITS, { dtMs: 16, zoom: 1, slots: SLOTS });
        expect(store.buckets.every((b) => b.count === 0)).toBe(true);
    });

    it('packs a real world snapshot from the worker layout', () => {
        const { info, layout, snapshot } = smallReady(30);
        const out = createInterpolated(info.maxAgents);
        interpolateInto(null, snapshot, 1, out);
        const store = createAgentStore(
            info.maxAgents,
            info.specs.length,
            info.specs.map((/** @type {any} */ s) => s.index),
            minPxTable(info),
        );
        packAgents(out, store, layout.flags, { dtMs: 16, zoom: 1, slots: SLOTS });
        const total = store.buckets.reduce((n, b) => n + b.count, 0);
        expect(total).toBe(out.count);
        expect(total).toBeGreaterThan(0);
        expect(AGENT_FIELD.FLAGS).toBe(11);
    });

    it('draws a small agent at its minimum width: a hunter at 16 px, the others at 12', () => {
        const store = createAgentStore(16, 5, meshOfSpec, MIN_PX);
        const tiny = interp([
            { slot: 0, genomeId: 1, spec: 0, size: 1 },
            { slot: 1, genomeId: 2, spec: 1, size: 1 },
            { slot: 2, genomeId: 3, spec: 2, size: 40 },
        ]);
        packAgents(tiny, store, BITS, { dtMs: 16, zoom: 0.5, slots: SLOTS });
        expect(store.buckets[0].pose[3]).toBe(16);
        expect(store.buckets[1].pose[3]).toBe(12);
        expect(store.buckets[2].pose[3]).toBe(40);
    });

    it('draws every hunter at least 16 px across at the fit zoom on 3840 and 2560 wide canvases', () => {
        const { info } = smallReady();
        const minPx = minPxTable(info);
        const hunters = info.specs
            .map((/** @type {any} */ s, /** @type {number} */ i) => (s.canHunt ? i : -1))
            .filter((/** @type {number} */ i) => i >= 0);
        expect(hunters.length).toBeGreaterThan(0);
        for (const [width, height] of [
            [3840, 2160],
            [2560, 1440],
        ]) {
            for (const world of [
                { width: 7680, height: 4320 },
                { width: 11520, height: 6480 },
                { width: 14400, height: 8100 },
            ]) {
                const zoom = snapZoom(fitZoom({ width, height }, world));
                const store = createAgentStore(
                    4,
                    info.specs.length,
                    info.specs.map((/** @type {any} */ s) => s.index),
                    minPx,
                );
                const list = hunters.map((/** @type {number} */ spec, /** @type {number} */ k) => ({
                    slot: k,
                    genomeId: k + 1,
                    spec: info.specs[spec].index,
                    size: 2,
                }));
                packAgents(interp(list), store, BITS, { dtMs: 16, zoom, slots: SLOTS });
                for (const bucket of store.buckets) {
                    for (let k = 0; k < bucket.count; k++) {
                        expect(bucket.pose[k * ITEM + 3] * 2 * zoom).toBeGreaterThanOrEqual(16 - 1e-4);
                    }
                }
            }
        }
    });

    it('motionOf clamps, 25% smoothing converges, and phase is stable in [0, 1)', () => {
        const m1 = motionOf(2.0, 0.5, 0, 42);
        expect(m1.speed01).toBe(1.0);
        expect(m1.turn01).toBe(0.25);
        const { phase: phase1, turn01: turn1 } = m1;
        expect(phase1).toBeGreaterThanOrEqual(0);
        expect(phase1).toBeLessThan(1);

        const mClamped = motionOf(-0.5, -0.5, 0, 42);
        expect(mClamped.speed01).toBe(0);
        expect(mClamped.turn01).toBe(0.25);

        const m2 = motionOf(0.5, 0.1, turn1, 42);
        expect(m2.speed01).toBe(0.5);
        expect(m2.phase).toBe(phase1);
        expect(motionOf(1, 0, 0, 7)).toBe(m2);

        let smoothed = 0;
        for (let i = 0; i < 40; i++) {
            const m = motionOf(0.5, 0.1, smoothed, 42);
            smoothed = m.turn01;
        }
        expect(smoothed).toBeCloseTo(0.1 / TURN_FULL, 4);
    });

    it('packAgents writes motion attributes and reuses the same buffer', () => {
        const store = createAgentStore(16, 5, meshOfSpec, MIN_PX);
        const prev = makeSnapshot(1, [{ slot: 0, genomeId: 10, spec: 1, speed: 2, angle: 0 }]);
        const next = makeSnapshot(2, [{ slot: 0, genomeId: 10, spec: 1, speed: 2, angle: 0.1 }]);
        const out = createInterpolated(16);
        interpolateInto(prev, next, 0.5, out);
        packAgents(out, store, BITS, { dtMs: 16, zoom: 1, slots: SLOTS });
        const b = store.buckets[1];
        const motionArr = b.motion;
        expect(motionArr[0]).toBeGreaterThan(0);
        expect(motionArr[1]).toBeGreaterThan(0);
        packAgents(out, store, BITS, { dtMs: 16, zoom: 1, slots: SLOTS });
        expect(store.buckets[1].motion).toBe(motionArr);
    });

    it('gives an unslotted family its lineage hue and the predator a brighter body, and leaves slotted ones alone', () => {
        expect(MESH_GAIN[0]).toBeGreaterThan(MESH_GAIN[1]);
        const store = createAgentStore(16, 5, meshOfSpec, MIN_PX);
        const snap = makeSnapshot(1, [
            { slot: 0, genomeId: 10, spec: 0, speed: 0, angle: 0, lineageId: 3 },
            { slot: 1, genomeId: 11, spec: 3, speed: 0, angle: 0, lineageId: 4 },
        ]);
        const out = createInterpolated(16);
        interpolateInto(null, snap, 1, out);
        packAgents(out, store, BITS, { dtMs: 16, zoom: 1, slots: SLOTS });
        const a = store.buckets[meshOfSpec[0]].color;
        const b = store.buckets[meshOfSpec[3]].color;
        const expectA = lineageColor(3);
        const expectB = lineageColor(4);
        const k = ENERGY_FLOOR + (1 - ENERGY_FLOOR) * out.energy[0];
        expect(a[0]).toBeCloseTo(expectA[0] * k * MESH_GAIN[0], 4);
        expect(b[2]).toBeCloseTo(expectB[2] * (ENERGY_FLOOR + (1 - ENERGY_FLOOR) * out.energy[1]), 4);
    });
});
