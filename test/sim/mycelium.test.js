import { describe, expect, it } from 'vitest';
import { addMyceliumMark, ageMycelium, assertMycelium, pickMark, MYCELIUM_ARRAYS } from '../../js/sim/mycelium.js';
import { testPolicy } from './helpers/test-policy.js';
import { smallWorld } from './helpers/small-world.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { spawnFoodItem } from '../../js/sim/spawn.js';
import { reap } from '../../js/sim/population.js';
import { allocBody } from './helpers/body.js';

const BODY = { x: 500, y: 500, size: 25 };

describe('mycelium', () => {
    it('leaves a mark when an agent dies', () => {
        const w = smallWorld();
        const slot = allocBody(w);
        w.x[slot] = BODY.x;
        w.y[slot] = BODY.y;
        w.size[slot] = BODY.size;
        w.energy[slot] = 0;
        reap(w, testPolicy);
        expect(w.myceliumX[0]).toBe(500);
        expect(w.myceliumY[0]).toBe(500);
        expect(w.myceliumSize[0]).toBe(25);
        expect(w.myceliumTicks[0]).toBe(w.config.myceliumLife);
    });

    it('replaces the fewest ticks left and breaks ties by slot order', () => {
        const w = smallWorld({ myceliumMax: 2 });
        addMyceliumMark(w, BODY);
        addMyceliumMark(w, { ...BODY, x: 600 });
        w.myceliumTicks[1]--;
        addMyceliumMark(w, { ...BODY, x: 700 });
        expect(Array.from(w.myceliumX)).toEqual([500, 700]);
        addMyceliumMark(w, { ...BODY, x: 800 });
        expect(Array.from(w.myceliumX)).toEqual([800, 700]);
    });

    it('counts down and zeroes a mark at expiry', () => {
        const w = smallWorld({ myceliumLife: 2 });
        addMyceliumMark(w, BODY);
        ageMycelium(w);
        expect(w.myceliumTicks[0]).toBe(1);
        ageMycelium(w);
        for (const name of MYCELIUM_ARRAYS) {
            expect(w[name][0]).toBe(0);
        }
        expect(() => assertMycelium(w)).not.toThrow();
    });

    it('retains a summer death through the start of the next fungal window', () => {
        const w = smallWorld();
        addMyceliumMark(w, BODY);
        const wait = Math.ceil((0.62 - 0.3) * 144000);
        for (let i = 0; i < wait; i++) {
            ageMycelium(w);
        }
        expect(w.myceliumTicks[0]).toBe(w.config.myceliumLife - wait);
    });

    it('picks marks by size and returns -1 for an empty pool', () => {
        const w = smallWorld({ myceliumMax: 2 });
        expect(pickMark(w)).toBe(-1);
        addMyceliumMark(w, { ...BODY, size: 1 });
        addMyceliumMark(w, { ...BODY, size: 3 });
        let second = 0;
        for (let i = 0; i < 1000; i++) {
            second += pickMark(w) === 1 ? 1 : 0;
        }
        expect(second / 1000).toBeCloseTo(0.75, 1);
    });

    it('hashes every mark field and replays deterministically', () => {
        const a = smallWorld();
        const b = smallWorld();
        addMyceliumMark(a, BODY);
        addMyceliumMark(b, BODY);
        expect(hashWorld(a)).toBe(hashWorld(b));
        for (const name of MYCELIUM_ARRAYS) {
            const before = hashWorld(a);
            a[name][0]++;
            expect(hashWorld(a), name).not.toBe(before);
            a[name][0]--;
        }
    });

    it('rejects a live mark outside the world and a dirty free slot', () => {
        const w = smallWorld();
        addMyceliumMark(w, { ...BODY, x: -1 });
        expect(() => assertMycelium(w)).toThrow('mycelium');
        w.myceliumTicks[0] = 0;
        expect(() => assertMycelium(w)).toThrow('mycelium');
    });
});
