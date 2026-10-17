import { describe, expect, it } from 'vitest';
import { AGENT_FIELD } from '../../../js/app/interpolate.js';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import {
    createAgentStore,
    FLASH_TICKS,
    flashOf,
    ITEM,
    JAW_RATE,
    packAgents,
} from '../../../js/app/renderer/agents-pack.js';
import { lineageColor } from '../../../js/app/renderer/colors.js';
import { smallReady } from '../helpers/ready.js';
import { makeSnapshot } from '../helpers/snapshots.js';

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
        const store = createAgentStore(16, 5, meshOfSpec);
        packAgents(agents, store, BITS, 16);
        expect(store.buckets.map((b) => b.count)).toEqual([1, 2, 0, 0, 0]);
        const b = store.buckets[1];
        expect(Array.from(b.pose.slice(0, ITEM))).toEqual([10, 20, 1.5, 30]);
        expect(Array.from(b.pose.slice(ITEM, 2 * ITEM))).toEqual([12, 22, 0, 20]);
        const rgb = lineageColor(7, 0.5);
        expect(Array.from(b.color.slice(0, 3))).toEqual(Array.from(Float32Array.from(rgb)));
        expect(b.color[3]).toBe(0.5);
        expect(b.state[0]).toBeCloseTo(0.4);
    });

    it('turns the timers and bits into flashes, a jaw and a pregnant mark', () => {
        const flags = (3 << BITS.ATE_SHIFT) | (30 << BITS.BITTEN_SHIFT) | BITS.PREGNANT;
        const agents = interp([{ slot: 0, genomeId: 1, spec: 2, flags }]);
        const store = createAgentStore(16, 5, meshOfSpec);
        packAgents(agents, store, BITS, 16);
        const b = store.buckets[2];
        expect(b.state[1]).toBeCloseTo(flashOf(3));
        expect(b.state[2]).toBe(0);
        expect(b.extra[0]).toBe(1);
    });

    it('eases the jaw open and shut by frame time, per slot', () => {
        const open = interp([{ slot: 3, genomeId: 1, spec: 1, flags: BITS.JAW_OPEN }]);
        const shut = interp([{ slot: 3, genomeId: 1, spec: 1 }]);
        const store = createAgentStore(16, 5, meshOfSpec);
        packAgents(open, store, BITS, 16);
        const first = store.buckets[1].state[3];
        expect(first).toBeGreaterThan(0.2);
        expect(first).toBeLessThan(0.5);
        for (let i = 0; i < 60; i++) {
            packAgents(open, store, BITS, 16);
        }
        expect(store.buckets[1].state[3]).toBeGreaterThan(0.99);
        packAgents(shut, store, BITS, 1000 / JAW_RATE);
        expect(store.buckets[1].state[3]).toBeLessThan(0.5);
    });

    it('skips an unknown specialisation and resets counts each call', () => {
        const store = createAgentStore(16, 5, meshOfSpec);
        packAgents(interp([{ slot: 0, genomeId: 1, spec: 9 }]), store, BITS, 16);
        expect(store.buckets.every((b) => b.count === 0)).toBe(true);
        packAgents(interp([{ slot: 0, genomeId: 1, spec: 3 }]), store, BITS, 16);
        packAgents(interp([]), store, BITS, 16);
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
        );
        packAgents(out, store, layout.flags, 16);
        const total = store.buckets.reduce((n, b) => n + b.count, 0);
        expect(total).toBe(out.count);
        expect(total).toBeGreaterThan(0);
        expect(AGENT_FIELD.FLAGS).toBe(11);
    });
});
