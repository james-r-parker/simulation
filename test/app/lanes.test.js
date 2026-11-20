import { describe, expect, it } from 'vitest';
import { createInterpolated } from '../../js/app/interpolate.js';
import { alignUp, createLanes, plainLane } from '../../js/app/lanes.js';
import { createBodyTweens } from '../../js/app/renderer/body-tweens.js';
import { createDents } from '../../js/app/renderer/dents.js';
import { createDying } from '../../js/app/renderer/dying.js';

describe('createLanes', () => {
    it('carves lanes one after another, each starting 8-byte aligned', () => {
        const memory = new SharedArrayBuffer(256);
        const lanes = createLanes(memory, 4);
        const a = lanes.alloc(Uint8Array, 3);
        const b = lanes.alloc(Float64Array, 2);
        const c = lanes.alloc(Int32Array, 5);
        expect([a.byteOffset, b.byteOffset, c.byteOffset]).toEqual([8, 16, 32]);
        expect(a.buffer).toBe(memory);
        expect(lanes.end()).toBe(56);
        b[0] = 1.5;
        expect(new Float64Array(memory, 16, 1)[0]).toBe(1.5);
    });

    it('measures when it has no memory, and the measure is what the real carve takes', () => {
        const measure = createLanes(null);
        createInterpolated(10, measure.alloc);
        createDents(10, measure.alloc);
        createBodyTweens(10, measure.alloc);
        createDying(10, measure.alloc);
        const memory = new SharedArrayBuffer(measure.end());
        const real = createLanes(memory);
        createInterpolated(10, real.alloc);
        createDents(10, real.alloc);
        createBodyTweens(10, real.alloc);
        createDying(10, real.alloc);
        expect(real.end()).toBe(measure.end());
    });

    it('rounds sizes up to 8 and plain lanes are ordinary arrays', () => {
        expect(alignUp(0)).toBe(0);
        expect(alignUp(9)).toBe(16);
        expect(plainLane(Float32Array, 3)).toHaveLength(3);
        expect(plainLane(Float32Array, 3).buffer).not.toBeInstanceOf(SharedArrayBuffer);
    });

    it('puts the dying pool and the interpolated agents in the shared memory, `previous` aside', () => {
        const memory = new SharedArrayBuffer(1 << 16);
        const lanes = createLanes(memory);
        const agents = createInterpolated(4, lanes.alloc);
        const dying = createDying(4, lanes.alloc);
        expect(agents.x.buffer).toBe(memory);
        expect(agents.state.buffer).toBe(memory);
        expect(agents.previous.buffer).not.toBe(memory);
        expect(dying.head.buffer).toBe(memory);
        expect(dying.pose[6].buffer).toBe(memory);
    });
});
