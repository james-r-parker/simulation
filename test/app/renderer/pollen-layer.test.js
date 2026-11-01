import { describe, expect, it } from 'vitest';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import { createPollenPool, emitPollen, packPollen } from '../../../js/app/renderer/pollen-layer.js';
import { SNAPSHOT_FLAG } from '../../../js/sim/snapshot.js';
import { makeSnapshot } from '../helpers/snapshots.js';

const FLAG = (SNAPSHOT_FLAG.POLLEN | (4095 << SNAPSHOT_FLAG.POLLEN_HUE_SHIFT) | (1 << 16)) >>> 0;

describe('seeded pollen particles', () => {
    it('preserves unsigned hue and existing intent bits through interpolation, emitting once per interval', () => {
        const agents = createInterpolated(2);
        const snap = makeSnapshot(1, [{ slot: 0, genomeId: 42, x: 10, y: 20, flags: FLAG }]);
        interpolateInto(null, snap, 1, agents);
        expect(agents.flags[0]).toBe(FLAG);
        expect(agents.flags[0] & (1 << 16)).not.toBe(0);
        const pool = createPollenPool(2, 123, SNAPSHOT_FLAG);
        emitPollen(pool, agents, 0);
        emitPollen(pool, agents, 0);
        expect(pool.next).toBe(1);
        expect(pool.hue[0]).toBe(1);
        expect(packPollen(pool, 0)).toBe(1);
        emitPollen(pool, agents, 20);
        expect(pool.next).toBe(2);
        expect(packPollen(pool, 20)).toBe(1);
    });

    it('replays the same visual trajectory from a seed and changes direction with a different seed', () => {
        const agents = createInterpolated(1);
        interpolateInto(null, makeSnapshot(1, [{ slot: 0, genomeId: 42, flags: FLAG }]), 1, agents);
        const a = createPollenPool(1, 123, SNAPSHOT_FLAG);
        const b = createPollenPool(1, 123, SNAPSHOT_FLAG);
        const c = createPollenPool(1, 456, SNAPSHOT_FLAG);
        for (const pool of [a, b, c]) {
            emitPollen(pool, agents, 40);
        }
        expect(a.angle[0]).toBe(b.angle[0]);
        expect(a.angle[0]).not.toBe(c.angle[0]);
    });

    it('does not emit from an absent pollen flag and resets when playhead rewinds', () => {
        const agents = createInterpolated(1);
        interpolateInto(null, makeSnapshot(1, [{ slot: 0, genomeId: 42 }]), 1, agents);
        const pool = createPollenPool(1, 1, SNAPSHOT_FLAG);
        emitPollen(pool, agents, 40);
        expect(pool.next).toBe(0);
        agents.flags[0] = FLAG;
        emitPollen(pool, agents, 41);
        expect(pool.next).toBe(1);
        emitPollen(pool, agents, 0);
        expect(packPollen(pool, 0)).toBe(1);
    });
});
