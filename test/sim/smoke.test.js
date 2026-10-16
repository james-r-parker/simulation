import { describe, expect, it } from 'vitest';
import { ageSmoke, releaseSmoke } from '../../js/sim/smoke.js';
import { addAgent, addCloud } from './helpers/sense-world.js';
import { smallWorld } from './helpers/small-world.js';

const OVERRIDES = { smokeRadius: 80, smokeTicks: 10, maxClouds: 4 };

/** @returns {ReturnType<typeof smallWorld>} a 1000 x 1000 world with a 4-cloud pool */
function build() {
    return smallWorld(OVERRIDES);
}

describe('releaseSmoke', () => {
    it('centres a cloud size + smokeRadius behind the agent along its heading', () => {
        const w = build();
        const me = addAgent(w, 500, 400, 20);
        w.angle[me] = 0;
        expect(releaseSmoke(w, me)).toBe(0);
        expect([w.cloudX[0], w.cloudY[0], w.cloudTtl[0], w.cloudCount]).toEqual([400, 400, 10, 1]);
        w.angle[me] = Math.PI / 2;
        releaseSmoke(w, me);
        expect(w.cloudX[1]).toBeCloseTo(500, 4);
        expect(w.cloudY[1]).toBeCloseTo(300, 4);
    });

    it('leaves the agent just outside the cloud', () => {
        const w = build();
        const me = addAgent(w, 500, 500, 25);
        w.angle[me] = 0.7;
        releaseSmoke(w, me);
        const gap = Math.hypot(w.cloudX[0] - 500, w.cloudY[0] - 500) - w.config.smokeRadius;
        expect(gap).toBeCloseTo(25, 4);
    });

    it('clamps the centre to the world', () => {
        const w = build();
        const me = addAgent(w, 30, 990, 20);
        w.angle[me] = Math.PI / 2;
        releaseSmoke(w, me);
        expect(w.cloudX[0]).toBeCloseTo(30, 3);
        expect(w.cloudY[0]).toBeCloseTo(890, 3);
        w.angle[me] = 0;
        releaseSmoke(w, me);
        expect(w.cloudX[1]).toBe(0);
        w.angle[me] = -Math.PI / 2;
        releaseSmoke(w, me);
        expect(w.cloudY[2]).toBe(1000);
    });

    it('throws when the pool is full', () => {
        const w = build();
        const me = addAgent(w, 500, 500, 20);
        for (let i = 0; i < 4; i++) {
            releaseSmoke(w, me);
        }
        expect(() => releaseSmoke(w, me)).toThrow(/pool is full \(maxClouds 4\)/);
        expect(w.cloudCount).toBe(4);
    });
});

describe('ageSmoke', () => {
    it('takes 1 from every live cloud and leaves free entries alone', () => {
        const w = build();
        addCloud(w, 100, 100);
        addCloud(w, 200, 200);
        ageSmoke(w);
        expect(Array.from(w.cloudTtl)).toEqual([9, 9, 0, 0]);
    });

    it('removes a cloud reaching 0 by moving the last live cloud into its index', () => {
        const w = build();
        for (const x of [100, 200, 300]) {
            addCloud(w, x, x);
        }
        w.cloudTtl.set([1, 6, 4]);
        ageSmoke(w);
        expect(w.cloudCount).toBe(2);
        expect([w.cloudX[0], w.cloudX[1]]).toEqual([300, 200]);
        expect(Array.from(w.cloudTtl)).toEqual([3, 5, 0, 0]);
    });

    it('ages a moved cloud once, even when it was due to expire too', () => {
        const w = build();
        for (const x of [100, 200, 300]) {
            addCloud(w, x, x);
        }
        w.cloudTtl.set([1, 5, 1]);
        ageSmoke(w);
        expect(w.cloudCount).toBe(1);
        expect([w.cloudX[0], w.cloudTtl[0]]).toEqual([200, 4]);
        expect(Array.from(w.cloudTtl)).toEqual([4, 0, 0, 0]);
    });

    it('removes the last cloud without moving anything', () => {
        const w = build();
        addCloud(w, 100, 100);
        addCloud(w, 200, 200);
        w.cloudTtl.set([5, 1]);
        ageSmoke(w);
        expect([w.cloudCount, w.cloudX[0], w.cloudTtl[1]]).toEqual([1, 100, 0]);
    });

    it('does nothing with no clouds', () => {
        const w = build();
        ageSmoke(w);
        expect(w.cloudCount).toBe(0);
    });

    it('lets a cloud live exactly smokeTicks ticks', () => {
        const w = build();
        addCloud(w, 100, 100);
        for (let tick = 1; tick < 10; tick++) {
            ageSmoke(w);
            expect(w.cloudCount).toBe(1);
        }
        ageSmoke(w);
        expect(w.cloudCount).toBe(0);
    });
});
